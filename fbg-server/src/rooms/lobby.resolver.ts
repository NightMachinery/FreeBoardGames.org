import { Resolver, Query, Subscription } from '@nestjs/graphql';
import { Inject, UseFilters } from '@nestjs/common';
import { Lobby } from './gql/Lobby.gql';
import { PubSub } from 'graphql-subscriptions';
import { LobbyService } from './lobby.service';
import { lobbyToGql } from './RoomUtil';
import { Room } from './gql/Room.gql';
import { FBG_PUB_SUB } from '../internal/FbgPubSubModule';
import { GraphQLHttpExceptionFilter } from '../internal/gql/GraphQLHttpExceptionFilter';

@Resolver(() => Lobby)
@UseFilters(GraphQLHttpExceptionFilter)
export class LobbyResolver {
  constructor(private lobbyService: LobbyService, @Inject(FBG_PUB_SUB) private pubSub: PubSub) {}

  @Query(() => Lobby)
  async lobby(): Promise<{ rooms: Room[] }> {
    return { rooms: lobbyToGql(await this.lobbyService.getLobby()) };
  }

  @Subscription(() => Lobby)
  lobbyMutated(): AsyncIterator<unknown, any, undefined> {
    return this.pubSub.asyncIterator('lobby');
  }
}
