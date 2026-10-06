import type {
    Condition,
    MusicCatalogue,
    MusicClass,
    MusicTrack,
    Session,
} from "../../shared/types.js";
import { config } from "./config.js";

function offset(key: string, length: number) {
    let value = 2166136261;
    for (const character of key)
        value = Math.imul(value ^ character.charCodeAt(0), 16777619);
    return (value >>> 0) % length;
}

function stateFor(condition: Condition): MusicClass | null {
    return condition === "No music" ? null : "baseline";
}

function choices(
    catalogue: MusicCatalogue,
    state: MusicClass,
    seed: string,
    entry: number,
) {
    const bank = catalogue[state];
    if (!bank.length) return [];
    const start = (offset(seed, bank.length) + entry) % bank.length;
    return bank.map((_, index) => bank[(start + index) % bank.length]);
}

function choose(candidates: MusicTrack[], previous: MusicTrack | null) {
    if (!previous || !config.playback.avoidImmediateComposerRepeat)
        return candidates[0] ?? null;
    return (
        candidates.find(
            (track) =>
                track.composer !== previous.composer &&
                track.compositionId !== previous.compositionId,
        ) ??
        candidates[0] ??
        null
    );
}

function trackFor(catalogue: MusicCatalogue, id: string | null) {
    return id
        ? (Object.values(catalogue)
              .flat()
              .find((track) => track.id === id) ?? null)
        : null;
}

export function selectInitialTrack(
    sessionId: string,
    blockNumber: number,
    condition: Condition,
    catalogue: MusicCatalogue,
) {
    const state = stateFor(condition);
    return state
        ? choose(
              choices(
                  catalogue,
                  state,
                  `${sessionId}:${blockNumber}:${state}`,
                  0,
              ),
              null,
          )
        : null;
}

/** Selects a deterministic next bank entry only when the adaptive state changes. */
export function selectTransitionTrack(
    session: Session,
    blockNumber: number,
    state: MusicClass,
    currentTrackId: string | null,
    catalogue: MusicCatalogue,
) {
    const current = trackFor(catalogue, currentTrackId);
    const priorSelections = session.musicDecisions.filter(
        (decision) =>
            decision.blockNumber === blockNumber &&
            decision.selectedState === state &&
            decision.previousState !== state,
    ).length;
    // The block's baseline initial selection is the first entry in its baseline rotation.
    const entry = priorSelections + (state === "baseline" ? 1 : 0);
    return choose(
        choices(
            catalogue,
            state,
            `${session.id}:${blockNumber}:${state}`,
            entry,
        ),
        current,
    );
}

/** Selects the following approved track when playback reaches a track's end. */
export function selectNextTrackInState(
    catalogue: MusicCatalogue,
    state: MusicClass,
    currentTrackId: string,
) {
    const bank = catalogue[state];
    const current = trackFor(catalogue, currentTrackId);
    const currentIndex = bank.findIndex((track) => track.id === currentTrackId);
    if (!bank.length || currentIndex < 0) return null;
    const candidates = bank.map(
        (_, index) => bank[(currentIndex + index + 1) % bank.length],
    );
    return choose(candidates, current);
}
