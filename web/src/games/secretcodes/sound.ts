import CardSelectSound from '../estatebuyer/media/cardSelect.mp3';

let cardChoiceSound: HTMLAudioElement | undefined;

export const playSecretcodesCardChoiceSound = () => {
  if (!cardChoiceSound) {
    cardChoiceSound = new Audio(CardSelectSound);
  }

  cardChoiceSound.play();
};
