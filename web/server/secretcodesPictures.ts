import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

const MIN_PICTURES = 25;
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);
const DEFAULT_CODENAMES_PICTURES_DIR = '~/Pictures/SurrealPictures/chosen_1';

export interface ISecretcodesPictureCatalogEntry {
  id: string;
  absolutePath: string;
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

export async function buildSecretcodesPicturesCatalog(rawRootDir?: string): Promise<ISecretcodesPicturesCatalog> {
  const rootDir = expandHomeDir(rawRootDir);
  if (!rootDir) {
    return emptyCatalog(false);
  }

  const resolvedRoot = await safeRealpath(rootDir);
  if (!resolvedRoot) {
    return emptyCatalog(true);
  }

  const entriesByPath = new Map<string, ISecretcodesPictureCatalogEntry>();
  const visitedDirectories = new Set<string>();

  await walkPath(resolvedRoot, visitedDirectories, entriesByPath);

  const entries = Array.from(entriesByPath.values()).sort((a, b) => a.absolutePath.localeCompare(b.absolutePath));
  const entriesById = new Map(entries.map((entry) => [entry.id, entry]));

  return {
    enabled: true,
    available: entries.length >= MIN_PICTURES,
    count: entries.length,
    imageIds: entries.map((entry) => entry.id),
    entriesById,
  };
}

async function walkPath(
  rawEntryPath: string,
  visitedDirectories: Set<string>,
  entriesByPath: Map<string, ISecretcodesPictureCatalogEntry>,
) {
  const resolvedEntryPath = await safeRealpath(rawEntryPath);
  if (!resolvedEntryPath) {
    return;
  }

  let stat;
  try {
    stat = await fs.promises.stat(resolvedEntryPath);
  } catch (error) {
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
    } catch (error) {
      return;
    }

    for (const dirEntry of dirEntries) {
      await walkPath(path.join(resolvedEntryPath, dirEntry), visitedDirectories, entriesByPath);
    }

    return;
  }

  if (!stat.isFile() || !isSupportedImagePath(resolvedEntryPath)) {
    return;
  }

  if (!entriesByPath.has(resolvedEntryPath)) {
    entriesByPath.set(resolvedEntryPath, {
      id: createOpaqueId(resolvedEntryPath),
      absolutePath: resolvedEntryPath,
    });
  }
}

async function safeRealpath(rawPath: string): Promise<string | null> {
  try {
    return await fs.promises.realpath(rawPath);
  } catch (error) {
    return null;
  }
}

function isSupportedImagePath(filePath: string): boolean {
  return IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function createOpaqueId(absolutePath: string): string {
  return crypto.createHash('sha1').update(absolutePath).digest('hex');
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
