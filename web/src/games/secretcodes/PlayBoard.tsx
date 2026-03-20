import { IG, CardColor, Team, TeamColor, Phases } from './definitions';
import { Ctx } from 'boardgame.io';
import { IGameArgs } from 'gamesShared/definitions/game';
import * as React from 'react';
import css from './board.module.css';
import { isLocalGame } from 'gamesShared/helpers/gameMode';
import Button from '@material-ui/core/Button';
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
}

export class PlayBoardInternal extends React.Component<IPlayBoardInnerProps & IPlayBoardOutterProps, IPlayBoardState> {
  state = {
    spymasterView: false,
    picturesLoaded: !this.props.G.picturesMode,
    picturesAvailable: !this.props.G.picturesMode,
    pictureImageIds: [],
  };

  componentDidMount() {
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
            <>{this.props.translate('spymasters_give_clue', { names: spymasterNames })}</>
          ) : (
            <>{this.props.translate('spymaster_give_clue', { name: spymasterNames })}</>
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

  _renderCardGrid = () => {
    let board = [];
    const boardClasses = [css.board];
    if (this.props.G.picturesMode) {
      boardClasses.push(css.boardPictures);
    }

    for (let i = 0; i < 25; i += 1) {
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
          {this._renderCardContent(i)}
        </div>,
      );
    }

    return <div className={boardClasses.join(' ')}>{board}</div>;
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

  render() {
    if (this.props.isGameOver) {
      return this._renderCardGrid();
    }
    return (
      <div>
        {this._renderHeader()}
        {this.props.G.picturesMode && this.state.picturesLoaded && !this.state.picturesAvailable ? (
          <p className={css.pictureStatus}>{this.props.translate('pictures_mode_unavailable')}</p>
        ) : null}
        {this._renderCardGrid()}
        {this._renderActionButtons()}
        {this._renderPlayerBadges()}
      </div>
    );
  }
}
const enhance = compose<IPlayBoardInnerProps, IPlayBoardOutterProps>(withCurrentGameTranslation);
export const PlayBoard = enhance(PlayBoardInternal);
