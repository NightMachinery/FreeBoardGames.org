import { Client } from 'boardgame.io/client';
import { GameMode } from 'gamesShared/definitions/mode';
import React from 'react';
import { act } from 'react-dom/test-utils';
import { Lobby } from './Lobby';
import { SecretcodesGame } from './game';
import { makeMount } from 'test/utils/enzymeUtil';
import { resetSecretcodesPicturesManifestCache } from './pictures';
import { DEFAULT_FULL_CUSTOMIZATION } from './customization';
import { TeamColor } from './definitions';

const mount = makeMount({ gameCode: 'secretcodes' });
const originalFetch = (global as any).fetch;

function renderLobby({
  isHost = true,
  moves = {},
  numPlayers = 4,
}: {
  isHost?: boolean;
  moves?: Record<string, unknown>;
  numPlayers?: number;
}) {
  const client = Client({
    game: SecretcodesGame,
    numPlayers,
  }) as any;
  const state = client.store.getState();
  const mergedMoves = {
    ...client.moves,
    ...moves,
  };

  state.G = {
    ...state.G,
    hostPlayerID: '0',
    teams: [
      { color: TeamColor.Blue, playersID: ['0'], spymasterIDs: ['0'], representativeIDs: [] },
      { color: TeamColor.Red, playersID: ['2'], spymasterIDs: ['2'], representativeIDs: [] },
    ],
  };

  return mount(
    <Lobby
      G={state.G}
      ctx={state.ctx}
      moves={mergedMoves}
      events={state.events}
      playerID={'0'}
      gameArgs={{
        gameCode: 'secretcodes',
        mode: GameMode.OnlineFriend,
        hostPlayerID: '0',
        players: [
          { playerID: 0, name: 'foo' },
          { playerID: 1, name: 'bar' },
          { playerID: 2, name: 'baz' },
          { playerID: 3, name: 'bor' },
        ],
      }}
      isHost={isHost}
    />,
  );
}

describe('Secretcodes Lobby', () => {
  beforeEach(() => {
    resetSecretcodesPicturesManifestCache();
    (global as any).fetch = originalFetch;
  });

  afterEach(() => {
    resetSecretcodesPicturesManifestCache();
    (global as any).fetch = originalFetch;
  });

  it('should wait for pictures validation before auto-starting local games', async () => {
    let resolveManifest: (value: unknown) => void;
    const manifestPromise = new Promise((resolve) => {
      resolveManifest = resolve;
    });
    (global as any).fetch = jest.fn().mockReturnValue(manifestPromise);

    const client = Client({
      game: {
        ...SecretcodesGame,
        setup: (ctx) =>
          SecretcodesGame.setup!(ctx, {
            full: {
              ...DEFAULT_FULL_CUSTOMIZATION,
              picturesMode: true,
            },
          } as any),
      },
    }) as any;
    const state = client.store.getState();
    const moves = {
      ...client.moves,
      startGame: jest.fn(),
    };

    mount(
      <Lobby
        G={state.G}
        ctx={state.ctx}
        moves={moves}
        events={state.events}
        playerID={'0'}
        gameArgs={{
          gameCode: 'secretcodes',
          mode: GameMode.LocalFriend,
          players: [
            { playerID: 0, name: 'foo' },
            { playerID: 1, name: 'bar' },
          ],
        }}
        isHost={true}
      />,
    );

    expect(moves.startGame).not.toHaveBeenCalled();

    await act(async () => {
      resolveManifest!({
        ok: true,
        json: async () => ({
          enabled: true,
          available: true,
          count: 25,
          imageIds: Array.from({ length: 25 }, (_, index) => `image-${index}`),
        }),
      });

      await new Promise(setImmediate);
    });

    expect(moves.startGame).toHaveBeenCalledTimes(1);
  });

  it('should show host-only assignment buttons for unassigned and assigned players', () => {
    const wrapper = renderLobby({ isHost: true });

    expect(wrapper.find('[data-testid="assign-team-1-blue"]').exists()).toEqual(true);
    expect(wrapper.find('[data-testid="assign-team-1-red"]').exists()).toEqual(true);
    expect(wrapper.find('[data-testid="assign-team-0-blue"]').exists()).toEqual(false);
    expect(wrapper.find('[data-testid="assign-team-0-red"]').exists()).toEqual(true);
    expect(wrapper.find('[data-testid="assign-team-2-blue"]').exists()).toEqual(true);
    expect(wrapper.find('[data-testid="assign-team-2-red"]').exists()).toEqual(false);
  });

  it('should hide assignment buttons for non-host players', () => {
    const wrapper = renderLobby({ isHost: false });

    expect(wrapper.find('[data-testid^="assign-team-"]').exists()).toEqual(false);
  });

  it('should call assignPlayerTeam when a host assignment button is clicked', () => {
    const moves = {
      assignPlayerTeam: jest.fn(),
    };
    const wrapper = renderLobby({ isHost: true, moves });

    wrapper.find('[data-testid="assign-team-1-blue"]').first().simulate('click');

    expect(moves.assignPlayerTeam).toHaveBeenCalledWith('1', TeamColor.Blue);
  });
});
