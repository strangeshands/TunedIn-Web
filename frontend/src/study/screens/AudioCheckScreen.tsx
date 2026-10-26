import { SimpleStage } from "../components";
import type { StudyController } from "../hooks/useStudyController";

type Props = Pick<
    StudyController,
    "participantId"
    | "musicCatalogue"
    | "audioMessage"
    | "audioVolume"
    | "setAudioVolume"
    | "testAudioPlaying"
    | "toggleTestAudio"
    | "continueFromAudioCheck"
>;

export function AudioCheckScreen({
    participantId,
    musicCatalogue,
    audioMessage,
    audioVolume,
    setAudioVolume,
    testAudioPlaying,
    toggleTestAudio,
    continueFromAudioCheck,
}: Props) {
    return (
        <SimpleStage
            eyebrow="AUDIO-COMFORT CHECK"
            title="Check the playback level"
            description="Confirm that headphones are comfortable before the timed blocks."
            participantId={participantId}
        >
            <div className="instructions">
                <b>Researcher / participant check</b>
                <ul>
                    <li>Confirm the headphones fit comfortably.</li>
                    <li>
                        Use the slider and test controls below to choose a
                        comfortable volume before the timed blocks.
                    </li>
                    <li>
                        The selected volume will be retained during the
                        music blocks.
                    </li>
                </ul>
            </div>
            <div className="test-banner">
                {musicCatalogue.baseline.length
                    ? "Use the test button to check the first baseline track."
                    : "No test track was found. The session can still continue silently."}
            </div>
            {musicCatalogue.baseline.length > 0 && (
                <div className="audio-controls">
                    <button
                        className="secondary"
                        onClick={() => void toggleTestAudio()}
                    >
                        {testAudioPlaying
                            ? "Pause test audio"
                            : "Play test audio"}
                    </button>
                    <label className="volume-control">
                        <span>
                            Test volume: {Math.round(audioVolume * 100)}%
                        </span>
                        <input
                            type="range"
                            min="0"
                            max="100"
                            value={Math.round(audioVolume * 100)}
                            onChange={(event) =>
                                setAudioVolume(
                                    Number(event.target.value) / 100,
                                )
                            }
                        />
                    </label>
                </div>
            )}
            {audioMessage && <p className="error">{audioMessage}</p>}
            <button
                className="primary large"
                onClick={() => void continueFromAudioCheck()}
            >
                Audio level is comfortable <span>→</span>
            </button>
        </SimpleStage>
    );
}
