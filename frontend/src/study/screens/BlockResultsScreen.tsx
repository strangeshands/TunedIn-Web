import { fmt } from "../../script/format";
import { CompletionConfetti, SimpleStage } from "../components";
import type { StudyController } from "../hooks/useStudyController";

type Props = Pick<
    StudyController,
    "participantId"
    | "restRemaining"
    | "blockIndex"
    | "conditionOrder"
    | "blockHighestStreak"
    | "continueFromRest"
>;

export function BlockResultsScreen({
    participantId,
    restRemaining,
    blockIndex,
    conditionOrder,
    blockHighestStreak,
    continueFromRest,
}: Props) {
    const hasNextBlock = blockIndex < conditionOrder.length - 1;

    return (
        <SimpleStage
            eyebrow={`BLOCK ${blockIndex + 1} COMPLETE`}
            title={`Congratulations! Block ${blockIndex + 1} complete.`}
            description="Your progress has been saved."
            participantId={participantId}
        >
            <CompletionConfetti />
            <div
                className={`highest-streak${blockHighestStreak > 0 ? ` streak-${Math.min(blockHighestStreak, 5)}` : ""}`}
            >
                <span>Your highest streak in Block {blockIndex + 1} was</span>
                <strong>{blockHighestStreak}</strong>
                <span>consecutive correct records</span>
            </div>
            {hasNextBlock && (
                <div className="timer-card">
                    <span>Rest time remaining</span>
                    <strong>{fmt(restRemaining)}</strong>
                </div>
            )}
            <button className="primary large" onClick={continueFromRest}>
                {hasNextBlock
                    ? `Skip rest and proceed to Block ${blockIndex + 2}`
                    : "Finish experiment"}{" "}
                <span>→</span>
            </button>
        </SimpleStage>
    );

}
