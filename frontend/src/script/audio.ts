import type { MusicTrack } from "../../../shared/types";

export type PlaybackResult =
    | { status: "playing"; trackId: string }
    | { status: "silent"; reason: string }
    | { status: "failed"; trackId: string; reason: string };

// CROSSFADE Config
export const CROSSFADE_MS = 5_000;

function urlFor(track: MusicTrack) {
    return `/${track.relativeFilePath.split("/").map(encodeURIComponent).join("/")}`;
}

/**
 * Owns the browser's single audio element. This class does no study
 * computation; it only attempts playback and reports the outcome to its caller.
 */
export class AudioController {
    private audio: HTMLAudioElement | null = null;
    private trackId: string | null = null;
    private fadeFrame: number | null = null;
    private fadingOut: HTMLAudioElement | null = null;

    async play(track: MusicTrack | null): Promise<PlaybackResult> {
        if (!track) {
            this.stop();
            return {
                status: "silent",
                reason: "No suitable music track is available.",
            };
        }
        if (this.audio && this.trackId === track.id && !this.audio.paused) {
            return { status: "playing", trackId: track.id };
        }

        const previous = this.audio;
        this.stopFadingOut();
        const audio = new Audio(urlFor(track));
        audio.loop = true;
        audio.preload = "auto";
        audio.volume = previous && !previous.paused ? 0 : 1;

        try {
            await audio.play();
            this.audio = audio;
            this.trackId = track.id;
            if (previous && !previous.paused) this.crossfade(previous, audio);
            return { status: "playing", trackId: track.id };
        } catch (error) {
            audio.pause();
            audio.removeAttribute("src");
            audio.load();
            return {
                status: "failed",
                trackId: track.id,
                reason:
                    error instanceof Error
                        ? error.message
                        : "The browser could not start audio.",
            };
        }
    }

    stop() {
        this.cancelFade();
        if (this.audio) {
            this.audio.pause();
            this.audio.removeAttribute("src");
            this.audio.load();
        }
        this.stopFadingOut();
        this.audio = null;
        this.trackId = null;
    }

    private crossfade(previous: HTMLAudioElement, next: HTMLAudioElement) {
        const startedAt = performance.now();
        const update = (now: number) => {
            const progress = Math.min(1, (now - startedAt) / CROSSFADE_MS);
            previous.volume = 1 - progress;
            next.volume = progress;
            if (progress < 1) {
                this.fadeFrame = requestAnimationFrame(update);
                return;
            }
            previous.pause();
            previous.removeAttribute("src");
            previous.load();
            this.fadingOut = null;
            this.fadeFrame = null;
        };
        this.fadingOut = previous;
        this.fadeFrame = requestAnimationFrame(update);
    }

    private cancelFade() {
        if (this.fadeFrame !== null) cancelAnimationFrame(this.fadeFrame);
        this.fadeFrame = null;
    }

    private stopFadingOut() {
        this.cancelFade();
        if (!this.fadingOut) return;
        this.fadingOut.pause();
        this.fadingOut.removeAttribute("src");
        this.fadingOut.load();
        this.fadingOut = null;
    }
}
