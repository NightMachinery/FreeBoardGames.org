import { IG, TeamColor, Team, CardColor, Card } from './definitions';
import { INVALID_MOVE } from 'boardgame.io/core';
import { Ctx } from 'boardgame.io';

export function switchTeam(G: IG, ctx: Ctx, teamColor: TeamColor) {
  const actingPlayerID = getActingPlayerID(ctx);
  const oldTeam = getPlayerTeam(G, actingPlayerID);
  const newTeam = getTeamByColor(G, teamColor);

  if (typeof oldTeam !== 'undefined') {
    if (oldTeam.color === teamColor) return;

    oldTeam.spymasterIDs = oldTeam.spymasterIDs.filter((id) => id !== actingPlayerID);
    oldTeam.representativeIDs = oldTeam.representativeIDs.filter((id) => id !== actingPlayerID);
    oldTeam.playersID = oldTeam.playersID.filter((id) => id !== actingPlayerID);
  }

  newTeam.playersID.push(actingPlayerID);
}

export function toggleSpymaster(G: IG, ctx: Ctx, playerID: string) {
  const team = getPlayerTeam(G, playerID);
  const pID = parseInt(playerID);
  if (!isHostPlayer(G, ctx) || pID < 0 || pID >= ctx.numPlayers || !team) {
    return INVALID_MOVE;
  }

  if (team.spymasterIDs.includes(playerID)) {
    team.spymasterIDs = team.spymasterIDs.filter((id) => id !== playerID);
    return;
  }

  team.representativeIDs = team.representativeIDs.filter((id) => id !== playerID);
  team.spymasterIDs = [...team.spymasterIDs, playerID];
}

export function toggleRepresentative(G: IG, ctx: Ctx, playerID: string) {
  const team = getPlayerTeam(G, playerID);
  const pID = parseInt(playerID);
  if (!isHostPlayer(G, ctx) || pID < 0 || pID >= ctx.numPlayers || !team) {
    return INVALID_MOVE;
  }

  if (team.representativeIDs.includes(playerID)) {
    team.representativeIDs = team.representativeIDs.filter((id) => id !== playerID);
    return;
  }

  team.spymasterIDs = team.spymasterIDs.filter((id) => id !== playerID);
  team.representativeIDs = [...team.representativeIDs, playerID];
}

export function clueGiven(G: IG, ctx: Ctx) {
  const team = getCurrentTeam(G);
  ctx.events.endPhase();
  if (ctx.numPlayers > 2) {
    const activePlayers = { value: {} };
    for (const player of getActiveGuessers(team, ctx)) {
      activePlayers.value[player] = null;
    }
    ctx.events.setActivePlayers(activePlayers);
  }
}

export function getActiveGuessers(team: Team, ctx: Ctx): string[] {
  if (ctx.numPlayers <= 2) {
    return team.playersID;
  }

  if (team.representativeIDs.length > 0) {
    return team.representativeIDs;
  }

  const nonSpymasters = team.playersID.filter((playerID) => !team.spymasterIDs.includes(playerID));
  return nonSpymasters.length > 0 ? nonSpymasters : team.playersID;
}

export function getCurrentTeam(G: IG): Team {
  return G.teams[G.currentTeamIndex];
}

export function gameCanStart(G: IG, ctx: Ctx) {
  const { numPlayers } = ctx;
  if (G.teams.some((team) => team.spymasterIDs.length === 0)) return false;
  return G.teams.reduce((sum, t) => sum + t.playersID.length, 0) === numPlayers;
}

export function startGame(G: IG, ctx: Ctx) {
  if (!isHostPlayer(G, ctx)) {
    return INVALID_MOVE;
  }
  if (!gameCanStart(G, ctx)) {
    return INVALID_MOVE;
  }

  G.teams = ctx.random.Shuffle(G.teams);
  G.currentTeamIndex = 0;

  const key = ctx.random.Shuffle(G.cards).slice(0, 18) as Card[];
  key.map((card, index) => {
    if (index === 0) card.color = CardColor.assassin;
    else if (index <= 8) card.color = CardColor.blue;
    else if (index <= 16) card.color = CardColor.red;
    else card.color = getCardColorByTeamColor(getCurrentTeam(G).color);
  });
  ctx.events.endPhase();
  return G;
}

export function pass(G: IG, ctx: Ctx) {
  if (!canPlayerGuessCurrentTeam(G, ctx, getActingPlayerID(ctx))) {
    return INVALID_MOVE;
  }

  return passTurn(G, ctx);
}

function passTurn(G: IG, ctx: Ctx) {
  G.currentTeamIndex = (G.currentTeamIndex + 1) % 2;
  ctx.events.endPhase();
}

export function chooseCard(G: IG, ctx: Ctx, cardIndex: number) {
  const actingPlayerID = getActingPlayerID(ctx);
  if (!canPlayerGuessCurrentTeam(G, ctx, actingPlayerID)) {
    return INVALID_MOVE;
  }
  if (G.cards[cardIndex].revealed) {
    return INVALID_MOVE;
  }
  const team = getPlayerTeam(G, actingPlayerID);
  if (!team) {
    return INVALID_MOVE;
  }

  const newCards = [...G.cards];
  newCards[cardIndex] = { ...newCards[cardIndex], revealed: true };
  G.cards = newCards;
  G.lastSelectedCardIndex = cardIndex;
  G.lastSelectedCardTeamColor = team?.color ?? null;
  const color = getCardColorByTeamColor(team.color);

  if (G.cards[cardIndex].color !== color) {
    passTurn(G, ctx);
  }
}

export function getTeamByColor(G: IG, teamColor: TeamColor): Team | undefined {
  return G.teams.find((t) => t.color === teamColor);
}

export function getPlayerTeam(G: IG, playerID: string | null | undefined): Team | undefined {
  if (playerID == null) {
    return;
  }
  return G.teams.find((team) => team.playersID.includes(playerID));
}

export function getOtherTeam(G: IG, team: Team): Team | undefined {
  return G.teams.find((t) => t.color !== team.color);
}

export function makeCard(word: string): Card {
  return { word, color: CardColor.civilian, revealed: false };
}

export function makeTeam(color: TeamColor): Team {
  return { color, playersID: [], spymasterIDs: [], representativeIDs: [] };
}

export function getCardColorByTeamColor(color: TeamColor): CardColor {
  const colors = {
    [TeamColor.Blue]: CardColor.blue,
    [TeamColor.Red]: CardColor.red,
  };

  return colors[color];
}

export function isPlayerSpymaster(G: IG, playerID: string | null | undefined): boolean {
  if (playerID == null) {
    return false;
  }
  const team = getPlayerTeam(G, playerID);

  return team?.spymasterIDs.includes(playerID) || false;
}

export function isPlayerRepresentative(G: IG, playerID: string | null | undefined): boolean {
  if (playerID == null) {
    return false;
  }
  const team = getPlayerTeam(G, playerID);

  return team?.representativeIDs.includes(playerID) || false;
}

export function canPlayerGuessCurrentTeam(G: IG, ctx: Ctx, playerID: string | null | undefined): boolean {
  if (playerID == null) {
    return false;
  }
  const currentTeam = getCurrentTeam(G);
  const playerTeam = getPlayerTeam(G, playerID);

  if (!currentTeam || !playerTeam || playerTeam.color !== currentTeam.color) {
    return false;
  }

  return getActiveGuessers(currentTeam, ctx).includes(playerID);
}

export function getActingPlayerID(ctx: Ctx): string {
  return ctx.playerID ?? ctx.currentPlayer ?? '0';
}

function isHostPlayer(G: IG, ctx: Ctx): boolean {
  return getActingPlayerID(ctx) === G.hostPlayerID;
}
