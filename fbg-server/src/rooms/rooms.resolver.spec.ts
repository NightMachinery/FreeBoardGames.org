import { Test, TestingModule } from '@nestjs/testing';
import { RoomsResolver } from './rooms.resolver';
import { RoomsModule } from './rooms.module';
import { MatchModule } from '../match/match.module';
import { UsersModule } from '../users/users.module';
import { FakeDbModule } from '../testing/dbUtil';
import { UsersService } from '../users/users.service';
import { RoomsService } from './rooms.service';

describe('Rooms Resolver', () => {
  let resolver: RoomsResolver;
  let usersService: UsersService;
  let roomsService: RoomsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [FakeDbModule, RoomsModule, MatchModule, UsersModule],
    }).compile();

    resolver = module.get<RoomsResolver>(RoomsResolver);
    usersService = module.get<UsersService>(UsersService);
    roomsService = module.get<RoomsService>(RoomsService);
  });

  it('should be defined', () => {
    expect(resolver).toBeDefined();
  });

  it('should expose public room metadata without joining the room', async () => {
    const bobId = await usersService.newUser({ nickname: 'bob' });
    const room = await roomsService.newRoom(
      {
        capacity: 2,
        gameCode: 'secretcodes',
        isPublic: false,
      },
      bobId,
    );

    const publicRoom = await resolver.publicRoom(room.id);

    expect(publicRoom).toMatchObject({
      gameCode: 'secretcodes',
      matchId: undefined,
      userMemberships: [{ user: { nickname: 'bob' }, isCreator: true, position: 1 }],
    });
    expect(publicRoom.userId).toBeUndefined();
  });
});
