import { exportUrl } from "../../script/api";
import { SimpleStage } from "../components";
import type { StudyController } from "../hooks/useStudyController";

type Props = Pick<
    StudyController,
    "participantId"
    | "sessionId"
    | "conditionOrder"
    | "restart"
>;

export function CompleteScreen({
    participantId,
    sessionId,
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
