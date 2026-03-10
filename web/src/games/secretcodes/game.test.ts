import { Client } from 'boardgame.io/client';
import { INVALID_MOVE } from 'boardgame.io/core';
import { SecretcodesGame } from './game';
import { Ctx } from 'boardgame.io';
import { CardColor, Phases, TeamColor } from './definitions';
import { chooseCard, pass, switchTeam, toggleRepresentative, toggleSpymaster } from './util';

describe('secret codes rules', () => {
  it('should work for a simple game', () => {
    const client = Client({
      game: { ...SecretcodesGame, seed: 1 },
    }) as any;

    client.moves.startGame();
    client.moves.pass(); // pass turn to red team
    client.moves.chooseCard(0); // "sock", red card, mistake.
    client.moves.chooseCard(1); // "fish", red card, correct.
    client.moves.chooseCard(2); // "web", red card, correct.
    client.moves.chooseCard(3); // "lock", civilian card, mistake.
    client.moves.chooseCard(4); // "plate", blue card, correct.
    client.moves.chooseCard(5); // "capital", blue card, correct.
    client.moves.pass();
    client.moves.chooseCard(6); // "spring", civilian card, mistake.
    client.moves.chooseCard(7); // "berry", blue card, correct.
    client.moves.pass();
    client.moves.chooseCard(8); // "tag", civilian card, mistake.
    client.moves.chooseCard(9); // "missile", blue card, correct.
    client.moves.chooseCard(10); // "beijing", blue card, correct.
    client.moves.chooseCard(13); // "foot", blue card, correct.
    client.moves.chooseCard(18); // "crane", blue card, correct.
    client.moves.chooseCard(23); // "australia", blue card, correct. Blue wins.

    const ctx: Ctx = client.store.getState().ctx;
    expect(ctx.gameover.winner.color).toEqual(TeamColor.Blue);
  });

  it('should lose if select assassin', () => {
    const client = Client({
      game: { ...SecretcodesGame, seed: 1 },
    }) as any;

    client.moves.startGame();
    client.moves.pass(); // pass turn to red team
    client.moves.chooseCard(0); // "sock", red card, mistake.
    client.moves.chooseCard(1); // "fish", red card, correct.
    client.moves.chooseCard(2); // "web", red card, correct.
    client.moves.chooseCard(3); // "lock", civilian card, mistake.
    client.moves.chooseCard(4); // "plate", blue card, correct.
    client.moves.chooseCard(5); // "capital", blue card, correct.
    client.moves.pass();
    client.moves.chooseCard(6); // "spring", civilian card, mistake.
    client.moves.chooseCard(7); // "berry", blue card, correct.
    client.moves.pass();
    client.moves.chooseCard(8); // "tag", civilian card, mistake.
    client.moves.chooseCard(9); // "missile", blue card, correct.
    client.moves.chooseCard(10); // "beijing", blue card, correct.
    client.moves.chooseCard(11); // "palm", assassin card, loses the game.

    const ctx: Ctx = client.store.getState().ctx;
    expect(ctx.gameover.winner.color).toEqual(TeamColor.Red);
  });

  it('should allow multiple spymasters on the same team', () => {
    const client = Client({
      game: SecretcodesGame,
      numPlayers: 4,
    }) as any;
    const state = client.store.getState();
    const ctx = { ...state.ctx, playerID: '0' } as Ctx;
    state.G = {
      ...state.G,
      hostPlayerID: '0',
      teams: [
        { color: TeamColor.Red, playersID: ['0', '1'], spymasterIDs: ['0'], representativeIDs: [] },
        { color: TeamColor.Blue, playersID: ['2', '3'], spymasterIDs: ['2'], representativeIDs: [] },
      ],
    };

    toggleSpymaster(state.G, ctx, '1');

    expect(state.G.teams[0].spymasterIDs).toEqual(['0', '1']);
  });

  it('should remove roles when switching teams', () => {
    const client = Client({
      game: SecretcodesGame,
      numPlayers: 4,
    }) as any;
    const state = client.store.getState();
    state.G = {
      ...state.G,
      hostPlayerID: '0',
      teams: [
        { color: TeamColor.Red, playersID: ['0', '1'], spymasterIDs: ['0'], representativeIDs: ['1'] },
        { color: TeamColor.Blue, playersID: ['2', '3'], spymasterIDs: ['2'], representativeIDs: [] },
      ],
    };

    switchTeam(state.G, { ...state.ctx, playerID: '1' } as Ctx, TeamColor.Blue);

    expect(state.G.teams[0].playersID).toEqual(['0']);
    expect(state.G.teams[0].representativeIDs).toEqual([]);
    expect(state.G.teams[1].playersID).toEqual(['2', '3', '1']);
  });

  it('should only allow representatives to choose cards and pass when present', () => {
    const client = Client({
      game: SecretcodesGame,
      numPlayers: 4,
    }) as any;
    const state = client.store.getState();
    state.G = {
      ...state.G,
      hostPlayerID: '0',
      currentTeamIndex: 0,
      teams: [
        { color: TeamColor.Blue, playersID: ['0', '1', '2'], spymasterIDs: ['0'], representativeIDs: ['1'] },
        { color: TeamColor.Red, playersID: ['3'], spymasterIDs: ['3'], representativeIDs: [] },
      ],
    };
    state.ctx = { ...state.ctx, events: { endPhase: jest.fn() } };

    expect(chooseCard(state.G, { ...state.ctx, playerID: '2' } as Ctx, 0)).toEqual(INVALID_MOVE);
    expect(pass(state.G, { ...state.ctx, playerID: '2' } as Ctx)).toEqual(INVALID_MOVE);

    chooseCard(state.G, { ...state.ctx, playerID: '1' } as Ctx, 0);
    expect(state.G.lastSelectedCardIndex).toEqual(0);
  });

  it('should allow non-spymaster teammates to choose cards when there are no representatives', () => {
    const client = Client({
      game: SecretcodesGame,
      numPlayers: 4,
    }) as any;
    const state = client.store.getState();
    state.G = {
      ...state.G,
      hostPlayerID: '0',
      currentTeamIndex: 0,
      teams: [
        { color: TeamColor.Blue, playersID: ['0', '1', '2'], spymasterIDs: ['0'], representativeIDs: [] },
        { color: TeamColor.Red, playersID: ['3'], spymasterIDs: ['3'], representativeIDs: [] },
      ],
    };
    state.ctx = { ...state.ctx, events: { endPhase: jest.fn() } };

    chooseCard(state.G, { ...state.ctx, playerID: '1' } as Ctx, 0);

    expect(state.G.lastSelectedCardIndex).toEqual(0);
  });

  it('should move a player between roles instead of allowing spymaster and representative overlap', () => {
    const client = Client({
      game: SecretcodesGame,
      numPlayers: 4,
    }) as any;
    const state = client.store.getState();
    const ctx = { ...state.ctx, playerID: '0' } as Ctx;
    state.G = {
      ...state.G,
      hostPlayerID: '0',
      teams: [
        { color: TeamColor.Red, playersID: ['0', '1'], spymasterIDs: ['0'], representativeIDs: [] },
        { color: TeamColor.Blue, playersID: ['2', '3'], spymasterIDs: ['2'], representativeIDs: [] },
      ],
    };

    toggleRepresentative(state.G, ctx, '1');
    toggleSpymaster(state.G, ctx, '1');

    expect(state.G.teams[0].representativeIDs).toEqual([]);
    expect(state.G.teams[0].spymasterIDs).toEqual(['0', '1']);
  });

  it('should hide unrevealed card colors from spectators during active play', () => {
    const client = Client({
      game: SecretcodesGame,
    }) as any;
    const state = client.store.getState();
    state.G = {
      ...state.G,
      currentTeamIndex: 0,
      cards: state.G.cards.map((card, index) => ({
        ...card,
        color: index === 0 ? CardColor.blue : CardColor.red,
        revealed: index === 0,
      })),
      teams: [
        { color: TeamColor.Blue, playersID: ['0'], spymasterIDs: ['0'], representativeIDs: [] },
        { color: TeamColor.Red, playersID: ['1'], spymasterIDs: ['1'], representativeIDs: [] },
      ],
    };
    state.ctx = { ...state.ctx, phase: Phases.guess };

    const spectatorView = SecretcodesGame.playerView(state.G, state.ctx, null);

    expect(spectatorView.cards[0].color).toEqual(CardColor.blue);
    expect(spectatorView.cards[1].color).toBeUndefined();
  });
});
