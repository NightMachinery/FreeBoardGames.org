import { parseWordpackText, PREDEFINED_WORDS } from './constants';

describe('Secret Codes wordpacks', () => {
  it('parses text wordpacks by skipping comments and blank lines', () => {
    expect(parseWordpackText('\n# Label\n alpha \n# ignored\n\tbeta\t\n')).toEqual(['alpha', 'beta']);
  });

  it('loads the built-in text wordpacks', () => {
    expect(PREDEFINED_WORDS.map((wordpack) => wordpack.label)).toEqual([
      'english',
      'english-alternative',
      'dutch',
      'czech',
      'german',
      'persian-1',
      'harry-potter-1',
      'harry-potter-1-fa',
      'Adult_Fa_1',
    ]);
    expect(PREDEFINED_WORDS[0].words.length).toBeGreaterThanOrEqual(25);
  });
});
