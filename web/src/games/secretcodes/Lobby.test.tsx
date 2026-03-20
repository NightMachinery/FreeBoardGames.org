import { Client } from 'boardgame.io/client';
import { GameMode } from 'gamesShared/definitions/mode';
import React from 'react';
import { act } from 'react-dom/test-utils';
import { Lobby } from './Lobby';
import { SecretcodesGame } from './game';
import { makeMount } from 'test/utils/enzymeUtil';
import { resetSecretcodesPicturesManifestCache } from './pictures';
import { DEFAULT_FULL_CUSTOMIZATION } from './customization';

const mount = makeMount({ gameCode: 'secretcodes' });
const originalFetch = (global as any).fetch;

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
});
