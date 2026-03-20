export interface ISecretcodesPicturesManifest {
  enabled: boolean;
  available: boolean;
  count: number;
  imageIds: string[];
}

const PICTURES_MANIFEST_URL = '/secretcodes/pictures/catalog';
const PICTURES_IMAGE_URL_PREFIX = '/secretcodes/pictures/image/';

let manifestPromise: Promise<ISecretcodesPicturesManifest> | null = null;

export function fetchSecretcodesPicturesManifest(): Promise<ISecretcodesPicturesManifest> {
  if (!manifestPromise) {
    manifestPromise = fetch(PICTURES_MANIFEST_URL).then(async (response) => {
      if (!response.ok) {
        throw new Error(`Failed to load pictures manifest: ${response.status}`);
      }
      return (await response.json()) as ISecretcodesPicturesManifest;
    });
  }

  return manifestPromise;
}

export function resetSecretcodesPicturesManifestCache() {
  manifestPromise = null;
}

export function getSecretcodesPictureImageUrl(imageId: string): string {
  return `${PICTURES_IMAGE_URL_PREFIX}${encodeURIComponent(imageId)}`;
}

export function pickSecretcodesPictureImageIds(
  imageIds: string[],
  seed: string | number | undefined,
  count: number = 25,
): string[] {
  const normalizedSeed = `${seed ?? ''}`;
  return imageIds
    .map((imageId) => ({
      imageId,
      rank: hashString(`${normalizedSeed}:${imageId}`),
    }))
    .sort((a, b) => {
      if (a.rank !== b.rank) {
        return a.rank - b.rank;
      }
      return a.imageId.localeCompare(b.imageId);
    })
    .slice(0, count)
    .map((entry) => entry.imageId);
}

function hashString(value: string): number {
  let hash = 2166136261;

  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}
