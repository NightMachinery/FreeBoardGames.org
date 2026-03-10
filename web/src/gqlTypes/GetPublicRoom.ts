/* tslint:disable */
/* eslint-disable */
// @generated
// This file was automatically generated and should not be edited.

// ====================================================
// GraphQL query operation: GetPublicRoom
// ====================================================

export interface GetPublicRoom_publicRoom_userMemberships_user {
  __typename: "User";
  id: number | null;
  nickname: string;
}

export interface GetPublicRoom_publicRoom_userMemberships {
  __typename: "RoomMembership";
  isCreator: boolean;
  position: number;
  user: GetPublicRoom_publicRoom_userMemberships_user;
}

export interface GetPublicRoom_publicRoom {
  __typename: "Room";
  gameCode: string;
  matchId: string | null;
  userMemberships: GetPublicRoom_publicRoom_userMemberships[];
}

export interface GetPublicRoom {
  publicRoom: GetPublicRoom_publicRoom;
}

export interface GetPublicRoomVariables {
  roomId: string;
}
