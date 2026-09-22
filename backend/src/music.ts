import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { MusicCatalogue, MusicClass, MusicTrack } from "../../shared/types.js";
import { root } from "./config.js";

const musicClasses: MusicClass[] = ["baseline", "reduced", "elevated"];
const supportedExtensions = new Set([".mp3", ".wav", ".m4a", ".ogg", ".aac"]);

function isSupportedAudioFile(fileName: string) {
  const extension = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  return supportedExtensions.has(extension);
}

/**
 * Reads the three music folders. Missing or empty folders deliberately produce
 * empty lists, so the experiment can continue silently.
 */
export function loadMusicCatalogue(): MusicCatalogue {
  const catalogue: MusicCatalogue = { baseline: [], reduced: [], elevated: [] };

  for (const musicClass of musicClasses) {
    const directory = join(root, "music", musicClass);
    if (!existsSync(directory)) continue;

    catalogue[musicClass] = readdirSync(directory, { withFileTypes: true })
      .filter(entry => entry.isFile() && isSupportedAudioFile(entry.name))
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((entry): MusicTrack => ({
        id: `${musicClass}/${entry.name}`,
        musicClass,
        relativeFilePath: `music/${musicClass}/${entry.name}`,
      }));
  }

  return catalogue;
}

export function hasAnyMusic(catalogue: MusicCatalogue) {
  return musicClasses.some(musicClass => catalogue[musicClass].length > 0);
}
