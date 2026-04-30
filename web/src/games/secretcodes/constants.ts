export interface PredefinedWords {
  label: string;
  words: string[];
}

export function parseWordpackText(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

function labelFromFilename(filename: string): string {
  return filename.replace(/^\.\//, '');
}

const WORDPACK_LABEL_ORDER = [
  'english.txt',
  'english-alternative.txt',
  'dutch.txt',
  'czech.txt',
  'german.txt',
  'persian-1.txt',
  'harry-potter-1.txt',
  'harry-potter-1-fa.txt',
];

function compareWordpacks(a: PredefinedWords, b: PredefinedWords): number {
  const aIndex = WORDPACK_LABEL_ORDER.indexOf(a.label);
  const bIndex = WORDPACK_LABEL_ORDER.indexOf(b.label);
  if (aIndex >= 0 || bIndex >= 0) {
    if (aIndex < 0) return 1;
    if (bIndex < 0) return -1;
    return aIndex - bIndex;
  }

  return a.label.localeCompare(b.label);
}

function getWebpackWordpacks(): PredefinedWords[] | null {
  const maybeRequire = typeof require === 'undefined' ? undefined : (require as any);
  if (!maybeRequire?.context) {
    return null;
  }

  const context = maybeRequire.context('./wordpacks', false, /\.txt$/);
  return context
    .keys()
    .map((filename: string) => {
      const text = context(filename).default || context(filename);
      return {
        label: labelFromFilename(filename),
        words: parseWordpackText(text),
      };
    })
    .sort(compareWordpacks);
}

function getNodeWordpacks(): PredefinedWords[] {
  try {
    const nodeRequire = eval('require') as any;
    const fs = nodeRequire('fs') as typeof import('fs');
    const path = nodeRequire('path') as typeof import('path');
    const wordpacksDir = path.join(__dirname, 'wordpacks');
    return fs
      .readdirSync(wordpacksDir)
      .filter((filename) => filename.toLowerCase().endsWith('.txt'))
      .map((filename) => {
        const text = fs.readFileSync(path.join(wordpacksDir, filename), 'utf8');
        return {
          label: labelFromFilename(filename),
          words: parseWordpackText(text),
        };
      })
      .sort(compareWordpacks);
  } catch {
    return [];
  }
}

export const PREDEFINED_WORDS: PredefinedWords[] = getWebpackWordpacks() || getNodeWordpacks();
