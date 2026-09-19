import {
    getMusicUrl,
    type MusicTrack,
} from "./musicApi";

let audio: HTMLAudioElement | null =
    null;

let activeTrack: MusicTrack | null =
    null;

/**
 * Plays a selected WAV file.
 *
 * For the current prototype, the selected
 * track loops until another track is played
 * or stopTrack() is called.
 */
export async function playTrack(
    track: MusicTrack,
) {
    stopTrack();

    const nextAudio =
        new Audio(getMusicUrl(track));

    nextAudio.preload = "auto";

    /*
     * Temporary prototype behavior:
     * repeat the selected track for the
     * duration of the condition.
     */
    nextAudio.loop = true;

    /*
     * Full volume here means the browser
     * player itself does not attenuate the
     * track. Participants should set their
     * comfortable listening level during
     * the audio-comfort check.
     */
    nextAudio.volume = 1;

    audio = nextAudio;
    activeTrack = track;

    try {
        await nextAudio.play();
    } catch (error) {
        audio = null;
        activeTrack = null;

        throw error;
    }
}

/**
 * Stops all current playback.
 */
export function stopTrack() {
    if (!audio) {
        activeTrack = null;
        return;
    }

    audio.pause();

    try {
        audio.currentTime = 0;
    } catch {
        // Ignore browsers that cannot reset
        // the media element at this point.
    }

    audio.removeAttribute("src");
    audio.load();

    audio = null;
    activeTrack = null;
}

/**
 * Sets playback volume between 0 and 1.
 */
export function setVolume(
    volume: number,
) {
    if (!audio) return;

    audio.volume = Math.max(
        0,
        Math.min(1, volume),
    );
}

export function getCurrentTrack() {
    return activeTrack;
}

export function isAudioPlaying() {
    return (
        audio !== null &&
        !audio.paused &&
        !audio.ended
    );
}