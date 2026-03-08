import Enzyme from 'enzyme';
import { Client } from 'boardgame.io/client';
import { SecretcodesGame } from './game';
import { PlayBoard } from './PlayBoard';
import { GameMode } from 'gamesShared/definitions/mode';
import { CardColor, TeamColor } from './definitions';
import { chooseCard } from './util';

function render(client: any, state: any, gameOver = false, moves = client.moves) {
  return Enzyme.shallow(
    <PlayBoard
      G={state.G}
      ctx={state.ctx}
      events={state.events}
      moves={moves}
      playerID={'0'}
      isActive={true}
      isHost={false}
      gameArgs={{
        gameCode: 'secretcodes',
        mode: GameMode.LocalFriend,
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
});
