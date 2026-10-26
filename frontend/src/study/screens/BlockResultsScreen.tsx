import { fmt } from "../../script/format";
import { CompletionConfetti, SimpleStage } from "../components";
import type { StudyController } from "../hooks/useStudyController";

type Props = Pick<
    StudyController,
    "participantId"
    | "restRemaining"
    | "blockIndex"
    | "continueFromRest"
>;

export function BlockResultsScreen({
    participantId,
    restRemaining,
    blockIndex,
    continueFromRest,
}: Props) {

    return (
        <SimpleStage
            eyebrow={`BLOCK ${blockIndex + 1} COMPLETE`}
            title={`Congratulations! Block ${blockIndex + 1} complete.`}
            description="Your progress has been saved."
            participantId={participantId}
        >
            <CompletionConfetti />
            <div className="timer-card">
                <span>Rest time remaining</span>
                <strong>{fmt(restRemaining)}</strong>
            </div>
            <button className="primary large" onClick={continueFromRest}>
                Skip rest and proceed to Block {blockIndex + 2}{" "}
                <span>→</span>
            </button>
        </SimpleStage>
    );

}
