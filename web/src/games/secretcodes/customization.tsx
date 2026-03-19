import React from 'react';
import { GameCustomization, GameCustomizationProps } from 'gamesShared/definitions/customization';
import { PREDEFINED_WORDS } from './constants';
import TextField from '@material-ui/core/TextField';
import Select from '@material-ui/core/Select';
import MenuItem from '@material-ui/core/MenuItem';
import Typography from '@material-ui/core/Typography';
import { useCurrentGameTranslation } from 'infra/i18n';

export interface FullCustomizationState {
  words: string[];
  blackCards: number;
}

export const DEFAULT_FULL_CUSTOMIZATION = {
  words: PREDEFINED_WORDS[0].words,
  blackCards: 1,
};

const BLACK_CARD_OPTIONS = Array.from({ length: 9 }, (_, count) => count);

const normalizeState = (state?: FullCustomizationState): FullCustomizationState => ({
  words: state?.words || DEFAULT_FULL_CUSTOMIZATION.words,
  blackCards: state?.blackCards ?? DEFAULT_FULL_CUSTOMIZATION.blackCards,
});

const stateToText = (state: FullCustomizationState) => {
  return state.words.join('\n');
};

const toOptionalState = (state: FullCustomizationState): FullCustomizationState | undefined => {
  const normalized = normalizeState(state);
  const hasDefaultWords = stateToText(normalized) === stateToText(DEFAULT_FULL_CUSTOMIZATION);
  const hasDefaultBlackCards = normalized.blackCards === DEFAULT_FULL_CUSTOMIZATION.blackCards;
  if (hasDefaultWords && hasDefaultBlackCards) {
    return;
  }
  return normalized;
};

const changeTextValue =
  (onChange: (state?: FullCustomizationState) => void, state: FullCustomizationState) =>
  (event: React.ChangeEvent<HTMLInputElement>) => {
    const inputText = event.target.value;
    onChange(
      toOptionalState({
        ...state,
        words: inputText.split('\n'),
      }),
    );
  };

const getPredefinedWordsBucket = (state: FullCustomizationState) => {
  const normalizedState = normalizeState(state);
  let i = 0;
  for (const predefinedWords of PREDEFINED_WORDS) {
    if (
      stateToText({ words: predefinedWords.words, blackCards: normalizedState.blackCards }) ===
      stateToText(normalizedState)
    ) {
      return i;
    }
    i++;
  }
  return null;
};

const handlePredefinedWordChange =
  (onChange: (state?: FullCustomizationState) => void, state: FullCustomizationState) =>
  (event: React.ChangeEvent<{ value: number }>) => {
    const index = event.target.value;
    if (index === null) {
      return;
    }
    const words = PREDEFINED_WORDS[index].words;
    onChange(
      toOptionalState({
        ...state,
        words,
      }),
    );
  };

const changeBlackCards =
  (onChange: (state?: FullCustomizationState) => void, state: FullCustomizationState) =>
  (event: React.ChangeEvent<{ value: number }>) => {
    const blackCards = Number(event.target.value);
    onChange(
      toOptionalState({
        ...state,
        blackCards,
      }),
    );
  };

const renderSelectValue = (index: number | null) => {
  const { translate } = useCurrentGameTranslation();
  if (index === null) {
    return translate('custom');
  }
  return PREDEFINED_WORDS[index].label;
};

const renderPredefinedWordsSelect = (
  onChange: (state?: FullCustomizationState) => void,
  state: FullCustomizationState,
) => {
  return (
    <Select
      value={getPredefinedWordsBucket(state)}
      displayEmpty
      renderValue={renderSelectValue}
      onChange={handlePredefinedWordChange(onChange, state)}
      style={{ width: '250px' }}
    >
      {PREDEFINED_WORDS.map((predefinedWords, index) => (
        <MenuItem value={index} key={index}>
          {predefinedWords.label}
        </MenuItem>
      ))}
    </Select>
  );
};

const FullCustomization = ({ currentValue, onChange }: GameCustomizationProps) => {
  const { translate } = useCurrentGameTranslation();
  const state = normalizeState(currentValue as FullCustomizationState | undefined);
  return (
    <div>
      {renderPredefinedWordsSelect(onChange, state)}
      <div style={{ height: '16px' }}></div>
      <Typography>{translate('black_cards')}</Typography>
      <Select value={state.blackCards} onChange={changeBlackCards(onChange, state)} style={{ width: '250px' }}>
        {BLACK_CARD_OPTIONS.map((blackCards) => (
          <MenuItem value={blackCards} key={blackCards}>
            {blackCards}
          </MenuItem>
        ))}
      </Select>
      <div style={{ height: '32px' }}></div>
      <TextField
        label={translate('words', { size: state.words.length })}
        multiline
        style={{ width: '250px' }}
        rows={15}
        value={stateToText(state)}
        variant="outlined"
        onChange={changeTextValue(onChange, state)}
      />
    </div>
  );
};

const customization: GameCustomization = {
  FullCustomization,
};

export default customization;
