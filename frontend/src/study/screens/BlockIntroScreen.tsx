import { fmt } from "../../script/format";
import { SimpleStage } from "../components";
import type { StudyController } from "../hooks/useStudyController";

type Props = Pick<
    StudyController,
    "participantId"
    | "blockIndex"
    | "conditionOrder"
    | "timing"
    | "startBlock"
>;

export function BlockIntroScreen({
    participantId,
    blockIndex,
    conditionOrder,
    timing,
    startBlock,
}: Props) {
    return (
        <SimpleStage
            eyebrow={`BLOCK ${blockIndex + 1} OF ${conditionOrder.length}`}
            title={`BLOCK ${blockIndex + 1} - Timed Task`}
            description="The next timed block is ready. Continue entering records until the timer ends."
            participantId={participantId}
        >
            <div className="summary single-summary">
                <div>
                    <span>Block duration</span>
                    <b>{fmt(timing.blockSeconds)}</b>
                </div>
            </div>
            <button className="primary large" onClick={startBlock}>
                Start Block {blockIndex + 1} <span>→</span>
            </button>
        </SimpleStage>
    );
}
