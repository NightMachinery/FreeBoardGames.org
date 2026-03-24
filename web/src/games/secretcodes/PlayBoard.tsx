import { IG, CardColor, Team, TeamColor, Phases } from './definitions';
import { Ctx } from 'boardgame.io';
import { IGameArgs } from 'gamesShared/definitions/game';
import * as React from 'react';
import css from './board.module.css';
import { isLocalGame } from 'gamesShared/helpers/gameMode';
import Button from '@material-ui/core/Button';
import Slider from '@material-ui/core/Slider';
import {
  canPlayerGuessCurrentTeam,
  getCurrentTeam,
  getPlayerTeam,
  isPlayerRepresentative,
  isPlayerSpymaster,
} from './util';
import { PlayerBadges } from 'gamesShared/components/badges/PlayerBadges';
import { GameMode } from 'gamesShared/definitions/mode';
import { Trans, WithCurrentGameTranslation, withCurrentGameTranslation } from 'infra/i18n';
import { compose } from 'recompose';
import {
  fetchSecretcodesPicturesManifest,
  getSecretcodesPictureImageUrl,
  pickSecretcodesPictureImageIds,
} from './pictures';

interface IPlayBoardInnerProps extends WithCurrentGameTranslation {}
interface IPlayBoardOutterProps {
  G: IG;
  ctx: Ctx;
  moves: any;
  events: any;
  playerID: string | null;
  gameArgs?: IGameArgs;
  isActive: boolean;
  isHost: boolean;
  isGameOver?: boolean;
}

interface IPlayBoardState {
  spymasterView: boolean;
  picturesLoaded: boolean;
  picturesAvailable: boolean;
  pictureImageIds: string[];
  pictureCardsPerRow: number;
}

const DEFAULT_PICTURE_CARDS_PER_ROW = 5;
const MIN_PICTURE_CARDS_PER_ROW = 3;
const MAX_PICTURE_CARDS_PER_ROW = 10;
const PICTURE_CARDS_PER_ROW_STORAGE_KEY = 'secretcodesPicturesCardsPerRow';

function clampPictureCardsPerRow(value: unknown): number {
  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue)) {
    return DEFAULT_PICTURE_CARDS_PER_ROW;
  }

  return Math.min(MAX_PICTURE_CARDS_PER_ROW, Math.max(MIN_PICTURE_CARDS_PER_ROW, Math.round(parsedValue)));
}

function loadPictureCardsPerRowPreference(): number {
  if (typeof window === 'undefined') {
    return DEFAULT_PICTURE_CARDS_PER_ROW;
  }

  try {
    const storedValue = localStorage.getItem(PICTURE_CARDS_PER_ROW_STORAGE_KEY);
    if (storedValue === null) {
      return DEFAULT_PICTURE_CARDS_PER_ROW;
    }

    return clampPictureCardsPerRow(JSON.parse(storedValue));
  } catch {
    return DEFAULT_PICTURE_CARDS_PER_ROW;
  }
}

function persistPictureCardsPerRowPreference(value: number) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(PICTURE_CARDS_PER_ROW_STORAGE_KEY, JSON.stringify(clampPictureCardsPerRow(value)));
  } catch {}
}

export class PlayBoardInternal extends React.Component<IPlayBoardInnerProps & IPlayBoardOutterProps, IPlayBoardState> {
  state = {
    spymasterView: false,
    picturesLoaded: !this.props.G.picturesMode,
    picturesAvailable: !this.props.G.picturesMode,
    pictureImageIds: [],
    pictureCardsPerRow: DEFAULT_PICTURE_CARDS_PER_ROW,
  };

  componentDidMount() {
    const pictureCardsPerRow = loadPictureCardsPerRowPreference();
    if (pictureCardsPerRow !== this.state.pictureCardsPerRow) {
      this.setState({ pictureCardsPerRow });
    }
    this._loadPicturesIfNeeded();
  }

  componentDidUpdate(prevProps: IPlayBoardInnerProps & IPlayBoardOutterProps) {
    if (
      prevProps.G.picturesMode !== this.props.G.picturesMode ||
      prevProps.G.picturesSeed !== this.props.G.picturesSeed
    ) {
      this._loadPicturesIfNeeded();
    }
  }

  _isActive() {
    return isLocalGame(this.props.gameArgs) || this.props.isActive;
  }

  _currentTeam(): Team {
    return getCurrentTeam(this.props.G);
  }

  _playerID(): string | null {
    if (isLocalGame(this.props.gameArgs)) {
      return this.props.ctx.currentPlayer;
    } else {
      return this.props.playerID;
    }
  }

  _showSpymasterView = (): boolean =>
    this.props.isGameOver || (isPlayerSpymaster(this.props.G, this._playerID()) && this.state.spymasterView);

  _toggleSpymasterView = (): void => this.setState({ spymasterView: !this.state.spymasterView });

  _canGuess = (): boolean => canPlayerGuessCurrentTeam(this.props.G, this.props.ctx, this._playerID());

  _setPictureCardsPerRow = (_: unknown, newValue: number | number[]) => {
    const pictureCardsPerRow = clampPictureCardsPerRow(Array.isArray(newValue) ? newValue[0] : newValue);
    persistPictureCardsPerRowPreference(pictureCardsPerRow);
    this.setState({ pictureCardsPerRow });
  };

  _chooseCard = (cardIndex: number) => {
    if (!this._isActive()) return;
    if (this.props.ctx.phase !== Phases.guess) return;
    if (!this._canGuess()) return;
    if (this.props.G.cards[cardIndex].revealed) return;

    this.props.moves.chooseCard(cardIndex);
  };

  _pass = () => {
    if (!this._isActive()) return;
    if (!this._canGuess()) return;

    this.props.moves.pass();
  };

  _loadPicturesIfNeeded = () => {
    if (!this.props.G.picturesMode) {
      this.setState({
        picturesLoaded: true,
        picturesAvailable: true,
        pictureImageIds: [],
      });
      return;
    }

    this.setState({
      picturesLoaded: false,
      picturesAvailable: false,
      pictureImageIds: [],
    });

    fetchSecretcodesPicturesManifest()
      .then((manifest) => {
        const pictureImageIds = manifest.available
          ? pickSecretcodesPictureImageIds(manifest.imageIds, this.props.G.picturesSeed, this.props.G.cards.length)
          : [];
        this.setState({
          picturesLoaded: true,
          picturesAvailable: manifest.available && pictureImageIds.length === this.props.G.cards.length,
          pictureImageIds,
        });
      })
      .catch(() => {
        this.setState({
          picturesLoaded: true,
          picturesAvailable: false,
          pictureImageIds: [],
        });
      });
  };

  _renderHeader = () => {
    let instruction;
    const currentTeam = this._currentTeam();

    const button =
      this._isActive() && this._canGuess() ? (
        <Button className={css.playActionBtn} variant="contained" onClick={this._pass}>
          {this.props.translate('pass')}
        </Button>
      ) : null;
    let spymasterInstructions;
    if (this.props.gameArgs.mode === GameMode.OnlineFriend) {
      const spymasterNames = currentTeam.spymasterIDs
        .map((playerID) => this.props.gameArgs.players[playerID]?.name)
        .filter(Boolean)
        .join(', ');
      if (spymasterNames) {
        spymasterInstructions =
          currentTeam.spymasterIDs.length > 1 ? (
            <Trans
              t={this.props.translate}
              i18nKey="spymasters_give_clue"
              values={{ names: spymasterNames }}
              components={{ strong: <strong /> }}
            />
          ) : (
            <Trans
              t={this.props.translate}
              i18nKey="spymaster_give_clue"
              values={{ name: spymasterNames }}
              components={{ strong: <strong /> }}
            />
          );
      }
    }

    instruction = (
      <p>
        {spymasterInstructions}
        {currentTeam.color === TeamColor.Red ? (
          <Trans t={this.props.translate} i18nKey="red_team_select_cards" components={{ strong: <strong /> }} />
        ) : (
          <Trans t={this.props.translate} i18nKey="blue_team_select_cards" components={{ strong: <strong /> }} />
        )}
        {button}
      </p>
    );

    return (
      <div className={css.header}>
        <h3 className={currentTeam.color === TeamColor.Red ? css.redTitle : css.blueTitle}>
          {currentTeam.color === TeamColor.Red ? this.props.translate('red_team') : this.props.translate('blue_team')}
        </h3>
        {instruction}
      </div>
    );
  };

  _renderCardContent = (cardIndex: number) => {
    const card = this.props.G.cards[cardIndex];
    if (!this.props.G.picturesMode) {
      return card.word;
    }

    const imageId = this.state.pictureImageIds[cardIndex];
    if (imageId) {
      return <img className={css.cardImage} src={getSecretcodesPictureImageUrl(imageId)} alt="" draggable={false} />;
    }

    return <span className={css.cardFallbackWord}>{card.word}</span>;
  };

  _renderPictureControls = () => {
    if (!this.props.G.picturesMode) {
      return null;
    }

    return (
      <div className={css.pictureControls}>
        <p className={css.pictureControlLabel}>
          {this.props.translate('pictures_mode_images_per_row')} {this.state.pictureCardsPerRow}
        </p>
        <Slider
          data-testid="pictures-cards-per-row-slider"
          value={this.state.pictureCardsPerRow}
          min={MIN_PICTURE_CARDS_PER_ROW}
          max={MAX_PICTURE_CARDS_PER_ROW}
          step={1}
          valueLabelDisplay="auto"
          onChange={this._setPictureCardsPerRow}
          aria-label={this.props.translate('pictures_mode_images_per_row')}
        />
      </div>
    );
  };

  _renderCardGrid = () => {
    const board = [];
    const boardClasses = [css.board];
    const boardStyle = this.props.G.picturesMode
      ? ({ ['--pictures-columns' as '--pictures-columns']: this.state.pictureCardsPerRow } as React.CSSProperties)
      : undefined;
    if (this.props.G.picturesMode) {
      boardClasses.push(css.boardPictures);
    }

    for (let i = 0; i < this.props.G.cards.length; i += 1) {
      const card = this.props.G.cards[i];

      const classes = [css.card];
      if (this.props.G.picturesMode) {
        classes.push(css.cardPictures);
      }
      if (card.revealed && this._showSpymasterView() && !this.props.isGameOver) {
        classes.push(css.cardRevealedSpymasterView);
      }

      if (card.revealed || this._showSpymasterView()) {
        if (card.color === CardColor.blue) classes.push(css.cardBlue);
        else if (card.color === CardColor.red) classes.push(css.cardRed);
        else if (card.color === CardColor.civilian) classes.push(css.cardCivilian);
        else if (card.color === CardColor.assassin) classes.push(css.cardAssassin);

        if (i === this.props.G.lastSelectedCardIndex) classes.push(css.cardLastSelected);

        classes.push(css.cardRevealed);
      }

      board.push(
        <div className={classes.join(' ')} key={i} onClick={() => this._chooseCard(i)}>
          {this.props.G.picturesMode ? (
            <span className={css.cardIndexBadge} data-testid={`picture-card-badge-${i + 1}`}>
              {i + 1}
            </span>
          ) : null}
          {this._renderCardContent(i)}
        </div>,
      );
    }

    return (
      <div className={boardClasses.join(' ')} style={boardStyle}>
        {board}
      </div>
    );
  };

  _renderPlayerBadges = () => {
    const colors = this.props.gameArgs.players
      .map((player) => player.playerID.toString())
      .map((playerID) => getPlayerTeam(this.props.G, playerID).color)
      .map((color) => (color == TeamColor.Red ? '#F25F5C' : '#247BA0'));

    const prefixes = this.props.gameArgs.players
      .map((player) => player.playerID.toString())
      .map((playerID) => {
        if (isPlayerSpymaster(this.props.G, playerID.toString())) return '🕵';
        if (isPlayerRepresentative(this.props.G, playerID.toString())) return '🗳';
        return undefined;
      });

    return (
      <PlayerBadges
        playerID={this.props.playerID}
        players={this.props.gameArgs.players}
        prefixes={prefixes}
        colors={colors}
        ctx={this.props.ctx}
      />
    );
  };

  _renderActionButtons = () => {
    if (isPlayerSpymaster(this.props.G, this._playerID())) {
      return (
        <Button className={css.selectTeamBtn} variant="contained" onClick={this._toggleSpymasterView}>
          {this.state.spymasterView
            ? this.props.translate('toggle_view_spymaster')
            : this.props.translate('toggle_view_normal')}
        </Button>
      );
    }
  };

  _renderPictureSection = () => (
    <>
      {this.props.G.picturesMode && this.state.picturesLoaded && !this.state.picturesAvailable ? (
        <p className={css.pictureStatus}>{this.props.translate('pictures_mode_unavailable')}</p>
      ) : null}
      {this._renderPictureControls()}
      {this._renderCardGrid()}
    </>
  );

  render() {
    if (this.props.isGameOver) {
      return this._renderPictureSection();
    }
    return (
      <div>
        {this._renderHeader()}
        {this._renderPictureSection()}
        {this._renderActionButtons()}
        {this._renderPlayerBadges()}
      </div>
    );
  }
}
const enhance = compose<IPlayBoardInnerProps, IPlayBoardOutterProps>(withCurrentGameTranslation);
export const PlayBoard = enhance(PlayBoardInternal);
