import * as React from 'react';
import { IG, TeamColor } from './definitions';
import css from './Lobby.module.css';
import { LobbyTeam } from './LobbyTeam';
import { IGameArgs } from 'gamesShared/definitions/game';
import { LobbyPlayer } from './LobbyPlayer';
import { Ctx } from 'boardgame.io';
import { isLocalGame } from '../../gamesShared/helpers/gameMode';
import Button from '@material-ui/core/Button';
import { getPlayerTeam, gameCanStart } from './util';
import { useCurrentGameTranslation } from 'infra/i18n';
import { fetchSecretcodesPicturesManifest } from './pictures';

interface ILobbyProps {
  G: IG;
  ctx: Ctx;
  moves: any;
  events: any;
  playerID: string;
  gameArgs?: IGameArgs;
  isHost: boolean;
}

export function Lobby({ G, ctx, moves, playerID, gameArgs, isHost }: ILobbyProps) {
  const { translate } = useCurrentGameTranslation();
  const [picturesValidation, setPicturesValidation] = React.useState({
    loading: G.picturesMode,
    available: !G.picturesMode,
    count: 0,
  });

  const startGame = () => {
    moves.startGame();
  };

  React.useEffect(() => {
    let mounted = true;

    if (!G.picturesMode) {
      setPicturesValidation({
        loading: false,
        available: true,
        count: 0,
      });
      return () => {
        mounted = false;
      };
    }

    setPicturesValidation((current) => ({ ...current, loading: true }));
    fetchSecretcodesPicturesManifest()
      .then((manifest) => {
        if (!mounted) {
          return;
        }

        setPicturesValidation({
          loading: false,
          available: manifest.available,
          count: manifest.count,
        });
      })
      .catch(() => {
        if (!mounted) {
          return;
        }

        setPicturesValidation({
          loading: false,
          available: false,
          count: 0,
        });
      });

    return () => {
      mounted = false;
    };
  }, [G.picturesMode]);

  React.useEffect(() => {
    if (isLocalGame(gameArgs) && gameCanStart(G, ctx) && (!G.picturesMode || picturesValidation.available)) {
      startGame();
    }
  }, [G, ctx, gameArgs, picturesValidation.available, G.picturesMode]);

  const teams = {
    [TeamColor.Blue]: [],
    [TeamColor.Red]: [],
    unassigned: [],
  };

  const { players } = gameArgs;
  const canStart = gameCanStart(G, ctx) && (!G.picturesMode || picturesValidation.available);
  const showPicturesLoading = G.picturesMode && picturesValidation.loading;
  const showPicturesError = G.picturesMode && !picturesValidation.loading && !picturesValidation.available;

  for (const playerID in players) {
    const item = (
      <LobbyPlayer key={playerID} G={G} moves={moves} playerID={playerID} players={players} isHost={isHost} />
    );

    teams[getPlayerTeam(G, playerID)?.color || 'unassigned'].push(item);
  }

  return (
    <div className={css.wrapper}>
      <h1 className={css.title}>{translate('select_teams')}</h1>

      <div className={css.teamsContainer}>
        <LobbyTeam
          moves={moves}
          G={G}
          playerID={playerID}
          classes={[css.team, css.teamBlue].join(' ')}
          teamName={translate('blue_team')}
          teamPlayers={teams[TeamColor.Blue]}
          teamColor={TeamColor.Blue}
        />
        <LobbyTeam
          moves={moves}
          G={G}
          playerID={playerID}
          classes={[css.team, css.teamRed].join(' ')}
          teamName={translate('red_team')}
          teamPlayers={teams[TeamColor.Red]}
          teamColor={TeamColor.Red}
        />
        <div className={[css.team, css.unassigned].join(' ')}>
          <h3>{translate('unassigned')}</h3>
          <ul>{teams.unassigned}</ul>
        </div>
      </div>

      {!gameCanStart(G, ctx) ? <p className={css.text}>{translate('in_order_to_start')}</p> : null}
      {showPicturesLoading ? <p className={css.text}>{translate('pictures_mode_loading')}</p> : null}
      {showPicturesError ? (
        <p className={css.text}>{translate('pictures_mode_requires_images', { count: picturesValidation.count })}</p>
      ) : null}

      {isHost ? (
        <Button
          style={{ float: 'right' }}
          variant="contained"
          onClick={startGame}
          color="primary"
          disabled={!canStart || showPicturesLoading}
        >
          {translate('play')}
        </Button>
      ) : null}
    </div>
  );
}
