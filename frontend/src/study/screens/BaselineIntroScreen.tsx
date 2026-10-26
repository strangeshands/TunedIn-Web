import { fmt } from "../../script/format";
import { SimpleStage } from "../components";
import type { StudyController } from "../hooks/useStudyController";

type Props = Pick<
    StudyController,
    "participantId"
    | "navigationLocked"
    | "timing"
    | "baseline"
    | "goBack"
    | "startBaselineCalibration"
>;

export function BaselineIntroScreen({
    participantId,
    navigationLocked,
    timing,
    baseline,
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
                <span>{baseline.mode === "records" ? "Calibration target" : "Calibration duration"}</span>
                <strong>{baseline.mode === "records" ? `${baseline.recordTarget} completed records` : fmt(timing.baselineSeconds)}</strong>
            </div>
            <p className="instructions">
                {baseline.mode === "records"
                    ? `Complete ${baseline.recordTarget} records correctly. The counter increases only after a record is accepted; correcting a mistake still completes the same record. There is no time limit.`
                    : `Continue entering records for ${fmt(timing.baselineSeconds)}. Calibration ends when the timer runs out; there is no record target.`}
                {" "}Work at your normal pace. No music will play.
            </p>
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
