import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, normalize, relative } from "node:path";
import type {
    MusicCatalogue,
    MusicClass,
    MusicTrack,
} from "../../shared/types.js";
import { config, root } from "./config.js";

type ManifestTrack = Omit<MusicTrack, "playbackGainDb">;
type PlaybackManifest = { version: string; tracks: ManifestTrack[] };

const musicClasses: MusicClass[] = ["baseline", "reduced", "elevated"];
const manifestPath = join(root, "config", "playback-bank.json");
const hashes = new Map<
    string,
    { mtimeMs: number; size: number; sha256: string }
>();

function readManifest(): PlaybackManifest {
    return JSON.parse(readFileSync(manifestPath, "utf8")) as PlaybackManifest;
}

function playbackGainDb(track: ManifestTrack) {
    const loudnessGain =
        config.playback.loudnessTargetLufs - track.integratedLoudnessLufs;
    const peakLimitedGain =
        config.playback.maximumTrackTruePeakDbtp - track.truePeakDbtp;
    return Math.round(Math.min(loudnessGain, peakLimitedGain) * 1000) / 1000;
}

function fileSha256(filePath: string) {
    const stat = statSync(filePath);
    const known = hashes.get(filePath);
    if (known && known.mtimeMs === stat.mtimeMs && known.size === stat.size)
        return known.sha256;

    const sha256 = createHash("sha256")
        .update(readFileSync(filePath))
        .digest("hex");
    hashes.set(filePath, { mtimeMs: stat.mtimeMs, size: stat.size, sha256 });
    return sha256;
}

function safeTrackPath(track: ManifestTrack) {
    // Manifests use portable `/` separators; accept `\` too when running on Windows.
    const portablePath = track.relativeFilePath.replaceAll("\\", "/");
    if (!portablePath.startsWith(`music/${track.musicClass}/`))
        return null;
    const resolved = normalize(join(root, portablePath));
    const musicRoot = normalize(join(root, "music"));
    const pathFromMusicRoot = relative(musicRoot, resolved);
    return pathFromMusicRoot &&
        !pathFromMusicRoot.startsWith("..") &&
        !isAbsolute(pathFromMusicRoot)
        ? resolved
        : null;
}

/**
 * Reads only manifest-approved audio files. A missing manifest, missing file, or
 * changed source file produces an empty entry, allowing the experiment to run silently.
 */
export function loadMusicCatalogue(): MusicCatalogue {
    const catalogue: MusicCatalogue = {
        baseline: [],
        reduced: [],
        elevated: [],
    };
    if (!existsSync(manifestPath)) return catalogue;

    let manifest: PlaybackManifest;
    try {
        manifest = readManifest();
    } catch {
        return catalogue;
    }
    if (manifest.version !== config.playback.manifestVersion) return catalogue;

    for (const track of manifest.tracks) {
        if (!musicClasses.includes(track.musicClass)) continue;
        const filePath = safeTrackPath(track);
        if (!filePath || !existsSync(filePath)) continue;
        try {
            if (fileSha256(filePath) !== track.sourceSha256) continue;
        } catch {
            continue;
        }

        catalogue[track.musicClass].push({
            ...track,
            playbackGainDb: config.playback.applyPerTrackGain
                ? playbackGainDb(track)
                : 0,
        });
    }

    for (const musicClass of musicClasses)
        catalogue[musicClass].sort(
            (left, right) => left.rotationIndex - right.rotationIndex,
        );

    return catalogue;
}

export function hasAnyMusic(catalogue: MusicCatalogue) {
    return musicClasses.some((musicClass) => catalogue[musicClass].length > 0);
}
