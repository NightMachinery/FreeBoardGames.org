import { detectIsMobile } from 'infra/common/device/detectIsMobile';

export const PICTURE_CARDS_PER_ROW_STORAGE_KEY = 'secretcodesPicturesCardsPerRow';
export const WORDS_CARDS_PER_ROW_STORAGE_KEY = 'secretcodesWordsCardsPerRow';
export const SPYMASTER_PICTURE_HIGHLIGHTS_STORAGE_KEY = 'secretcodesSpymasterPictureHighlights';
export const PICTURE_CARD_NUMBERS_VISIBLE_STORAGE_KEY = 'secretcodesPictureCardNumbersVisible';
export const CONFIRM_ACTIONS_STORAGE_KEY = 'secretcodesConfirmActionsEnabled';
export const CHAT_SOUNDS_STORAGE_KEY = 'secretcodesChatSoundsEnabled';
export const CARD_CHOICE_SOUNDS_STORAGE_KEY = 'secretcodesCardChoiceSoundsEnabled';

function loadBooleanPreference(key: string, defaultValue: boolean | (() => boolean)): boolean {
  const resolvedDefaultValue = typeof defaultValue === 'function' ? defaultValue() : defaultValue;
  if (typeof window === 'undefined') {
    return resolvedDefaultValue;
  }

  try {
    const storedValue = localStorage.getItem(key);
    if (storedValue === null) {
      return resolvedDefaultValue;
    }

    return JSON.parse(storedValue) === true;
  } catch {
    return resolvedDefaultValue;
  }
}

function persistBooleanPreference(key: string, value: boolean) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export function loadSecretcodesPictureCardNumbersVisiblePreference(): boolean {
  return loadBooleanPreference(PICTURE_CARD_NUMBERS_VISIBLE_STORAGE_KEY, true);
}

export function persistSecretcodesPictureCardNumbersVisiblePreference(value: boolean) {
  persistBooleanPreference(PICTURE_CARD_NUMBERS_VISIBLE_STORAGE_KEY, value);
}

export function loadSecretcodesConfirmActionsPreference(): boolean {
  return loadBooleanPreference(CONFIRM_ACTIONS_STORAGE_KEY, () => detectIsMobile());
}

export function persistSecretcodesConfirmActionsPreference(value: boolean) {
  persistBooleanPreference(CONFIRM_ACTIONS_STORAGE_KEY, value);
}

export function loadSecretcodesChatSoundsPreference(): boolean {
  return loadBooleanPreference(CHAT_SOUNDS_STORAGE_KEY, true);
}

export function persistSecretcodesChatSoundsPreference(value: boolean) {
  persistBooleanPreference(CHAT_SOUNDS_STORAGE_KEY, value);
}

export function loadSecretcodesCardChoiceSoundsPreference(): boolean {
  return loadBooleanPreference(CARD_CHOICE_SOUNDS_STORAGE_KEY, true);
}

export function persistSecretcodesCardChoiceSoundsPreference(value: boolean) {
  persistBooleanPreference(CARD_CHOICE_SOUNDS_STORAGE_KEY, value);
}
