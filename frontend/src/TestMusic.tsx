import { useEffect, useMemo, useRef, useState } from "react";
import type { MusicCatalogue, MusicTrack } from "../../shared/types";
import { AudioController } from "./script/audio";
import { getMusicCatalogue, getPlaybackConfig } from "./script/api";

// TEMPORARY TEST PAGE: delete this file and the /test-music branch in main.tsx when finished.
// Change these values to test how the rule thresholds behave.
const TEST_CALIBRATION = { medianIlSeconds: 0.77, medianFpedSeconds: 5.51 };

const emptyCatalogue: MusicCatalogue = {
    baseline: [],
    reduced: [],
    elevated: [],
};

export default function TestMusic() {
    const [catalogue, setCatalogue] = useState<MusicCatalogue>(emptyCatalogue);
    const [startingTrackId, setStartingTrackId] = useState("");
    const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
    const [medianIl, setMedianIl] = useState(TEST_CALIBRATION.medianIlSeconds);
    const [medianFped, setMedianFped] = useState(
        TEST_CALIBRATION.medianFpedSeconds,
    );
    const [errorRate, setErrorRate] = useState(5);
    const [message, setMessage] = useState(
        "Load a track, then press Play selected track.",
    );
    const [crossfadeMs, setCrossfadeMs] = useState(5_000);
    const audio = useRef(new AudioController());
    const catalogueRef = useRef<MusicCatalogue>(emptyCatalogue);
    const tracks = useMemo(() => Object.values(catalogue).flat(), [catalogue]);
    const startingTrack =
        tracks.find((track) => track.id === startingTrackId) ?? null;
    const activeTrack =
        tracks.find((track) => track.id === activeTrackId) ?? null;

    useEffect(() => {
        catalogueRef.current = catalogue;
    }, [catalogue]);

    useEffect(() => {
        audio.current.onTrackEnded((trackId) => {
            void playNextTrackInSameState(trackId);
        });
        return () => audio.current.onTrackEnded(null);
    }, []);

    useEffect(() => {
        void Promise.all([getMusicCatalogue(), getPlaybackConfig()])
            .then(([found, playback]) => {
                setCatalogue(found);
                setStartingTrackId(Object.values(found).flat()[0]?.id ?? "");
                audio.current.configure(playback);
                setCrossfadeMs(playback.crossfadeMs);
            })
            .catch(() =>
                setMessage(
                    "No music catalogue is available. Start the backend and add audio files.",
                ),
            );
        return () => audio.current.stop();
    }, []);

    const predictedState =
        medianIl >= TEST_CALIBRATION.medianIlSeconds * 1.2 ||
        medianFped >= TEST_CALIBRATION.medianFpedSeconds * 1.2 ||
        errorRate > 15
            ? "reduced"
            : medianIl <= TEST_CALIBRATION.medianIlSeconds * 0.9 &&
                medianFped <= TEST_CALIBRATION.medianFpedSeconds * 0.9 &&
                errorRate <= 5
              ? "elevated"
              : "baseline";

    async function playStartingTrack() {
        const result = await audio.current.play(startingTrack);
        if (result.status === "playing") setActiveTrackId(result.trackId);
        setMessage(
            result.status === "playing"
                ? `Playing your starting track. Changes fade for ${crossfadeMs / 1000} seconds.`
                : result.status === "silent"
                  ? result.reason
                  : result.reason,
        );
    }

    async function changeState() {
        const targetTracks = catalogue[predictedState];
        const targetTrack =
            targetTracks.find((track) => track.id !== activeTrackId) ??
            targetTracks[0] ??
            null;
        const result = await audio.current.play(targetTrack);
        if (result.status === "playing") setActiveTrackId(result.trackId);
        setMessage(
            result.status === "playing"
                ? `Changed to ${predictedState}. The track transition fades for ${crossfadeMs / 1000} seconds.`
                : result.status === "silent"
                  ? `No ${predictedState} track is available. ${result.reason}`
                  : result.reason,
        );
    }

    async function playNextTrackInSameState(currentTrackId: string) {
        const current = Object.values(catalogueRef.current)
            .flat()
            .find((track) => track.id === currentTrackId);
        if (!current) return;
        const bank = catalogueRef.current[current.musicClass];
        const index = bank.findIndex((track) => track.id === currentTrackId);
        const nextTrack = index < 0 ? null : bank[(index + 1) % bank.length];
        const result = await audio.current.play(nextTrack ?? null);
        if (result.status === "playing") {
            setActiveTrackId(result.trackId);
            setMessage(`Track ended. Continuing with ${result.trackId}.`);
        } else setMessage(result.reason);
    }

    return (
        <main className="app test-music">
            <div className="brand">TUNED IN · TEMPORARY MUSIC TEST</div>
            <section className="landing card">
                <div className="eyebrow">Development only</div>
                <h1 className="stage-title">Test music</h1>
                <p className="lead">
                    This page does not create a participant session or save
                    study data.
                </p>

                <label className="field">
                    <span>Starting track</span>
                    <select
                        value={startingTrackId}
                        onChange={(event) =>
                            setStartingTrackId(event.target.value)
                        }
                    >
                        {!tracks.length && (
                            <option value="">No audio files found</option>
                        )}
                        {tracks.map((track) => (
                            <option key={track.id} value={track.id}>
                                {track.musicClass}: {track.id}
                            </option>
                        ))}
                    </select>
                </label>
                <div className="test-actions">
                    <button
                        className="primary"
                        disabled={!startingTrack}
                        onClick={() => void playStartingTrack()}
                    >
                        Play starting track
                    </button>
                    <button
                        className="stop-button"
                        onClick={() => {
                            audio.current.stop();
                            setActiveTrackId(null);
                            setMessage("Audio stopped.");
                        }}
                    >
                        Stop
                    </button>
                    <button
                        className="stop-button"
                        disabled={!activeTrack}
                        onClick={() => {
                            void audio.current
                                .jumpToFinalSeconds(10)
                                .then((jumped) =>
                                    setMessage(
                                        jumped
                                            ? "Jumped to the final 10 seconds. Waiting for the next track."
                                            : "No track is currently playing.",
                                    ),
                                );
                        }}
                    >
                        Jump to final 10 seconds
                    </button>
                </div>
                <div className="now-playing">
                    <b>Now playing</b>
                    <span>
                        {activeTrack
                            ? `${activeTrack.musicClass}: ${activeTrack.id}`
                            : "No audio"}
                    </span>
                </div>
                <p className="helper">
                    This is the only manual track selection. Use Change state
                    below to select the target-state track automatically, or
                    Jump to final 10 seconds to test same-state continuation.
                </p>

                <div className="test-metrics">
                    <b>Rule preview</b>
                    <Metric
                        label="Median IL (seconds)"
                        value={medianIl}
                        max={3}
                        step={0.01}
                        onChange={setMedianIl}
                    />
                    <Metric
                        label="Median FPED (seconds)"
                        value={medianFped}
                        max={15}
                        step={0.01}
                        onChange={setMedianFped}
                    />
                    <Metric
                        label="First-pass error rate (%)"
                        value={errorRate}
                        max={100}
                        step={1}
                        onChange={setErrorRate}
                    />
                    <div className={`test-state ${predictedState}`}>
                        Predicted state: {predictedState}
                    </div>
                    <button
                        className="primary change-state"
                        onClick={() => void changeState()}
                    >
                        Change state
                    </button>
                </div>
                <p className="test-message">{message}</p>
            </section>
        </main>
    );
}

function Metric(props: {
    label: string;
    value: number;
    max: number;
    step: number;
    onChange: (value: number) => void;
}) {
    return (
        <label className="field slider-metric">
            <span>
                {props.label}:{" "}
                <b>{props.value.toFixed(props.step < 1 ? 2 : 0)}</b>
            </span>
            <input
                type="range"
                min="0"
                max={props.max}
                step={props.step}
                value={props.value}
                onChange={(event) => props.onChange(Number(event.target.value))}
            />
        </label>
    );
}
