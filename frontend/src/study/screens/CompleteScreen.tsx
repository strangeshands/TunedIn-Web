import { exportUrl } from "../../script/api";
import { SimpleStage } from "../components";
import type { StudyController } from "../hooks/useStudyController";

type Props = Pick<
    StudyController,
    "participantId"
    | "sessionId"
    | "highestStreak"
    | "conditionOrder"
    | "restart"
>;

export function CompleteScreen({
    participantId,
    sessionId,
    highestStreak,
    conditionOrder,
    restart,
}: Props) {
    return (
        <SimpleStage
            eyebrow="EXPERIMENTAL BLOCKS COMPLETE"
            title="Encoding session finished."
            description={`Participant ${participantId} has completed all ${conditionOrder.length} configured conditions.`}
            participantId={participantId}
        >
            <div
                className={`highest-streak${highestStreak > 0 ? ` streak-${Math.min(highestStreak, 5)}` : ""}`}
            >
                <span>Your highest streak was</span>
                <strong>{highestStreak}</strong>
                <span>consecutive correct records</span>
            </div>
            <div>
                {sessionId && (
                    <a
                        className="secondary download-zip"
                        href={exportUrl(sessionId, "results.zip")}
                    >
                        Download results ZIP
                    </a>
                )}
            </div>
            <div className="completion-divider">
                <span>OR</span>
            </div>
            <button className="primary large" onClick={restart}>
                Start another participant
            </button>
        </SimpleStage>
    );
}
