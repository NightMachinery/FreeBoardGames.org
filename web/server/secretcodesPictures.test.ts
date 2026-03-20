import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  buildSecretcodesPicturesCatalog,
  expandHomeDir,
  resetSecretcodesPicturesCatalogCache,
} from './secretcodesPictures';

describe('secretcodesPictures', () => {
  afterEach(() => {
    resetSecretcodesPicturesCatalogCache();
  });

  it('should expand home-directory shorthand', () => {
    expect(expandHomeDir('~/Pictures')).toEqual(path.join(os.homedir(), 'Pictures'));
  });

  it('should recursively follow symlinks without duplicating or looping forever', async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'secretcodes-pictures-'));
    const nestedDir = path.join(tmpRoot, 'nested');
    const viaLinkDir = path.join(tmpRoot, 'via-link');
    const cycleLink = path.join(nestedDir, 'cycle');
    fs.mkdirSync(nestedDir);
    fs.writeFileSync(path.join(tmpRoot, 'one.jpg'), 'one');
    fs.writeFileSync(path.join(nestedDir, 'two.png'), 'two');
    fs.writeFileSync(path.join(nestedDir, 'ignore.txt'), 'nope');
    fs.symlinkSync(nestedDir, viaLinkDir);
    fs.symlinkSync(tmpRoot, cycleLink);

    try {
      const catalog = await buildSecretcodesPicturesCatalog(tmpRoot);

      expect(catalog.enabled).toEqual(true);
      expect(catalog.count).toEqual(2);
      expect(catalog.imageIds).toHaveLength(2);
      expect(catalog.available).toEqual(false);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});
