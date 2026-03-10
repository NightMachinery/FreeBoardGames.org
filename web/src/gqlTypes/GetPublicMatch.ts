/* tslint:disable */
/* eslint-disable */
// @generated
// This file was automatically generated and should not be edited.

// ====================================================
// GraphQL query operation: GetPublicMatch
// ====================================================

export interface GetPublicMatch_publicMatch_playerMemberships_user {
  __typename: "User";
  id: number | null;
  nickname: string;
}

export interface GetPublicMatch_publicMatch_playerMemberships {
  __typename: "MatchMembership";
  isCreator: boolean;
  user: GetPublicMatch_publicMatch_playerMemberships_user;
}

export interface GetPublicMatch_publicMatch {
  __typename: "Match";
  gameCode: string;
  bgioServerUrl: string;
  bgioMatchId: string;
  bgioSecret: string | null;
  bgioPlayerId: string | null;
  playerMemberships: GetPublicMatch_publicMatch_playerMemberships[];
}

export interface GetPublicMatch {
  publicMatch: GetPublicMatch_publicMatch;
}

export interface GetPublicMatchVariables {
  matchId: string;
}
