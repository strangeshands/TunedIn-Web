import type { MusicTrack } from "../../../shared/types";

export type PlaybackSettings = {
    crossfadeMs: number;
    masterHeadroomDb: number;
    loopTracks: boolean;
};

export type PlaybackResult =
    | {
          status: "playing";
          trackId: string;
          /** Resolves only after this track's crossfade has ended. */
          transitionCompleted: Promise<number>;
      }
    | { status: "silent"; reason: string }
    | { status: "failed"; trackId: string; reason: string };

type ActiveAudio = {
    element: HTMLAudioElement;
    trackId: string;
    fadeGain: GainNode;
};

const defaultSettings: PlaybackSettings = {
    crossfadeMs: 5_000,
    masterHeadroomDb: -3,
    loopTracks: true,
};

const dbToGain = (decibels: number) => 10 ** (decibels / 20);
const urlFor = (track: MusicTrack) =>
    `/${track.relativeFilePath
        .replaceAll("\\", "/")
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`;

/** Browser playback only: the backend decides state, track, and fixed gain. */
export class AudioController {
    private context: AudioContext | null = null;
    private masterGain: GainNode | null = null;
    private active: ActiveAudio | null = null;
    private retiring: ActiveAudio | null = null;
    private fadeFrame: number | null = null;
    private resolveFade: ((completedMs: number) => void) | null = null;
    private settings = defaultSettings;
    private trackEndedHandler: ((trackId: string) => void) | null = null;

    configure(settings: PlaybackSettings) {
        this.settings = settings;
        if (this.masterGain)
            this.masterGain.gain.setValueAtTime(
                dbToGain(settings.masterHeadroomDb),
                this.context!.currentTime,
            );
    }

    onTrackEnded(handler: ((trackId: string) => void) | null) {
        this.trackEndedHandler = handler;
    }

    currentTrackId() {
        return this.active?.trackId ?? null;
    }

    /** Development helper: jumps to the final seconds so the normal ended event runs. */
    async jumpToFinalSeconds(seconds = 10) {
        const active = this.active;
        if (!active || active.element.paused) return false;
        if (!Number.isFinite(active.element.duration))
            await new Promise<void>((resolve) =>
                active.element.addEventListener("loadedmetadata", () => resolve(), {
                    once: true,
                }),
            );
        if (!Number.isFinite(active.element.duration)) return false;
        active.element.currentTime = Math.max(0, active.element.duration - seconds);
        return true;
    }

    async play(track: MusicTrack | null): Promise<PlaybackResult> {
        if (!track) {
            this.stop();
            return { status: "silent", reason: "No approved music track is available." };
        }
        if (this.active?.trackId === track.id && !this.active.element.paused)
            return {
                status: "playing",
                trackId: track.id,
                transitionCompleted: Promise.resolve(performance.now()),
            };

        const previous =
            this.active && !this.active.element.paused ? this.active : null;
        const { context, masterGain } = this.ensureGraph();
        const element = new Audio(urlFor(track));
        element.loop = this.settings.loopTracks;
        element.preload = "auto";
        const source = context.createMediaElementSource(element);
        const trackGain = context.createGain();
        const fadeGain = context.createGain();
        trackGain.gain.value = dbToGain(track.playbackGainDb);
        fadeGain.gain.value = previous ? 0 : 1;
        source.connect(trackGain).connect(fadeGain).connect(masterGain);
        element.addEventListener("ended", () => {
            if (this.active?.element === element)
                this.trackEndedHandler?.(track.id);
        });

        try {
            await context.resume();
            await element.play();
        } catch (error) {
            element.pause();
            element.removeAttribute("src");
            element.load();
            return {
                status: "failed",
                trackId: track.id,
                reason: error instanceof Error ? error.message : "The browser could not start audio.",
            };
        }

        if (this.active && !previous) this.dispose(this.active);
        this.active = { element, trackId: track.id, fadeGain };
        const transitionCompleted = previous
            ? this.crossfade(previous, this.active)
            : Promise.resolve(performance.now());
        return { status: "playing", trackId: track.id, transitionCompleted };
    }

    stop() {
        if (this.fadeFrame !== null) cancelAnimationFrame(this.fadeFrame);
        this.fadeFrame = null;
        this.finishFade(performance.now());
        if (this.active) this.dispose(this.active);
        if (this.retiring) this.dispose(this.retiring);
        this.active = null;
        this.retiring = null;
    }

    private ensureGraph() {
        if (!this.context) {
            this.context = new AudioContext();
            this.masterGain = this.context.createGain();
            this.masterGain.connect(this.context.destination);
        }
        this.masterGain!.gain.setValueAtTime(
            dbToGain(this.settings.masterHeadroomDb),
            this.context.currentTime,
        );
        return { context: this.context, masterGain: this.masterGain! };
    }

    private crossfade(previous: ActiveAudio, next: ActiveAudio): Promise<number> {
        if (this.fadeFrame !== null) {
            cancelAnimationFrame(this.fadeFrame);
            this.finishFade(performance.now());
        }
        if (this.retiring) this.dispose(this.retiring);
        this.retiring = previous;
        const duration = this.settings.crossfadeMs;
        return new Promise((resolve) => {
            this.resolveFade = resolve;
            if (duration <= 0) {
                next.fadeGain.gain.value = 1;
                this.dispose(previous);
                this.retiring = null;
                this.finishFade(performance.now());
                return;
            }
            const startedAt = performance.now();
            const update = (now: number) => {
                const progress = Math.min(1, (now - startedAt) / duration);
                previous.fadeGain.gain.setValueAtTime(
                    Math.cos((progress * Math.PI) / 2),
                    this.context!.currentTime,
                );
                next.fadeGain.gain.setValueAtTime(
                    Math.sin((progress * Math.PI) / 2),
                    this.context!.currentTime,
                );
                if (progress < 1) {
                    this.fadeFrame = requestAnimationFrame(update);
                    return;
                }
                this.dispose(previous);
                this.retiring = null;
                this.fadeFrame = null;
                this.finishFade(now);
            };
            this.fadeFrame = requestAnimationFrame(update);
        });
    }

    private finishFade(completedMs: number) {
        const resolve = this.resolveFade;
        this.resolveFade = null;
        resolve?.(completedMs);
    }

    private dispose(audio: ActiveAudio) {
        audio.element.pause();
        audio.element.removeAttribute("src");
        audio.element.load();
    }
}
