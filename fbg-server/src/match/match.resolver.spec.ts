import { Test, TestingModule } from '@nestjs/testing';
import { MatchResolver } from './match.resolver';
import { MatchModule } from './match.module';
import { RoomsModule } from '../rooms/rooms.module';
import { UsersModule } from '../users/users.module';
import { FakeDbModule } from '../testing/dbUtil';
import { MatchService } from './match.service';
import { UsersService } from '../users/users.service';
import { RoomsService } from '../rooms/rooms.service';
import { HttpService } from '@nestjs/common';

describe('Match Resolver', () => {
  let resolver: MatchResolver;
  let matchService: MatchService;
  let usersService: UsersService;
  let roomsService: RoomsService;
  let httpService: HttpService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [FakeDbModule, UsersModule, RoomsModule, MatchModule],
    }).compile();

    resolver = module.get<MatchResolver>(MatchResolver);
    matchService = module.get<MatchService>(MatchService);
    usersService = module.get<UsersService>(UsersService);
    roomsService = module.get<RoomsService>(RoomsService);
    httpService = module.get<HttpService>(HttpService);
  });

  it('should be defined', () => {
    expect(resolver).toBeDefined();
  });

  it('should expose a spectator-safe public match', async () => {
    const promiseMock = jest
      .fn()
      .mockReturnValueOnce(Promise.resolve({ data: { matchID: 'bgioGameId' } }))
      .mockReturnValueOnce(
        Promise.resolve({ data: { playerCredentials: '1stSecret' } }),
      )
      .mockReturnValueOnce(
        Promise.resolve({ data: { playerCredentials: '2ndSecret' } }),
      );
    jest
      .spyOn(httpService, 'post')
      .mockReturnValue({ toPromise: promiseMock } as any);
    const bobId = await usersService.newUser({ nickname: 'bob' });
    const room = await roomsService.newRoom(
      {
        capacity: 2,
        gameCode: 'secretcodes',
        isPublic: false,
      },
      bobId,
    );
    const aliceId = await usersService.newUser({ nickname: 'alice' });
    await roomsService.joinRoom(aliceId, room.id);
    const matchId = await matchService.startMatch(room.id, bobId);

    const match = await resolver.publicMatch(matchId);

    expect(match.bgioSecret).toBeUndefined();
    expect(match.bgioPlayerId).toBeUndefined();
    expect(match.playerMemberships).toHaveLength(2);
  });
});
