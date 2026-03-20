import Enzyme from 'enzyme';
import { Client } from 'boardgame.io/client';
import { SecretcodesGame } from './game';
import { PlayBoard } from './PlayBoard';
import { GameMode } from 'gamesShared/definitions/mode';
import { CardColor, TeamColor } from './definitions';
import { chooseCard } from './util';
import { resetSecretcodesPicturesManifestCache } from './pictures';

const originalFetch = (global as any).fetch;

function render(
  client: any,
  state: any,
  gameOver = false,
  moves = client.moves,
  playerID: string | null = '0',
  mode: GameMode = GameMode.LocalFriend,
) {
  return Enzyme.shallow(
    <PlayBoard
      G={state.G}
      ctx={state.ctx}
      events={state.events}
      moves={moves}
      playerID={playerID}
      isActive={true}
      isHost={false}
      gameArgs={{
        gameCode: 'secretcodes',
        mode,
        players: [
          { playerID: 0, name: 'foo' },
          { playerID: 1, name: 'bar' },
          { playerID: 2, name: 'baz' },
          { playerID: 3, name: 'bor' },
        ],
      }}
      isGameOver={gameOver}
    />,
  ).dive();
}

describe('Secretcodes UI', () => {
  let client;
  let state;

  beforeEach(() => {
    resetSecretcodesPicturesManifestCache();
    (global as any).fetch = originalFetch;
    client = Client({
      game: SecretcodesGame,
    });
    state = client.store.getState();
    state.G = {
      ...state.G,
      hostPlayerID: '0',
      currentTeamIndex: 0,
      lastSelectedCardTeamColor: null,
      teams: [
        { color: TeamColor.Red, playersID: ['0', '1'], spymasterIDs: ['0'], representativeIDs: [] },
        { color: TeamColor.Blue, playersID: ['2', '3'], spymasterIDs: ['2'], representativeIDs: [] },
      ],
    };
  });

  afterEach(() => {
    resetSecretcodesPicturesManifestCache();
    (global as any).fetch = originalFetch;
  });

  it('should highlight the last selected card.', () => {
    state.ctx = { ...state.ctx, events: { endPhase: () => {} }, currentPlayer: '1' };
    const newCards = [...state.G.cards];
    newCards[5] = { ...newCards[5], color: CardColor.red };
    newCards[7] = { ...newCards[7], color: CardColor.red };
    state.G = { ...state.G, cards: newCards };
    chooseCard(state.G, state.ctx, 5);
    let wrapper = render(client, state);

    let firstCard = wrapper.find('.card').at(5);
    let secondCard = wrapper.find('.card').at(7);
    expect(firstCard.hasClass('cardLastSelected')).toBeTruthy();
    expect(secondCard.hasClass('cardLastSelected')).toBeFalsy();

    chooseCard(state.G, state.ctx, 7);
    wrapper = render(client, state);

    firstCard = wrapper.find('.card').at(5);
    secondCard = wrapper.find('.card').at(7);
    expect(firstCard.hasClass('cardLastSelected')).toBeFalsy();
    expect(secondCard.hasClass('cardLastSelected')).toBeTruthy();
  });

  it('should style revealed cards to the spymaster.', () => {
    state.ctx = { ...state.ctx, currentPlayer: '0' };
    const newCards = [...state.G.cards];
    newCards[0] = { ...newCards[0], revealed: true };
    state.G = { ...state.G, cards: newCards };

    const wrapper = render(client, state);
    // Normal view
    let cards = wrapper.find('.card');
    expect(cards.at(0).hasClass('cardRevealedSpymasterView')).toBeFalsy();
    expect(cards.at(1).hasClass('cardRevealedSpymasterView')).toBeFalsy();

    // Spymaster view
    wrapper.find('.selectTeamBtn').simulate('click');
    cards = wrapper.find('.card');
    expect(cards.at(0).hasClass('cardRevealedSpymasterView')).toBeTruthy();
    expect(cards.at(1).hasClass('cardRevealedSpymasterView')).toBeFalsy();
  });

  it('should not style revealed cards to regular players.', () => {
    state.ctx = { ...state.ctx, currentPlayer: '1' };
    const newCards = [...state.G.cards];
    newCards[0] = { ...newCards[0], revealed: true };
    state.G = { ...state.G, cards: newCards };

    const wrapper = render(client, state);

    wrapper.find('.card').forEach((cardNode) => expect(cardNode.hasClass('cardRevealedSpymasterView')).toBeFalsy());
  });

  it('should not style revealed cards to the spymaster at the end of the game.', () => {
    state.ctx = { ...state.ctx, currentPlayer: '0' };
    const newCards = [...state.G.cards];
    newCards[0] = { ...newCards[0], revealed: true };
    state.G = { ...state.G, cards: newCards };

    const wrapper = render(client, state, /* gameOver= */ true);

    wrapper.find('.card').forEach((cardNode) => expect(cardNode.hasClass('cardRevealedSpymasterView')).toBeFalsy());
  });

  it('should not allow non-representatives to choose cards when representatives are present.', () => {
    state.ctx = { ...state.ctx, currentPlayer: '2' };
    state.G = {
      ...state.G,
      teams: [
        { color: TeamColor.Red, playersID: ['0', '1'], spymasterIDs: ['0'], representativeIDs: [] },
        { color: TeamColor.Blue, playersID: ['2', '3'], spymasterIDs: ['2'], representativeIDs: ['3'] },
      ],
      currentTeamIndex: 1,
    };
    const moves = {
      ...client.moves,
      chooseCard: jest.fn(),
      pass: jest.fn(),
    };

    const wrapper = render(client, state, false, moves);
    wrapper.find('.card').at(0).simulate('click');

    expect(moves.chooseCard).not.toHaveBeenCalled();
  });

  it('should hide the spymaster toggle for spectators', () => {
    state.ctx = { ...state.ctx, currentPlayer: '0' };

    const wrapper = render(client, state, false, client.moves, null, GameMode.OnlineFriend);

    expect(wrapper.find('.selectTeamBtn').exists()).toBeFalsy();
  });

  it('should not allow spectators to choose cards or pass', () => {
    state.ctx = { ...state.ctx, currentPlayer: '0' };
    const moves = {
      ...client.moves,
      chooseCard: jest.fn(),
      pass: jest.fn(),
    };

    const wrapper = render(client, state, false, moves, null, GameMode.OnlineFriend);
    wrapper.find('.card').at(0).simulate('click');

    expect(moves.chooseCard).not.toHaveBeenCalled();
    expect(wrapper.find('.playActionBtn').exists()).toBeFalsy();
    expect(moves.pass).not.toHaveBeenCalled();
  });

  it('should render picture cards with a 2:3 card class and image content in pictures mode', async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        enabled: true,
        available: true,
        count: 30,
        imageIds: Array.from({ length: 30 }, (_, index) => `image-${index}`),
      }),
    });

    state.ctx = { ...state.ctx, currentPlayer: '0' };
    const newCards = [...state.G.cards];
    newCards[0] = { ...newCards[0], revealed: true, color: CardColor.blue };
    state.G = { ...state.G, cards: newCards, picturesMode: true, picturesSeed: 'seed' };

    const wrapper = render(client, state);
    await new Promise(setImmediate);
    wrapper.update();

    const firstCard = wrapper.find('.card').at(0);
    expect(firstCard.hasClass('cardPictures')).toBeTruthy();
    expect(firstCard.hasClass('cardBlue')).toBeTruthy();
    expect(wrapper.find('img.cardImage').exists()).toBeTruthy();
  });
});
