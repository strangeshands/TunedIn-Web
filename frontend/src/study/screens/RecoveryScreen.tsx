import { SimpleStage } from "../components";
import type { StudyController } from "../hooks/useStudyController";

type Props = Pick<
    StudyController,
    "participantId"
    | "recoveryActiveBlock"
    | "baseline"
    | "message"
    | "endInterruptedSession"
    | "restartInterruptedBlock"
>;

export function RecoveryScreen({
    participantId,
    recoveryActiveBlock,
    baseline,
    message,
    endInterruptedSession,
    restartInterruptedBlock,
}: Props) {
    const recordBaseline = recoveryActiveBlock === 1 && baseline.mode === "records";
    return (
        <SimpleStage
            eyebrow="RESEARCHER RECOVERY"
            title={recordBaseline ? "Baseline calibration was interrupted" : "Timed block was interrupted"}
            description={recordBaseline
                ? `Completed blocks are preserved. Restarting begins baseline calibration again from 0 of ${baseline.recordTarget} completed records.`
                : "Completed blocks are preserved. Restarting begins the interrupted timed block again from 0:00."}
            participantId={participantId}
        >
            <div className="instructions important-note">
                <b>Session safely preserved</b>
                <p>
                    {recoveryActiveBlock === 0
                        ? "Practice Block was interrupted."
                        : recoveryActiveBlock === 1
                            ? "Silent Baseline Calibration Block was interrupted."
                            : `Timed Block ${(recoveryActiveBlock ?? 2) - 1} was interrupted.`}{" "}
                    {recordBaseline ? `You may restart from 0 of ${baseline.recordTarget} completed records.` : "You may restart this block from 0:00."}
                </p>
            </div>
            <button
                className="primary large"
                onClick={() => void restartInterruptedBlock()}
            >
                {recordBaseline ? `Restart baseline from 0 of ${baseline.recordTarget} records` : "Restart this block from 0:00"} <span>→</span>
            </button>
            <button
                className="secondary large"
                onClick={() => void endInterruptedSession()}
            >
                End session and open downloads <span>→</span>
            </button>
            {message && <p className="error">{message}</p>}
        </SimpleStage>
    );
}
