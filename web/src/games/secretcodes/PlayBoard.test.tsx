import Enzyme from 'enzyme';
import { Client } from 'boardgame.io/client';
import { SecretcodesGame } from './game';
import { PlayBoard } from './PlayBoard';
import { GameMode } from 'gamesShared/definitions/mode';
import { CardColor, TeamColor } from './definitions';
import { chooseCard } from './util';
import { resetSecretcodesPicturesManifestCache } from './pictures';
import { makeMount } from 'test/utils/enzymeUtil';

const originalFetch = (global as any).fetch;
const PICTURE_CARDS_PER_ROW_STORAGE_KEY = 'secretcodesPicturesCardsPerRow';
const SPYMASTER_PICTURE_HIGHLIGHTS_STORAGE_KEY = 'secretcodesSpymasterPictureHighlights';
const mount = makeMount({ gameCode: 'secretcodes' });

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

function renderMounted(
  client: any,
  state: any,
  gameOver = false,
  moves = client.moves,
  playerID: string | null = '0',
  mode: GameMode = GameMode.LocalFriend,
) {
  return mount(
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
  );
}

function mockAvailablePicturesManifest() {
  (global as any).fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      enabled: true,
      available: true,
      count: 30,
      imageIds: Array.from({ length: 30 }, (_, index) => `image-${index}`),
    }),
  });
}

describe('Secretcodes UI', () => {
  let client;
  let state;

  beforeEach(() => {
    resetSecretcodesPicturesManifestCache();
    (global as any).fetch = originalFetch;
    localStorage.clear();
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
    localStorage.clear();
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
    mockAvailablePicturesManifest();

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

  it('should render stable picture card badges and use 5 columns by default', async () => {
    mockAvailablePicturesManifest();

    state.ctx = { ...state.ctx, currentPlayer: '0' };
    state.G = { ...state.G, picturesMode: true, picturesSeed: 'seed' };

    const wrapper = render(client, state);
    await new Promise(setImmediate);
    wrapper.update();

    const board = wrapper.find('.boardPictures').first();
    const badges = wrapper.find('.cardIndexBadge');

    expect(board.prop('style')).toMatchObject({ '--pictures-columns': 5 });
    expect(badges).toHaveLength(25);
    expect(badges.at(0).text()).toEqual('1');
    expect(badges.at(24).text()).toEqual('25');
  });

  it('should persist the picture cards per row preference and restore it on remount', async () => {
    mockAvailablePicturesManifest();

    state.ctx = { ...state.ctx, currentPlayer: '0' };
    state.G = { ...state.G, picturesMode: true, picturesSeed: 'seed' };

    let wrapper = render(client, state);
    await new Promise(setImmediate);
    wrapper.update();

    const slider = wrapper.findWhere((node) => node.prop('data-testid') === 'pictures-cards-per-row-slider').first();
    slider.prop('onChange')?.({} as any, 7);
    wrapper.update();

    expect(JSON.parse(localStorage.getItem(PICTURE_CARDS_PER_ROW_STORAGE_KEY)!)).toEqual(7);
    expect(wrapper.find('.boardPictures').first().prop('style')).toMatchObject({ '--pictures-columns': 7 });
    expect(wrapper.find('.cardIndexBadge').at(0).text()).toEqual('1');
    expect(wrapper.find('.cardIndexBadge').at(24).text()).toEqual('25');

    wrapper = render(client, state);
    await new Promise(setImmediate);
    wrapper.update();

    expect(wrapper.find('.boardPictures').first().prop('style')).toMatchObject({ '--pictures-columns': 7 });
  });

  it('should show the picture highlight toggle only to spymasters during live pictures mode', async () => {
    mockAvailablePicturesManifest();

    state.ctx = { ...state.ctx, currentPlayer: '0' };
    state.G = { ...state.G, picturesMode: true, picturesSeed: 'seed' };

    let wrapper = render(client, state);
    await new Promise(setImmediate);
    wrapper.update();

    expect(
      wrapper.findWhere((node) => node.prop('data-testid') === 'pictures-spymaster-highlights-toggle').exists(),
    ).toEqual(true);

    wrapper = render(client, { ...state, ctx: { ...state.ctx, currentPlayer: '1' } });
    await new Promise(setImmediate);
    wrapper.update();

    expect(
      wrapper.findWhere((node) => node.prop('data-testid') === 'pictures-spymaster-highlights-toggle').exists(),
    ).toEqual(false);

    wrapper = render(client, state, false, client.moves, null, GameMode.OnlineFriend);
    await new Promise(setImmediate);
    wrapper.update();

    expect(
      wrapper.findWhere((node) => node.prop('data-testid') === 'pictures-spymaster-highlights-toggle').exists(),
    ).toEqual(false);
  });

  it('should persist the spymaster picture highlight preference and apply it in spymaster view only', async () => {
    mockAvailablePicturesManifest();

    state.ctx = { ...state.ctx, currentPlayer: '0' };
    const newCards = [...state.G.cards];
    newCards[0] = { ...newCards[0], color: CardColor.blue };
    state.G = { ...state.G, cards: newCards, picturesMode: true, picturesSeed: 'seed' };

    let wrapper = render(client, state);
    await new Promise(setImmediate);
    wrapper.update();

    const getToggle = () =>
      wrapper.findWhere((node) => node.prop('data-testid') === 'pictures-spymaster-highlights-toggle').first();
    const toggleOnChange = () => (getToggle().prop('control') as any).props.onChange as Function;
    const toggleChecked = () => (getToggle().prop('control') as any).props.checked as boolean;

    expect(wrapper.find('.card').at(0).hasClass('cardPictureHighlight')).toEqual(false);

    toggleOnChange()?.({} as any, true);
    wrapper.update();

    expect(JSON.parse(localStorage.getItem(SPYMASTER_PICTURE_HIGHLIGHTS_STORAGE_KEY)!)).toEqual(true);
    expect(wrapper.find('.card').at(0).hasClass('cardPictureHighlight')).toEqual(false);

    wrapper.find('.selectTeamBtn').simulate('click');
    wrapper.update();

    expect(wrapper.find('.card').at(0).hasClass('cardPictureHighlight')).toEqual(true);

    wrapper = render(client, state);
    await new Promise(setImmediate);
    wrapper.update();

    expect(toggleChecked()).toEqual(true);
    wrapper.find('.selectTeamBtn').simulate('click');
    wrapper.update();
    expect(wrapper.find('.card').at(0).hasClass('cardPictureHighlight')).toEqual(true);
  });

  it('should keep picture controls visible on the game over board', async () => {
    mockAvailablePicturesManifest();

    state.ctx = { ...state.ctx, currentPlayer: '0' };
    state.G = { ...state.G, picturesMode: true, picturesSeed: 'seed' };

    const wrapper = render(client, state, true);
    await new Promise(setImmediate);
    wrapper.update();

    expect(wrapper.findWhere((node) => node.prop('data-testid') === 'pictures-cards-per-row-slider').exists()).toEqual(
      true,
    );
    expect(
      wrapper.findWhere((node) => node.prop('data-testid') === 'pictures-spymaster-highlights-toggle').exists(),
    ).toEqual(false);
    expect(wrapper.find('.cardIndexBadge')).toHaveLength(25);
  });

  it('should render spymaster clues with strong markup instead of literal html', async () => {
    mockAvailablePicturesManifest();

    state.ctx = { ...state.ctx, currentPlayer: '1' };
    const wrapper = renderMounted(client, state, false, client.moves, '1', GameMode.OnlineFriend);
    await new Promise(setImmediate);
    wrapper.update();

    const html = wrapper.html();
    expect(html).toContain('<strong>foo</strong>');
    expect(html).not.toContain('&lt;strong&gt;foo&lt;/strong&gt;');
    expect(wrapper.text()).toContain('foo give clue,');
    expect(wrapper.text()).toContain('Red Team select cards!');
  });
});
