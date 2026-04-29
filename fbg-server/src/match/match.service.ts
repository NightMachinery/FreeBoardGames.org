import {
  Injectable,
  HttpException,
  HttpStatus,
  HttpService,
} from '@nestjs/common';
import { MatchEntity } from '../match/db/Match.entity';
import { MatchMembershipEntity } from '../match/db/MatchMembership.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Connection, QueryRunner } from 'typeorm';
import { Match } from './gql/Match.gql';
import { matchEntityToMatch, getBgioServerUrl } from './MatchUtil';
import { roomEntityToRoom } from '../rooms/RoomUtil';
import { RoomsService } from '../rooms/rooms.service';
import { RoomEntity } from '../rooms/db/Room.entity';
import { RoomMembershipEntity } from '../rooms/db/RoomMembership.entity';
import shortid from 'shortid';
import { inTransaction } from '../util/TypeOrmUtil';
import { getMinPlayersForGame } from '../rooms/gameMetadata';

@Injectable()
export class MatchService {
  constructor(
    @InjectRepository(MatchEntity)
    private matchRepository: Repository<MatchEntity>,
    private roomsService: RoomsService,
    private connection: Connection,
    private httpService: HttpService,
  ) {}

  /** Gets match information for a given user, or spectator-safe information when userId is omitted. */
  async getMatch(matchId: string, userId?: number): Promise<Match> {
    const entity = await this.getMatchEntity(matchId);
    return matchEntityToMatch(entity, userId);
  }

  /** Gets a MatchEntity with players populated. */
  async getMatchEntity(matchId: string): Promise<MatchEntity> {
    const matchEntity = await this.matchRepository.findOne({
      where: { id: matchId },
      relations: [
        'playerMemberships',
        'playerMemberships.user',
        'room',
        'room.userMemberships',
        'room.userMemberships.user',
        'nextRoom',
      ],
    });

    if (!matchEntity) {
      throw new HttpException(
        `Match id "${matchId}" does not exist`,
        HttpStatus.NOT_FOUND,
      );
    }
    return matchEntity;
  }

  /** Gets next room players should go if they want to play again. */
  async getNextRoom(matchId: string, userId?: number): Promise<string> {
    return inTransaction(this.connection, async (queryRunner) => {
      const entity = await this.getMatchEntity(matchId);
      if (userId !== undefined) {
        const membership = entity.playerMemberships.find(
          (m) => m.user.id === userId,
        );
        if (!membership) {
          throw new HttpException(
            'You need to be a player in order to play again',
            HttpStatus.BAD_REQUEST,
          );
        }
      }
      if (entity.nextRoom) {
        return entity.nextRoom.id;
      }
      const creatorMembership = entity.room.userMemberships.find(
        (roomMembership) => roomMembership.isCreator,
      );
      if (!creatorMembership) {
        throw new HttpException(
          'Match room is missing a creator',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      const room = await this.roomsService.newRoom(
        { ...roomEntityToRoom(entity.room), isPublic: false },
        creatorMembership.user.id,
        queryRunner,
      );
      entity.nextRoom = room;
      await queryRunner.manager.save(MatchEntity, entity);
      return room.id;
    });
  }

  /** Starts a new match given a room. */
  public async startMatch(
    roomId: string,
    userId: number,
    shuffleUsers?: boolean,
    setupData?: string,
  ): Promise<string> {
    return await inTransaction(this.connection, async (queryRunner) => {
      const room = await this.roomsService.getRoomEntity(roomId);
      const userMembership = room.userMemberships.find(
        (membership) => membership.user.id === userId,
      );
      if (!userMembership || !userMembership.isCreator) {
        throw new HttpException(
          'You must be the creator of the room',
          HttpStatus.BAD_REQUEST,
        );
      }
      const joinedPlayers = room.userMemberships.length;
      const minPlayers = getMinPlayersForGame(room.gameCode, room.capacity);
      if (joinedPlayers < minPlayers) {
        throw new HttpException('Not enough players', HttpStatus.BAD_REQUEST);
      }
      if (room.capacity !== joinedPlayers) {
        room.capacity = joinedPlayers;
        await queryRunner.manager.save(room);
      }
      return await this.createMatch(queryRunner, room, shuffleUsers, setupData);
    });
  }

  private async createMatch(
    queryRunner: QueryRunner,
    room: RoomEntity,
    shuffleUsers?: boolean,
    setupData?: string,
  ): Promise<string> {
    const memberships = room.userMemberships.slice();
    if (shuffleUsers) {
      shuffleArray(memberships);
    } else {
      memberships.sort((m1, m2) => m1.position - m2.position);
    }
    const creatorPlayerID = memberships.findIndex(
      (membership) => membership.isCreator,
    );
    const mergedSetupData = mergeSetupData(setupData, {
      hostPlayerID: creatorPlayerID >= 0 ? `${creatorPlayerID}` : '0',
    });
    const bgioServerUrl = getBgioServerUrl();
    const bgioMatchId = await this.createBgioMatch(
      bgioServerUrl.internal,
      room,
      mergedSetupData,
    );
    const id = shortid.generate();
    const newMatch = new MatchEntity();
    newMatch.id = id;
    newMatch.room = room;
    newMatch.gameCode = room.gameCode;
    newMatch.bgioServerInternalUrl = bgioServerUrl.internal;
    newMatch.bgioServerExternalUrl = bgioServerUrl.external;
    newMatch.bgioMatchId = bgioMatchId;
    await queryRunner.manager.insert(MatchEntity, newMatch);
    let index = 0;
    for (const userMembership of memberships) {
      // These requests to BGIO server need to be in serial b/c of race condition inside it.
      const matchMembership = await this.roomToMatchMembership(
        userMembership,
        newMatch,
        index,
      );
      await queryRunner.manager.insert(MatchMembershipEntity, matchMembership);
      index++;
    }
    room.match = newMatch;
    await queryRunner.manager.save(room);
    await this.roomsService.notifyRoomUpdate(room);
    return id;
  }

  private async createBgioMatch(
    bgioServerUrl: string,
    room: RoomEntity,
    rawSetupData?: string,
  ): Promise<string> {
    const setupData = rawSetupData ? JSON.parse(rawSetupData) : undefined;
    const response = await this.httpService
      .post(`${bgioServerUrl}/games/${room.gameCode}/create`, {
        numPlayers: room.capacity,
        setupData,
      })
      .toPromise();
    return response.data.matchID;
  }

  private async roomToMatchMembership(
    roomMembership: RoomMembershipEntity,
    match: MatchEntity,
    playerID: number,
  ): Promise<MatchMembershipEntity> {
    const newMembership = new MatchMembershipEntity();
    newMembership.bgioSecret = await this.joinBgioMatch(
      roomMembership,
      match,
      playerID,
    );
    newMembership.user = roomMembership.user;
    newMembership.match = match;
    newMembership.bgioPlayerId = playerID;
    return newMembership;
  }

  private async joinBgioMatch(
    roomMembership: RoomMembershipEntity,
    match: MatchEntity,
    playerID: number,
  ): Promise<string> {
    const response = await this.httpService
      .post(
        `${match.bgioServerInternalUrl}/games/${match.gameCode}/${match.bgioMatchId}/join`,
        { playerID, playerName: roomMembership.user.nickname },
      )
      .toPromise();
    return response.data.playerCredentials;
  }
}

function shuffleArray(array: any[]) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function mergeSetupData(
  rawSetupData: string | undefined,
  extraSetupData: Record<string, unknown>,
): string | undefined {
  const parsedSetupData = rawSetupData ? JSON.parse(rawSetupData) : {};
  return JSON.stringify({ ...parsedSetupData, ...extraSetupData });
}
