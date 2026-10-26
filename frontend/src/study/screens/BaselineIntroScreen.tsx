import { fmt } from "../../script/format";
import { SimpleStage } from "../components";
import type { StudyController } from "../hooks/useStudyController";

type Props = Pick<
    StudyController,
    "participantId"
    | "navigationLocked"
    | "timing"
    | "goBack"
    | "startBaselineCalibration"
>;

export function BaselineIntroScreen({
    participantId,
    navigationLocked,
    timing,
    goBack,
    startBaselineCalibration,
}: Props) {
    return (
        <SimpleStage
            eyebrow="SILENT BASELINE"
            title="Baseline Calibration Block"
            description="This is the critical measured task. Perform the encoding task as you normally would. No music will play, and your results become your personal adaptive-music reference."
            participantId={participantId}
        >
            <div className="timer-card">
                <span>Calibration duration</span>
                <strong>{fmt(timing.baselineSeconds)}</strong>
            </div>
            <button
                className="primary large"
                onClick={startBaselineCalibration}
            >
                Start Calibration Block <span>→</span>
            </button>
            {!navigationLocked && (
                <button className="secondary large" onClick={goBack}>
                    ← Back to Practice
                </button>
            )}
        </SimpleStage>
    );
}
