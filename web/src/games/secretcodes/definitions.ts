export enum TeamColor {
  Blue = 'blue',
  Red = 'red',
}

export interface Team {
  color: TeamColor;
  playersID: string[];
  spymasterIDs: string[];
  representativeIDs: string[];
}

export enum CardColor {
  civilian = 'civilian',
  blue = 'blue',
  red = 'red',
  assassin = 'assassin',
}

export interface Card {
  word: string;
  /**
   * Indicates which team the card belongs to, if any. Absent if the player
   * has not revealed this card yet.
   */
  color?: CardColor;
  revealed: boolean;
}

export interface IG {
  teams: Team[];
  cards: Card[];
  hostPlayerID: string;
  currentTeamIndex?: number;
  /**
   * The index of the last card selected by any team. Null at the beggining of
   * the round.
   */
  lastSelectedCardIndex: null | number;
  lastSelectedCardTeamColor: null | TeamColor;
}

export enum Phases {
  lobby = 'lobby',
  guess = 'guess',
}
