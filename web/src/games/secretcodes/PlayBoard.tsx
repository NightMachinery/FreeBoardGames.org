import { IG, CardColor, Team, TeamColor, Phases } from './definitions';
import { Ctx } from 'boardgame.io';
import { IGameArgs } from 'gamesShared/definitions/game';
import * as React from 'react';
import css from './board.module.css';
import { isLocalGame } from 'gamesShared/helpers/gameMode';
import Button from '@material-ui/core/Button';
import Dialog from '@material-ui/core/Dialog';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import DialogTitle from '@material-ui/core/DialogTitle';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import Slider from '@material-ui/core/Slider';
import Switch from '@material-ui/core/Switch';
import {
  canPlayerGuessCurrentTeam,
  getCurrentTeam,
  getPlayerTeam,
  getRemainingCardCounts,
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
import {
  loadSecretcodesCardChoiceSoundsPreference,
  loadSecretcodesConfirmActionsPreference,
  loadSecretcodesPictureCardNumbersVisiblePreference,
  persistSecretcodesCardChoiceSoundsPreference,
  persistSecretcodesConfirmActionsPreference,
  persistSecretcodesPictureCardNumbersVisiblePreference,
  PICTURE_CARDS_PER_ROW_STORAGE_KEY,
  SPYMASTER_PICTURE_HIGHLIGHTS_STORAGE_KEY,
} from './preferences';
import { playSecretcodesCardChoiceSound } from './sound';

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
  chatSoundEnabled: boolean;
  setChatSoundEnabled: (enabled: boolean) => void;
}

type PendingAction = { type: 'guess'; cardIndex: number } | { type: 'pass' } | null;

interface IPlayBoardState {
  spymasterView: boolean;
  spymasterPictureHighlights: boolean;
  picturesLoaded: boolean;
  picturesAvailable: boolean;
  pictureImageIds: string[];
  pictureCardsPerRow: number;
  pictureCardNumbersVisible: boolean;
  confirmActionsEnabled: boolean;
  cardChoiceSoundsEnabled: boolean;
  pendingAction: PendingAction;
}

const DEFAULT_PICTURE_CARDS_PER_ROW = 5;
const MIN_PICTURE_CARDS_PER_ROW = 3;
const MAX_PICTURE_CARDS_PER_ROW = 10;

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

function loadSpymasterPictureHighlightsPreference(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    const storedValue = localStorage.getItem(SPYMASTER_PICTURE_HIGHLIGHTS_STORAGE_KEY);
    if (storedValue === null) {
      return false;
    }

    return JSON.parse(storedValue) === true;
  } catch {
    return false;
  }
}

function persistSpymasterPictureHighlightsPreference(value: boolean) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(SPYMASTER_PICTURE_HIGHLIGHTS_STORAGE_KEY, JSON.stringify(value));
  } catch {}
}

export class PlayBoardInternal extends React.Component<IPlayBoardInnerProps & IPlayBoardOutterProps, IPlayBoardState> {
  state: IPlayBoardState = {
    spymasterView: false,
    spymasterPictureHighlights: false,
    picturesLoaded: !this.props.G.picturesMode,
    picturesAvailable: !this.props.G.picturesMode,
    pictureImageIds: [],
    pictureCardsPerRow: DEFAULT_PICTURE_CARDS_PER_ROW,
    pictureCardNumbersVisible: true,
    confirmActionsEnabled: false,
    cardChoiceSoundsEnabled: true,
    pendingAction: null,
  };

  componentDidMount() {
    const pictureCardsPerRow = loadPictureCardsPerRowPreference();
    const spymasterPictureHighlights = loadSpymasterPictureHighlightsPreference();
    const pictureCardNumbersVisible = loadSecretcodesPictureCardNumbersVisiblePreference();
    const confirmActionsEnabled = loadSecretcodesConfirmActionsPreference();
    const cardChoiceSoundsEnabled = loadSecretcodesCardChoiceSoundsPreference();

    this.setState({
      pictureCardsPerRow,
      spymasterPictureHighlights,
      pictureCardNumbersVisible,
      confirmActionsEnabled,
      cardChoiceSoundsEnabled,
    });
    this._loadPicturesIfNeeded();
  }

  componentDidUpdate(prevProps: IPlayBoardInnerProps & IPlayBoardOutterProps) {
    if (
      prevProps.G.picturesMode !== this.props.G.picturesMode ||
      prevProps.G.picturesSeed !== this.props.G.picturesSeed
    ) {
      this._loadPicturesIfNeeded();
    }

    if (
      prevProps.G.lastSelectedCardIndex !== this.props.G.lastSelectedCardIndex &&
      this.props.G.lastSelectedCardIndex !== null &&
      this.state.cardChoiceSoundsEnabled
    ) {
      playSecretcodesCardChoiceSound();
    }

    if (this.state.pendingAction && !this._isPendingActionStillValid(this.state.pendingAction)) {
      this.setState({ pendingAction: null });
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

  _canChooseCard = (cardIndex: number): boolean => {
    if (!this._isActive()) return false;
    if (this.props.ctx.phase !== Phases.guess) return false;
    if (!this._canGuess()) return false;
    if (this.props.G.cards[cardIndex].revealed) return false;

    return true;
  };

  _canPass = (): boolean => {
    if (!this._isActive()) return false;
    if (this.props.ctx.phase !== Phases.guess) return false;
    if (!this._canGuess()) return false;

    return true;
  };

  _setPictureCardsPerRow = (_: unknown, newValue: number | number[]) => {
    const pictureCardsPerRow = clampPictureCardsPerRow(Array.isArray(newValue) ? newValue[0] : newValue);
    persistPictureCardsPerRowPreference(pictureCardsPerRow);
    this.setState({ pictureCardsPerRow });
  };

  _setSpymasterPictureHighlights = (_: React.ChangeEvent<HTMLInputElement>, checked: boolean) => {
    persistSpymasterPictureHighlightsPreference(checked);
    this.setState({ spymasterPictureHighlights: checked });
  };

  _setPictureCardNumbersVisible = (_: React.ChangeEvent<HTMLInputElement>, checked: boolean) => {
    persistSecretcodesPictureCardNumbersVisiblePreference(checked);
    this.setState({ pictureCardNumbersVisible: checked });
  };

  _setConfirmActionsEnabled = (_: React.ChangeEvent<HTMLInputElement>, checked: boolean) => {
    persistSecretcodesConfirmActionsPreference(checked);
    this.setState({ confirmActionsEnabled: checked });
  };

  _setChatSoundEnabled = (_: React.ChangeEvent<HTMLInputElement>, checked: boolean) => {
    this.props.setChatSoundEnabled(checked);
  };

  _setCardChoiceSoundsEnabled = (_: React.ChangeEvent<HTMLInputElement>, checked: boolean) => {
    persistSecretcodesCardChoiceSoundsPreference(checked);
    this.setState({ cardChoiceSoundsEnabled: checked });
  };

  _executeChooseCard = (cardIndex: number) => {
    if (!this._canChooseCard(cardIndex)) return;
    this.props.moves.chooseCard(cardIndex);
  };

  _executePass = () => {
    if (!this._canPass()) return;
    this.props.moves.pass();
  };

  _chooseCard = (cardIndex: number) => {
    if (!this._canChooseCard(cardIndex)) return;
    if (this.state.confirmActionsEnabled) {
      this.setState({ pendingAction: { type: 'guess', cardIndex } });
      return;
    }

    this._executeChooseCard(cardIndex);
  };

  _pass = () => {
    if (!this._canPass()) return;
    if (this.state.confirmActionsEnabled) {
      this.setState({ pendingAction: { type: 'pass' } });
      return;
    }

    this._executePass();
  };

  _closeConfirmDialog = () => {
    this.setState({ pendingAction: null });
  };

  _confirmPendingAction = () => {
    const { pendingAction } = this.state;
    this.setState({ pendingAction: null }, () => {
      if (!pendingAction) {
        return;
      }

      if (pendingAction.type === 'guess') {
        this._executeChooseCard(pendingAction.cardIndex);
        return;
      }

      this._executePass();
    });
  };

  _isPendingActionStillValid = (pendingAction: PendingAction): boolean => {
    if (!pendingAction) {
      return false;
    }

    if (pendingAction.type === 'guess') {
      return this._canChooseCard(pendingAction.cardIndex);
    }

    return this._canPass();
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
        {this._renderRemainingCardCounts()}
      </div>
    );
  };

  _renderRemainingCardCounts = () => {
    const counts = this.props.G.remainingCardCounts ?? getRemainingCardCounts(this.props.G);

    return (
      <div className={css.remainingCounts} data-testid="remaining-card-counts">
        <span className={[css.remainingCountChip, css.remainingCountBlue].join(' ')}>
          {this.props.translate('remaining_blue')}: {counts.blue}
        </span>
        <span className={[css.remainingCountChip, css.remainingCountRed].join(' ')}>
          {this.props.translate('remaining_red')}: {counts.red}
        </span>
        <span className={[css.remainingCountChip, css.remainingCountCivilian].join(' ')}>
          {this.props.translate('remaining_civilian')}: {counts.civilian}
        </span>
        <span className={[css.remainingCountChip, css.remainingCountAssassin].join(' ')}>
          {this.props.translate('remaining_assassin')}: {counts.assassin}
        </span>
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

  _renderControls = () => {
    const controlToggles = [
      this.props.G.picturesMode ? (
        <FormControlLabel
          key="picture-numbers"
          className={css.controlToggle}
          data-testid="picture-card-numbers-toggle"
          control={
            <Switch
              checked={this.state.pictureCardNumbersVisible}
              onChange={this._setPictureCardNumbersVisible}
              color="primary"
            />
          }
          label={this.props.translate('show_picture_numbers')}
        />
      ) : null,
      !this.props.isGameOver ? (
        <FormControlLabel
          key="confirm-actions"
          className={css.controlToggle}
          data-testid="confirm-actions-toggle"
          control={
            <Switch
              checked={this.state.confirmActionsEnabled}
              onChange={this._setConfirmActionsEnabled}
              color="primary"
            />
          }
          label={this.props.translate('confirm_guessing_and_passing')}
        />
      ) : null,
      this.props.gameArgs.mode === GameMode.OnlineFriend ? (
        <FormControlLabel
          key="chat-sounds"
          className={css.controlToggle}
          data-testid="chat-sounds-toggle"
          control={
            <Switch checked={this.props.chatSoundEnabled} onChange={this._setChatSoundEnabled} color="primary" />
          }
          label={this.props.translate('chat_sounds')}
        />
      ) : null,
      <FormControlLabel
        key="card-choice-sounds"
        className={css.controlToggle}
        data-testid="card-choice-sounds-toggle"
        control={
          <Switch
            checked={this.state.cardChoiceSoundsEnabled}
            onChange={this._setCardChoiceSoundsEnabled}
            color="primary"
          />
        }
        label={this.props.translate('card_choice_sounds')}
      />,
    ].filter(Boolean);

    return (
      <div className={css.boardControls}>
        {this.props.G.picturesMode ? (
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
            {isPlayerSpymaster(this.props.G, this._playerID()) && !this.props.isGameOver ? (
              <FormControlLabel
                className={[css.controlToggle, css.pictureHighlightsToggle].join(' ')}
                data-testid="pictures-spymaster-highlights-toggle"
                control={
                  <Switch
                    checked={this.state.spymasterPictureHighlights}
                    onChange={this._setSpymasterPictureHighlights}
                    color="primary"
                  />
                }
                label={this.props.translate('pictures_mode_color_highlights')}
              />
            ) : null}
          </div>
        ) : null}
        <div className={css.controlToggles}>{controlToggles}</div>
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
      const showCardColors = card.revealed || this._showSpymasterView();
      const showSpymasterPictureHighlights =
        this.props.G.picturesMode &&
        !this.props.isGameOver &&
        this.state.spymasterPictureHighlights &&
        this._showSpymasterView();

      const classes = [css.card];
      if (this.props.G.picturesMode) {
        classes.push(css.cardPictures);
      }
      if (card.revealed && this._showSpymasterView() && !this.props.isGameOver) {
        classes.push(css.cardRevealedSpymasterView);
      }

      if (showCardColors) {
        if (card.color === CardColor.blue) classes.push(css.cardBlue);
        else if (card.color === CardColor.red) classes.push(css.cardRed);
        else if (card.color === CardColor.civilian) classes.push(css.cardCivilian);
        else if (card.color === CardColor.assassin) classes.push(css.cardAssassin);

        if (showSpymasterPictureHighlights) classes.push(css.cardPictureHighlight);

        if (i === this.props.G.lastSelectedCardIndex) classes.push(css.cardLastSelected);

        classes.push(css.cardRevealed);
      }

      board.push(
        <div className={classes.join(' ')} key={i} onClick={() => this._chooseCard(i)}>
          {this.props.G.picturesMode && this.state.pictureCardNumbersVisible ? (
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
      {this._renderControls()}
      {this._renderCardGrid()}
    </>
  );

  _renderConfirmDialog = () => {
    const { pendingAction } = this.state;
    if (!pendingAction) {
      return null;
    }

    const isGuess = pendingAction.type === 'guess';
    const pendingCard = isGuess ? this.props.G.cards[pendingAction.cardIndex] : null;

    return (
      <Dialog open={true} onClose={this._closeConfirmDialog} aria-labelledby="secretcodes-confirm-dialog-title">
        <DialogTitle id="secretcodes-confirm-dialog-title">
          {isGuess ? this.props.translate('confirm_guess_title') : this.props.translate('confirm_pass_title')}
        </DialogTitle>
        <DialogContent>
          {isGuess && pendingCard ? (
            <>
              <p>
                {this.props.G.picturesMode
                  ? this.props.translate('confirm_guess_description_picture', { number: pendingAction.cardIndex + 1 })
                  : this.props.translate('confirm_guess_description_word')}
              </p>
              {this.props.G.picturesMode ? (
                <div className={css.confirmDialogPicturePreview}>
                  {this._renderCardContent(pendingAction.cardIndex)}
                </div>
              ) : (
                <p className={css.confirmDialogWord}>{pendingCard.word}</p>
              )}
            </>
          ) : (
            <p>{this.props.translate('confirm_pass_description')}</p>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={this._closeConfirmDialog} color="primary" data-testid="confirm-action-cancel">
            {this.props.translate('cancel')}
          </Button>
          <Button onClick={this._confirmPendingAction} color="primary" variant="contained" data-testid="confirm-action">
            {this.props.translate('confirm_action')}
          </Button>
        </DialogActions>
      </Dialog>
    );
  };

  render() {
    if (this.props.isGameOver) {
      return (
        <>
          {this._renderPictureSection()}
          {this._renderConfirmDialog()}
        </>
      );
    }
    return (
      <div>
        {this._renderHeader()}
        {this._renderPictureSection()}
        {this._renderActionButtons()}
        {this._renderPlayerBadges()}
        {this._renderConfirmDialog()}
      </div>
    );
  }
}
const enhance = compose<IPlayBoardInnerProps, IPlayBoardOutterProps>(withCurrentGameTranslation);
export const PlayBoard = enhance(PlayBoardInternal);
