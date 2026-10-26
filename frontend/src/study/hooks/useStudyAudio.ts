import { useEffect, useRef, useState, type RefObject } from "react";
import type { Condition, MusicCatalogue, MusicTrack } from "../../../../shared/types";
import { evaluateAdaptiveMusic, getMusicCatalogue, getNextMusicTrack, getPlaybackConfig, recordMusicTransition } from "../../script/api";
import { AudioController } from "../../script/audio";
import type { Stage } from "../types";

export function useStudyAudio({
    sessionId,
    stage,
    condition,
    started,
    blockIndex,
    completing,
}: {
    sessionId: string | null;
    stage: Stage;
    condition: Condition;
    started: number | null;
    blockIndex: number;
    completing: RefObject<boolean>;
}) {
    const [musicCatalogue, setMusicCatalogue] = useState<MusicCatalogue>({
        baseline: [],
        reduced: [],
        elevated: [],
    });
    const [audioMessage, setAudioMessage] = useState("");
    const [audioVolume, setAudioVolume] = useState(0.75);
    const [testAudioPlaying, setTestAudioPlaying] = useState(false);
    const audio = useRef(new AudioController());
    const musicCatalogueRef = useRef(musicCatalogue);
    const playbackBlock = useRef<{
        sessionId: string;
        blockNumber: number;
    } | null>(null);
    // Stop audio if the app is closed or React removes this screen.
    useEffect(() => () => audio.current.stop(), []);

    useEffect(() => {
        audio.current.setVolume(audioVolume);
    }, [audioVolume]);

    useEffect(() => {
        musicCatalogueRef.current = musicCatalogue;
    }, [musicCatalogue]);

    useEffect(() => {
        audio.current.onTrackEnded((currentTrackId) => {
            const activeBlock = playbackBlock.current;
            if (activeBlock)
                void continueAfterTrackEnd(
                    activeBlock.sessionId,
                    activeBlock.blockNumber,
                    currentTrackId,
                );
        });
        return () => audio.current.onTrackEnded(null);
    }, []);

    // The first 60 seconds establish the initial rolling window. After that,
    // the backend evaluates the rule every 30 seconds.
    useEffect(() => {
        if (
            stage !== "task" ||
            condition !== "Adaptive music" ||
            !sessionId ||
            started === null
        )
            return;
        let interval: number | null = null;
        const firstEvaluation = window.setTimeout(
            () => {
                void applyAdaptiveDecision(sessionId, blockIndex + 2);
                interval = window.setInterval(() => {
                    void applyAdaptiveDecision(sessionId, blockIndex + 2);
                }, 30_000);
            },
            Math.max(0, started + 60_000 - performance.now()),
        );
        return () => {
            window.clearTimeout(firstEvaluation);
            if (interval !== null) window.clearInterval(interval);
        };
    }, [stage, condition, sessionId, started, blockIndex, musicCatalogue]);

    async function loadMusicCatalogue() {
        try {
            setMusicCatalogue(await getMusicCatalogue());
        } catch {
            // A catalogue failure must never prevent the participant task from running.
            setMusicCatalogue({ baseline: [], reduced: [], elevated: [] });
            setAudioMessage(
                "Music is unavailable. This session will continue silently.",
            );
        }
    }

    async function loadPlaybackConfig() {
        try {
            audio.current.configure(await getPlaybackConfig());
        } catch {
            // The safe defaults keep playback usable when only the catalogue is available.
        }
    }

    function trackById(trackId: string | null): MusicTrack | null {
        if (!trackId) return null;
        return (
            Object.values(musicCatalogue)
                .flat()
                .find((track) => track.id === trackId) ?? null
        );
    }

    async function playTrack(track: MusicTrack | null) {
        const result = await audio.current.play(track);
        if (result.status === "playing") setAudioMessage("");
        else
            setAudioMessage(
                result.status === "silent"
                    ? result.reason
                    : `Audio could not play. The task will continue silently.`,
            );
        return result;
    }

    async function toggleTestAudio() {
        if (audio.current.isPlaying()) {
            audio.current.pause();
            setTestAudioPlaying(false);
            return;
        }
        if (audio.current.currentTrackId()) {
            const resumed = await audio.current.resume();
            setTestAudioPlaying(resumed);
            if (!resumed)
                setAudioMessage(
                    "Audio could not resume. Try playing it again.",
                );
            return;
        }
        const result = await playTrack(musicCatalogue.baseline[0] ?? null);
        setTestAudioPlaying(result.status === "playing");
    }

    async function startMusic(
        nextCondition: Condition,
        initialTrackId: string | null,
        number: number,
    ) {
        if (nextCondition === "No music") {
            playbackBlock.current = null;
            audio.current.stop();
            setAudioMessage("");
            return;
        }
        if (sessionId)
            playbackBlock.current = { sessionId, blockNumber: number };
        await playTrack(trackById(initialTrackId));
    }

    async function continueAfterTrackEnd(
        activeSessionId: string,
        number: number,
        currentTrackId: string,
    ) {
        try {
            const { trackId } = await getNextMusicTrack(
                activeSessionId,
                number,
                currentTrackId,
            );
            // Ignore a late reply if an adaptive decision already changed track.
            if (audio.current.currentTrackId() !== currentTrackId) return;
            await playTrack(
                trackId
                    ? (Object.values(musicCatalogueRef.current)
                        .flat()
                        .find((track) => track.id === trackId) ?? null)
                    : null,
            );
        } catch {
            setAudioMessage("The next music track could not be loaded.");
        }
    }

    async function applyAdaptiveDecision(
        activeSessionId: string,
        number: number,
    ) {
        try {
            const { decision } = await evaluateAdaptiveMusic(
                activeSessionId,
                number,
                performance.now(),
            );
            if (
                completing.current ||
                playbackBlock.current?.sessionId !== activeSessionId ||
                playbackBlock.current?.blockNumber !== number
            )
                return;
            // The backend retains the active track while the selected state is
            // unchanged. Do not restart audio or create a transition row.
            if (decision.previousTrackId === decision.selectedTrackId) return;
            const startedMs = performance.now();
            const playback = await playTrack(
                trackById(decision.selectedTrackId),
            );
            // A playing result resolves after the crossfade, so the exported
            // completion timestamp describes the end of the transition.
            const completedMs =
                playback.status === "playing"
                    ? await playback.transitionCompleted
                    : performance.now();
            await recordMusicTransition(activeSessionId, number, {
                decisionId: decision.id,
                startedMs,
                completedMs,
                outcome: playback.status,
                error: playback.status === "playing" ? null : playback.reason,
            });
        } catch {
            // A rule-engine request must never interrupt data entry or the timer.
            setAudioMessage(
                "Music update was unavailable. The task will continue safely.",
            );
        }
    }

    return { musicCatalogue, audio, playbackBlock, audioMessage, setAudioMessage, audioVolume, setAudioVolume, testAudioPlaying, setTestAudioPlaying, loadMusicCatalogue, loadPlaybackConfig, toggleTestAudio, startMusic };
}
