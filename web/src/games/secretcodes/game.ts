import { ActivePlayers } from 'boardgame.io/core';
import { Ctx, Game } from 'boardgame.io';
import { Card, CardColor, IG, Phases, TeamColor } from './definitions';
import {
  chooseCard,
  getActiveGuessers,
  getCurrentTeam,
  getOtherTeam,
  getRemainingCardCounts,
  getTeamByColor,
  makeCard,
  makeTeam,
  pass,
  startGame,
  switchTeam,
  assignPlayerTeam,
  toggleRepresentative,
  toggleSpymaster,
  isPlayerSpymaster,
} from './util';
import { GameCustomizationState } from 'gamesShared/definitions/customization';
import { DEFAULT_FULL_CUSTOMIZATION, FullCustomizationState } from './customization';

const GameConfig: Game<IG> = {
  name: 'secretcodes',

  setup: (ctx, customData: GameCustomizationState & { hostPlayerID?: string }): IG => {
    const fullCustomization = (customData?.full as FullCustomizationState) || DEFAULT_FULL_CUSTOMIZATION;
    const blackCards = Math.max(0, Math.min(8, fullCustomization.blackCards ?? DEFAULT_FULL_CUSTOMIZATION.blackCards));
    const picturesMode = fullCustomization.picturesMode ?? DEFAULT_FULL_CUSTOMIZATION.picturesMode;
    const teams = new Array(2).fill(0).map((_, i) => makeTeam(i === 0 ? TeamColor.Blue : TeamColor.Red));
    if (ctx.numPlayers === 2) {
      teams[0].playersID = ['0'];
      teams[0].spymasterIDs = ['0'];
      teams[1].playersID = ['1'];
      teams[1].spymasterIDs = ['1'];
    }
    const cards = ctx.random
      .Shuffle(fullCustomization.words)
      .slice(0, 25)
      .map((word) => makeCard(word));
    const lastSelectedCardIndex = null;
    const picturesSeed = cards.map((card) => card.word).join('|');
    return {
      teams,
      cards,
      blackCards,
      picturesMode,
      picturesSeed,
      hostPlayerID: customData?.hostPlayerID || '0',
      lastActionId: 0,
      lastActionType: null,
      lastSelectedCardIndex,
      lastSelectedCardTeamColor: null,
    };
  },

  playerView: (G: IG, ctx: Ctx, playerID: string | null): any => {
    if (ctx.gameover) return G;
    if (ctx.phase !== Phases.guess) return G;
    if (isPlayerSpymaster(G, playerID)) return G;

    const { cards } = G;
    return {
      ...G,
      remainingCardCounts: getRemainingCardCounts(G),
      cards: cards.map((card: Card) => {
        let c: Card = {
          word: card.word,
          revealed: card.revealed,
        };
        if (c.revealed) c.color = card.color;
        return c;
      }),
    };
  },

  phases: {
    [Phases.lobby]: {
      start: true,
      moves: {
        switchTeam,
        assignPlayerTeam,
        toggleSpymaster,
        toggleRepresentative,
        startGame,
      },

      next: Phases.guess,

      turn: {
        activePlayers: ActivePlayers.ALL,
      },
    },

    [Phases.guess]: {
      next: Phases.guess,
      turn: {
        activePlayers: ActivePlayers.ALL,
        order: {
          first: () => 0,
          next: () => 0,
          playOrder: (G: IG, ctx: Ctx): string[] => getActiveGuessers(getCurrentTeam(G), ctx),
        },
      },
      moves: {
        chooseCard: {
          move: chooseCard,
          client: false,
        },
        pass: {
          move: pass,
          client: false,
        },
      },
    },
  },

  endIf: (G: IG, ctx: Ctx) => {
    // turn 1 is used to setup the game so we only check from turn 2 and up
    if (ctx.turn >= 2) {
      const assassinRevealed = G.cards.some((card) => card.color === CardColor.assassin && card.revealed);
      const blue = G.cards.filter((card) => card.color === CardColor.blue && !card.revealed);
      const red = G.cards.filter((card) => card.color === CardColor.red && !card.revealed);

      if (assassinRevealed && G.lastSelectedCardTeamColor) {
        return {
          winner: getOtherTeam(G, getTeamByColor(G, G.lastSelectedCardTeamColor)),
        };
      }
      if (blue.length === 0)
        return {
          winner: G.teams.find((team) => team.color === TeamColor.Blue),
        };
      if (red.length === 0)
        return {
          winner: G.teams.find((team) => team.color === TeamColor.Red),
        };
    }
  },
};

export const SecretcodesGame = GameConfig;
