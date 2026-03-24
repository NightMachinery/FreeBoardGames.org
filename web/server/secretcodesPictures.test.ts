import { execFile, execFileSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import Jimp from 'jimp';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import {
  buildSecretcodesPicturesCatalog,
  expandHomeDir,
  ISecretcodesPicturesProgressEvent,
  resetSecretcodesPicturesCatalogCache,
  resolveSecretcodesPicturesCacheDir,
  warmSecretcodesPicturesCatalog,
} from './secretcodesPictures';

const execFileAsync = promisify(execFile);
const CARD_HELPER_CANDIDATES = [
  path.resolve(process.cwd(), 'server/secretcodesPicturesHelper.sh'),
  path.resolve(__dirname, 'secretcodesPicturesHelper.sh'),
  path.resolve(__dirname, '../server/secretcodesPicturesHelper.sh'),
];
const CARD_RATIO_WIDTH = 2;
const CARD_RATIO_HEIGHT = 3;
const CARD_LONG_SIDE = 1536;
const CARD_OUTPUT_WIDTH = 1024;
const CARD_OUTPUT_HEIGHT = 1536;
const CARD_ENCODING_DESCRIPTOR = 'fmt=avif|backend=native|quality=80|speed=6|threads=auto|channels=rgb';
const NORMALIZATION_PIPELINE_VERSION = 'v1';
const VALIDATE_CACHE_HITS_ENV = 'FBG_VALIDATE_CACHE_HITS_P';
const NATIVE_TOOLS_AVAILABLE = areNativeToolsAvailable();
const describeWithNativeTools = NATIVE_TOOLS_AVAILABLE ? describe : describe.skip;

function areNativeToolsAvailable() {
  try {
    execFileSync('bash', [
      '-lc',
      'command -v convert >/dev/null && command -v avifenc >/dev/null && command -v identify >/dev/null',
    ]);
    return true;
  } catch (_error) {
    return false;
  }
}

function getHelperPath() {
  for (const candidate of CARD_HELPER_CANDIDATES) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error('Missing Secret Codes helper script for tests');
}

function hashHex(value: Buffer | string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function getImageIdForSource(sourcePath: string) {
  const sourceHash = hashHex(fs.readFileSync(sourcePath));
  const transformDescriptor = [
    `source=${sourceHash}`,
    `ratio=${CARD_RATIO_WIDTH}:${CARD_RATIO_HEIGHT}`,
    `long_side=${CARD_LONG_SIDE}`,
    `output=${CARD_OUTPUT_WIDTH}x${CARD_OUTPUT_HEIGHT}`,
    CARD_ENCODING_DESCRIPTOR,
    `pipeline=${NORMALIZATION_PIPELINE_VERSION}`,
  ].join('|');
  return hashHex(transformDescriptor);
}

async function warmCacheWithSingleEncodedSample(sourcePaths: string[], cacheDir: string) {
  const sampleCachePath = path.join(cacheDir, '__sample__.avif');
  await execFileAsync('bash', [
    getHelperPath(),
    'normalize',
    sourcePaths[0],
    sampleCachePath,
    `${CARD_OUTPUT_WIDTH}`,
    `${CARD_OUTPUT_HEIGHT}`,
    `${CARD_RATIO_WIDTH}`,
    `${CARD_RATIO_HEIGHT}`,
    '80',
    '6',
  ]);

  const sampleBytes = fs.readFileSync(sampleCachePath);
  fs.rmSync(sampleCachePath, { force: true });
  for (const sourcePath of sourcePaths) {
    fs.writeFileSync(path.join(cacheDir, `${getImageIdForSource(sourcePath)}.avif`), sampleBytes);
  }
}

async function withValidateCacheHits(value: string | undefined, fn: () => Promise<void>) {
  const previous = process.env[VALIDATE_CACHE_HITS_ENV];
  if (value === undefined) {
    delete process.env[VALIDATE_CACHE_HITS_ENV];
  } else {
    process.env[VALIDATE_CACHE_HITS_ENV] = value;
  }

  try {
    await fn();
  } finally {
    if (previous === undefined) {
      delete process.env[VALIDATE_CACHE_HITS_ENV];
    } else {
      process.env[VALIDATE_CACHE_HITS_ENV] = previous;
    }
  }
}

async function writeImage(filePath: string, color: number) {
  const image = await new Promise<Jimp>((resolve, reject) => {
    new Jimp(8, 12, color, (error, value) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(value);
    });
  });

  if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) {
    image.quality(90);
  }

  await image.writeAsync(filePath);
}

async function makeImages(rootDir: string, count: number, extension: '.png' | '.jpg' = '.png') {
  for (let index = 0; index < count; index += 1) {
    const red = (index * 47) % 256;
    const green = (index * 71) % 256;
    const blue = (index * 97) % 256;
    const color = Jimp.rgbaToInt(red, green, blue, 255);
    await writeImage(path.join(rootDir, `image-${index}${extension}`), color);
  }
}

describe('secretcodesPictures basic helpers', () => {
  afterEach(() => {
    resetSecretcodesPicturesCatalogCache();
  });

  it('should expand home-directory shorthand', () => {
    expect(expandHomeDir('~/Pictures')).toEqual(path.join(os.homedir(), 'Pictures'));
  });

  it('should expand the pictures cache directory shorthand', () => {
    expect(resolveSecretcodesPicturesCacheDir('~/.cache/talespin/cards')).toEqual(
      path.join(os.homedir(), '.cache/talespin/cards'),
    );
  });
});

describeWithNativeTools('secretcodesPictures native cache pipeline', () => {
  jest.setTimeout(120000);

  afterEach(() => {
    resetSecretcodesPicturesCatalogCache();
    delete process.env[VALIDATE_CACHE_HITS_ENV];
  });

  it('should recursively follow symlinks without duplicating or looping forever', async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'secretcodes-pictures-'));
    const tmpCacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'secretcodes-cache-'));
    const nestedDir = path.join(tmpRoot, 'nested');
    const viaLinkDir = path.join(tmpRoot, 'via-link');
    const cycleLink = path.join(nestedDir, 'cycle');
    fs.mkdirSync(nestedDir);
    await writeImage(path.join(tmpRoot, 'one.jpg'), Jimp.rgbaToInt(255, 0, 0, 255));
    await writeImage(path.join(nestedDir, 'two.png'), Jimp.rgbaToInt(0, 255, 0, 255));
    fs.writeFileSync(path.join(nestedDir, 'ignore.txt'), 'nope');
    fs.symlinkSync(nestedDir, viaLinkDir);
    fs.symlinkSync(tmpRoot, cycleLink);

    try {
      const catalog = await buildSecretcodesPicturesCatalog(tmpRoot, tmpCacheRoot);

      expect(catalog.enabled).toEqual(true);
      expect(catalog.count).toEqual(2);
      expect(catalog.imageIds).toHaveLength(2);
      expect(catalog.available).toEqual(false);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
      fs.rmSync(tmpCacheRoot, { recursive: true, force: true });
    }
  });

  it('should include extensionless PNG sources by sniffing their bytes', async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'secretcodes-pictures-'));
    const tmpCacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'secretcodes-cache-'));
    const originalPath = path.join(tmpRoot, 'one.png');
    const extensionlessPath = path.join(tmpRoot, 'one');
    await writeImage(originalPath, Jimp.rgbaToInt(12, 34, 56, 255));
    fs.copyFileSync(originalPath, extensionlessPath);
    fs.rmSync(originalPath);
    fs.writeFileSync(path.join(tmpRoot, 'ignore-me'), 'not an image');

    try {
      const catalog = await buildSecretcodesPicturesCatalog(tmpRoot, tmpCacheRoot);

      expect(catalog.enabled).toEqual(true);
      expect(catalog.count).toEqual(1);
      expect(catalog.imageIds).toHaveLength(1);
      expect(fs.readdirSync(tmpCacheRoot).filter((value) => value.endsWith('.avif'))).toHaveLength(1);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
      fs.rmSync(tmpCacheRoot, { recursive: true, force: true });
    }
  });

  it('should hash identical source bytes independent of source path', async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'secretcodes-pictures-'));
    const tmpCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'secretcodes-cache-'));
    const duplicateDir = path.join(tmpRoot, 'duplicate');
    fs.mkdirSync(duplicateDir);
    await writeImage(path.join(tmpRoot, 'shared.png'), Jimp.rgbaToInt(10, 20, 30, 255));
    fs.copyFileSync(path.join(tmpRoot, 'shared.png'), path.join(duplicateDir, 'shared-copy.png'));

    try {
      const catalog = await buildSecretcodesPicturesCatalog(tmpRoot, tmpCacheDir);

      expect(catalog.count).toEqual(1);
      expect(catalog.imageIds).toHaveLength(1);
      expect(fs.readdirSync(tmpCacheDir).filter((value) => value.endsWith('.avif'))).toHaveLength(1);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
      fs.rmSync(tmpCacheDir, { recursive: true, force: true });
    }
  });

  it('should reuse valid cached files instead of rebuilding them', async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'secretcodes-pictures-'));
    const tmpCacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'secretcodes-cache-'));
    await writeImage(path.join(tmpRoot, 'one.png'), Jimp.rgbaToInt(40, 50, 60, 255));

    try {
      const firstCatalog = await buildSecretcodesPicturesCatalog(tmpRoot, tmpCacheRoot);
      const imageId = firstCatalog.imageIds[0];
      const cachePath = firstCatalog.entriesById.get(imageId)!.cachePath;
      const firstMtimeMs = fs.statSync(cachePath).mtimeMs;

      await new Promise((resolve) => setTimeout(resolve, 20));
      const secondCatalog = await buildSecretcodesPicturesCatalog(tmpRoot, tmpCacheRoot);
      const secondCachePath = secondCatalog.entriesById.get(imageId)!.cachePath;
      const secondMtimeMs = fs.statSync(secondCachePath).mtimeMs;

      expect(secondCatalog.imageIds).toEqual(firstCatalog.imageIds);
      expect(secondCachePath).toEqual(cachePath);
      expect(secondMtimeMs).toEqual(firstMtimeMs);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
      fs.rmSync(tmpCacheRoot, { recursive: true, force: true });
    }
  });

  it('should skip corrupted cache files by default when validation is disabled', async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'secretcodes-pictures-'));
    const tmpCacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'secretcodes-cache-'));
    await writeImage(path.join(tmpRoot, 'one.png'), Jimp.rgbaToInt(70, 80, 90, 255));

    try {
      const firstCatalog = await buildSecretcodesPicturesCatalog(tmpRoot, tmpCacheRoot);
      const imageId = firstCatalog.imageIds[0];
      const cachePath = firstCatalog.entriesById.get(imageId)!.cachePath;
      fs.writeFileSync(cachePath, 'broken-cache');

      const secondCatalog = await buildSecretcodesPicturesCatalog(tmpRoot, tmpCacheRoot);
      const rebuiltCachePath = secondCatalog.entriesById.get(imageId)!.cachePath;
      const rebuiltBytes = fs.readFileSync(rebuiltCachePath);

      expect(secondCatalog.imageIds).toEqual(firstCatalog.imageIds);
      expect(rebuiltCachePath).toEqual(cachePath);
      expect(rebuiltBytes.equals(Buffer.from('broken-cache'))).toEqual(true);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
      fs.rmSync(tmpCacheRoot, { recursive: true, force: true });
    }
  });

  it('should rebuild corrupted cache files when validation is enabled', async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'secretcodes-pictures-'));
    const tmpCacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'secretcodes-cache-'));
    await writeImage(path.join(tmpRoot, 'one.png'), Jimp.rgbaToInt(90, 100, 110, 255));

    try {
      await withValidateCacheHits('y', async () => {
        const firstCatalog = await buildSecretcodesPicturesCatalog(tmpRoot, tmpCacheRoot);
        const imageId = firstCatalog.imageIds[0];
        const cachePath = firstCatalog.entriesById.get(imageId)!.cachePath;
        fs.writeFileSync(cachePath, 'broken-cache');

        const secondCatalog = await buildSecretcodesPicturesCatalog(tmpRoot, tmpCacheRoot);
        const rebuiltCachePath = secondCatalog.entriesById.get(imageId)!.cachePath;
        const rebuiltBytes = fs.readFileSync(rebuiltCachePath);

        expect(secondCatalog.imageIds).toEqual(firstCatalog.imageIds);
        expect(rebuiltCachePath).toEqual(cachePath);
        expect(rebuiltBytes.equals(Buffer.from('broken-cache'))).toEqual(false);
        expect(rebuiltBytes.length).toBeGreaterThan('broken-cache'.length);
      });
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
      fs.rmSync(tmpCacheRoot, { recursive: true, force: true });
    }
  });

  it('should report pictures mode available only when 25 unique normalized images exist', async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'secretcodes-pictures-'));
    const tmpCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'secretcodes-cache-'));
    await makeImages(tmpRoot, 25);
    const sourcePaths = Array.from({ length: 25 }, (_, index) => path.join(tmpRoot, `image-${index}.png`));
    await warmCacheWithSingleEncodedSample(sourcePaths, tmpCacheDir);

    try {
      const catalog = await buildSecretcodesPicturesCatalog(tmpRoot, tmpCacheDir);

      expect(catalog.available).toEqual(true);
      expect(catalog.count).toEqual(25);
      expect(catalog.imageIds).toHaveLength(25);
      expect(fs.readdirSync(tmpCacheDir).filter((value) => value.endsWith('.avif'))).toHaveLength(25);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
      fs.rmSync(tmpCacheDir, { recursive: true, force: true });
    }
  });

  it('should emit startup progress events while catalog images are processed', async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'secretcodes-pictures-'));
    const tmpCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'secretcodes-cache-'));
    await makeImages(tmpRoot, 2);
    const sourcePaths = Array.from({ length: 2 }, (_, index) => path.join(tmpRoot, `image-${index}.png`));
    await warmCacheWithSingleEncodedSample(sourcePaths, tmpCacheDir);
    const progressEvents: ISecretcodesPicturesProgressEvent[] = [];

    try {
      const catalog = await buildSecretcodesPicturesCatalog(tmpRoot, tmpCacheDir, {
        onProgress: (event) => progressEvents.push(event),
      });

      expect(catalog.count).toEqual(2);
      expect(progressEvents[0]).toMatchObject({
        type: 'start',
        rootDir: tmpRoot,
        cacheDir: tmpCacheDir,
      });
      expect(progressEvents[1]).toMatchObject({
        type: 'discovered',
        rootDir: tmpRoot,
        cacheDir: tmpCacheDir,
        sourceCount: 2,
      });
      expect(progressEvents[2]).toMatchObject({
        type: 'image',
        current: 1,
        total: 2,
        sourcePath: sourcePaths[0],
        action: 'cache-hit',
      });
      expect(progressEvents[3]).toMatchObject({
        type: 'image',
        current: 2,
        total: 2,
        sourcePath: sourcePaths[1],
        action: 'cache-hit',
      });
      expect(progressEvents[4]).toMatchObject({
        type: 'summary',
        enabled: true,
        available: false,
        uniqueCount: 2,
        sourceCount: 2,
        cacheHitCount: 2,
        builtCount: 0,
        rebuiltCount: 0,
        duplicateCount: 0,
        skippedCount: 0,
      });
      expect(progressEvents[4].elapsedMs).toBeNumber();
      expect(progressEvents[4].elapsedMs).toBeGreaterThanOrEqual(0);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
      fs.rmSync(tmpCacheDir, { recursive: true, force: true });
    }
  });

  it('should reset the shared startup warmup promise after a failure so later calls can retry', async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'secretcodes-pictures-'));
    const tmpCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'secretcodes-cache-'));
    const previousRoot = process.env.CODENAMES_PICTURES_DIR;
    const previousCache = process.env.FBG_IMAGES_CACHE_DIR;
    await makeImages(tmpRoot, 1);

    process.env.CODENAMES_PICTURES_DIR = tmpRoot;
    process.env.FBG_IMAGES_CACHE_DIR = tmpCacheDir;

    const originalExistsSync = fs.existsSync.bind(fs);
    const existsSyncSpy = jest.spyOn(fs, 'existsSync').mockImplementation((targetPath: fs.PathLike) => {
      if (typeof targetPath === 'string' && CARD_HELPER_CANDIDATES.includes(path.resolve(targetPath))) {
        return false;
      }
      return originalExistsSync(targetPath);
    });

    try {
      await expect(warmSecretcodesPicturesCatalog()).rejects.toThrow('Secret Codes picture helper script is missing.');

      existsSyncSpy.mockRestore();

      const catalog = await warmSecretcodesPicturesCatalog();
      expect(catalog.enabled).toEqual(true);
      expect(catalog.count).toEqual(1);
      expect(catalog.imageIds).toHaveLength(1);
    } finally {
      if (existsSyncSpy.mockRestore) {
        existsSyncSpy.mockRestore();
      }
      resetSecretcodesPicturesCatalogCache();
      if (previousRoot === undefined) {
        delete process.env.CODENAMES_PICTURES_DIR;
      } else {
        process.env.CODENAMES_PICTURES_DIR = previousRoot;
      }
      if (previousCache === undefined) {
        delete process.env.FBG_IMAGES_CACHE_DIR;
      } else {
        process.env.FBG_IMAGES_CACHE_DIR = previousCache;
      }
      fs.rmSync(tmpRoot, { recursive: true, force: true });
      fs.rmSync(tmpCacheDir, { recursive: true, force: true });
    }
  });
});
