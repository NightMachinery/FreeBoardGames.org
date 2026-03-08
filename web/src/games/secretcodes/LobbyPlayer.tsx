import * as React from 'react';
import css from './Lobby.module.css';
import { getPlayerTeam, isPlayerRepresentative, isPlayerSpymaster } from './util';
import { IG } from './definitions';
import { useCurrentGameTranslation } from 'infra/i18n';

interface ILobbyPlayerProps {
  G: IG;
  moves: any;
  playerID: string;
  players: any;
  isHost: boolean;
}

export function LobbyPlayer({ G, moves, playerID, players, isHost }: ILobbyPlayerProps) {
  const { translate } = useCurrentGameTranslation();

  const toggleSpymaster = (playerID: string) => {
    moves.toggleSpymaster(playerID);
  };

  const toggleRepresentative = (playerID: string) => {
    moves.toggleRepresentative(playerID);
  };

  const isPlayerInTeam = (): boolean => {
    return getPlayerTeam(G, playerID) !== undefined;
  };

  const isSpymaster = isPlayerSpymaster(G, playerID);
  const isRepresentative = isPlayerRepresentative(G, playerID);

  return (
    <li>
      {isSpymaster ? <span>{translate('s')}</span> : null}
      {isRepresentative ? <span>{translate('r')}</span> : null}
      {players[playerID].name}
      {isHost && isPlayerInTeam() ? (
        <React.Fragment>
          <button className={[css.btn, css.btnSpymaster].join(' ')} onClick={() => toggleSpymaster(playerID)}>
            {translate(isSpymaster ? 'remove_spymaster' : 'make_spymaster')}
          </button>
          <button className={[css.btn, css.btnSpymaster].join(' ')} onClick={() => toggleRepresentative(playerID)}>
            {translate(isRepresentative ? 'remove_representative' : 'make_representative')}
          </button>
        </React.Fragment>
      ) : null}
    </li>
  );
}
