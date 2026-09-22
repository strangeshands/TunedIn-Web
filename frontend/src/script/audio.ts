import type { MusicTrack } from "../../../shared/types";

export type PlaybackResult =
  | { status: "playing"; trackId: string }
  | { status: "silent"; reason: string }
  | { status: "failed"; trackId: string; reason: string };

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

  async play(track: MusicTrack | null): Promise<PlaybackResult> {
    if (!track) {
      this.stop();
      return { status: "silent", reason: "No suitable music track is available." };
    }
    if (this.audio && this.trackId === track.id && !this.audio.paused) {
      return { status: "playing", trackId: track.id };
    }

    this.stop();
    const audio = new Audio(urlFor(track));
    audio.loop = true;
    audio.preload = "auto";
    this.audio = audio;
    this.trackId = track.id;

    try {
      await audio.play();
      return { status: "playing", trackId: track.id };
    } catch (error) {
      this.stop();
      return { status: "failed", trackId: track.id, reason: error instanceof Error ? error.message : "The browser could not start audio." };
    }
  }

  stop() {
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute("src");
      this.audio.load();
    }
    this.audio = null;
    this.trackId = null;
  }
}
