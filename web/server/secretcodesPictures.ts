import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const MIN_PICTURES = 25;
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const IMAGE_SNIFF_BYTE_COUNT = 12;
const DEFAULT_CODENAMES_PICTURES_DIR = '~/Pictures/SurrealPictures/chosen_1';
const DEFAULT_FBG_IMAGES_CACHE_DIR = '~/.cache/talespin/cards';
const VALIDATE_CACHE_HITS_ENV = 'FBG_VALIDATE_CACHE_HITS_P';

const CACHE_IMAGE_EXTENSION = 'avif';
const CACHE_IMAGE_CONTENT_TYPE = 'image/avif';
const NORMALIZATION_PIPELINE_VERSION = 'v1';
const CARD_RATIO_WIDTH = 2;
const CARD_RATIO_HEIGHT = 3;
const CARD_LONG_SIDE = 1536;
const CARD_OUTPUT_WIDTH = 1024;
const CARD_OUTPUT_HEIGHT = 1536;
const CARD_AVIF_BACKEND = 'native';
const CARD_AVIF_QUALITY = 80;
const CARD_AVIF_SPEED = 6;
const CARD_AVIF_THREADS = 'auto';

const HELPER_SCRIPT_CANDIDATES = [
  path.resolve(process.cwd(), 'server/secretcodesPicturesHelper.sh'),
  path.resolve(__dirname, 'secretcodesPicturesHelper.sh'),
  path.resolve(__dirname, '../secretcodesPicturesHelper.sh'),
];

export interface ISecretcodesPictureCatalogEntry {
  id: string;
  cachePath: string;
  contentType: string;
}

export interface ISecretcodesPicturesCatalog {
  enabled: boolean;
  available: boolean;
  count: number;
  imageIds: string[];
  entriesById: Map<string, ISecretcodesPictureCatalogEntry>;
}

let catalogPromise: Promise<ISecretcodesPicturesCatalog> | null = null;

export function getSecretcodesPicturesCatalog(): Promise<ISecretcodesPicturesCatalog> {
  if (!catalogPromise) {
    catalogPromise = buildSecretcodesPicturesCatalog(
      process.env.CODENAMES_PICTURES_DIR || DEFAULT_CODENAMES_PICTURES_DIR,
      process.env.FBG_IMAGES_CACHE_DIR || DEFAULT_FBG_IMAGES_CACHE_DIR,
    );
  }

  return catalogPromise;
}

export function resetSecretcodesPicturesCatalogCache() {
  catalogPromise = null;
}

export function expandHomeDir(rawPath?: string): string | undefined {
  if (!rawPath) {
    return rawPath;
  }

  if (rawPath === '~') {
    return os.homedir();
  }

  if (rawPath.startsWith('~/')) {
    return path.join(os.homedir(), rawPath.slice(2));
  }

  return rawPath;
}

export function resolveSecretcodesPicturesCacheDir(rawCacheDir?: string): string | undefined {
  const expanded = expandHomeDir(rawCacheDir);
  if (!expanded) {
    return expanded;
  }

  return path.resolve(expanded);
}

export async function buildSecretcodesPicturesCatalog(
  rawRootDir?: string,
  rawCacheDir?: string,
): Promise<ISecretcodesPicturesCatalog> {
  const rootDir = expandHomeDir(rawRootDir);
  if (!rootDir) {
    return emptyCatalog(false);
  }

  const resolvedRoot = await safeRealpath(rootDir);
  if (!resolvedRoot) {
    return emptyCatalog(true);
  }

  const cacheDir = resolveSecretcodesPicturesCacheDir(rawCacheDir || DEFAULT_FBG_IMAGES_CACHE_DIR);
  if (!cacheDir) {
    return emptyCatalog(true);
  }
  await fs.promises.mkdir(cacheDir, { recursive: true });

  const sourcePaths = new Set<string>();
  const visitedDirectories = new Set<string>();
  await walkPath(resolvedRoot, visitedDirectories, sourcePaths);
  if (sourcePaths.size > 0) {
    await ensureNativePictureToolchain();
  }

  const entriesById = new Map<string, ISecretcodesPictureCatalogEntry>();
  const sortedSourcePaths = Array.from(sourcePaths).sort((a, b) => a.localeCompare(b));

  for (const sourcePath of sortedSourcePaths) {
    try {
      const entry = await normalizeSourceToCache(sourcePath, cacheDir);
      if (!entriesById.has(entry.id)) {
        entriesById.set(entry.id, entry);
      }
    } catch (error) {
      process.stderr.write(`Skipping Secret Codes picture ${sourcePath}: ${formatError(error)}\n`);
      continue;
    }
  }

  const imageIds = Array.from(entriesById.keys()).sort((a, b) => a.localeCompare(b));
  return {
    enabled: true,
    available: imageIds.length >= MIN_PICTURES,
    count: imageIds.length,
    imageIds,
    entriesById,
  };
}

async function walkPath(rawEntryPath: string, visitedDirectories: Set<string>, sourcePaths: Set<string>) {
  const resolvedEntryPath = await safeRealpath(rawEntryPath);
  if (!resolvedEntryPath) {
    return;
  }

  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(resolvedEntryPath);
  } catch (_error) {
    return;
  }

  if (stat.isDirectory()) {
    if (visitedDirectories.has(resolvedEntryPath)) {
      return;
    }
    visitedDirectories.add(resolvedEntryPath);

    let dirEntries: string[];
    try {
      dirEntries = await fs.promises.readdir(resolvedEntryPath);
    } catch (_error) {
      return;
    }

    for (const dirEntry of dirEntries) {
      await walkPath(path.join(resolvedEntryPath, dirEntry), visitedDirectories, sourcePaths);
    }

    return;
  }

  if (stat.isFile() && (await isSupportedImagePath(resolvedEntryPath))) {
    sourcePaths.add(resolvedEntryPath);
  }
}

async function safeRealpath(rawPath: string): Promise<string | null> {
  try {
    return await fs.promises.realpath(rawPath);
  } catch (_error) {
    return null;
  }
}

async function isSupportedImagePath(filePath: string): Promise<boolean> {
  const extension = path.extname(filePath).toLowerCase();
  if (IMAGE_EXTENSIONS.has(extension)) {
    return true;
  }

  if (extension) {
    return false;
  }

  try {
    const handle = await fs.promises.open(filePath, 'r');
    try {
      const sniffBuffer = Buffer.alloc(IMAGE_SNIFF_BYTE_COUNT);
      const { bytesRead } = await handle.read(sniffBuffer, 0, sniffBuffer.length, 0);
      return sniffSupportedImageBytes(sniffBuffer.subarray(0, bytesRead));
    } finally {
      await handle.close();
    }
  } catch (_error) {
    return false;
  }
}

function sniffSupportedImageBytes(bytes: Buffer): boolean {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return true;
  }

  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return true;
  }

  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return true;
  }

  return false;
}

function hashHex(value: Buffer | string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function getHelperScriptPath(): string {
  for (const candidate of HELPER_SCRIPT_CANDIDATES) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error('Secret Codes picture helper script is missing.');
}

function shouldValidateCacheHits(): boolean {
  const raw = (process.env[VALIDATE_CACHE_HITS_ENV] || '').trim().toLowerCase();
  return raw === 'y' || raw === 'yes' || raw === 'true' || raw === '1';
}

function getEncodingDescriptor(): string {
  return [
    'fmt=avif',
    `backend=${CARD_AVIF_BACKEND}`,
    `quality=${CARD_AVIF_QUALITY}`,
    `speed=${CARD_AVIF_SPEED}`,
    `threads=${CARD_AVIF_THREADS}`,
    'channels=rgb',
  ].join('|');
}

function getTransformDescriptor(sourceHash: string): string {
  return [
    `source=${sourceHash}`,
    `ratio=${CARD_RATIO_WIDTH}:${CARD_RATIO_HEIGHT}`,
    `long_side=${CARD_LONG_SIDE}`,
    `output=${CARD_OUTPUT_WIDTH}x${CARD_OUTPUT_HEIGHT}`,
    getEncodingDescriptor(),
    `pipeline=${NORMALIZATION_PIPELINE_VERSION}`,
  ].join('|');
}

async function normalizeSourceToCache(sourcePath: string, cacheDir: string): Promise<ISecretcodesPictureCatalogEntry> {
  const sourceBytes = await fs.promises.readFile(sourcePath);
  const sourceHash = hashHex(sourceBytes);
  const imageId = hashHex(getTransformDescriptor(sourceHash));
  const cachePath = path.join(cacheDir, `${imageId}.${CACHE_IMAGE_EXTENSION}`);

  let shouldRebuildCache = !(await fileExists(cachePath));
  if (!shouldRebuildCache && shouldValidateCacheHits()) {
    try {
      await validateCachedImage(cachePath);
    } catch (_error) {
      await fs.promises.rm(cachePath, { force: true });
      shouldRebuildCache = true;
    }
  }

  if (shouldRebuildCache) {
    await buildCachedImage(sourcePath, cachePath);
  }

  return {
    id: imageId,
    cachePath,
    contentType: CACHE_IMAGE_CONTENT_TYPE,
  };
}

async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await fs.promises.access(targetPath, fs.constants.F_OK);
    return true;
  } catch (_error) {
    return false;
  }
}

async function validateCachedImage(cachePath: string) {
  await runHelperCommand('validate', cachePath, `${CARD_OUTPUT_WIDTH}`, `${CARD_OUTPUT_HEIGHT}`);
}

async function buildCachedImage(sourcePath: string, cachePath: string) {
  await runHelperCommand(
    'normalize',
    sourcePath,
    cachePath,
    `${CARD_OUTPUT_WIDTH}`,
    `${CARD_OUTPUT_HEIGHT}`,
    `${CARD_RATIO_WIDTH}`,
    `${CARD_RATIO_HEIGHT}`,
    `${CARD_AVIF_QUALITY}`,
    `${CARD_AVIF_SPEED}`,
  );
}

async function ensureNativePictureToolchain() {
  await runHelperCommand('check', shouldValidateCacheHits() ? 'validate' : 'novalidate');
}

async function runHelperCommand(...args: string[]) {
  await execFileAsync('bash', [getHelperScriptPath(), ...args], {
    cwd: process.cwd(),
  });
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return `${error}`;
}

function emptyCatalog(enabled: boolean): ISecretcodesPicturesCatalog {
  return {
    enabled,
    available: false,
    count: 0,
    imageIds: [],
    entriesById: new Map(),
  };
}
