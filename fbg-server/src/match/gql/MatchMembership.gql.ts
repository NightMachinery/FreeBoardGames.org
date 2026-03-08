import { ObjectType } from '@nestjs/graphql';
import { User } from '../../users/gql/User.gql';

@ObjectType()
export class MatchMembership {
  isCreator: boolean;
  user: User;
}
