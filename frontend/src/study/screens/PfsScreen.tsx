import { SimpleStage } from "../components";
import type { StudyController } from "../hooks/useStudyController";

type Props = Pick<
    StudyController,
    "participantId"
    | "blockIndex"
    | "conditionOrder"
    | "continueAfterPfs"
>;

export function PfsScreen({
    participantId,
    blockIndex,
    conditionOrder,
    continueAfterPfs,
}: Props) {

    const isFinalBlock = blockIndex === conditionOrder.length - 1;
    return (
        <SimpleStage
            eyebrow={`You are almost there!`}
            title="Short questionnaire"
            description="Your progress has been saved. Please complete the PFS questionnaire before continuing."
            participantId={participantId}
        >
            <button className="primary large" onClick={continueAfterPfs}>
                {isFinalBlock
                    ? "I have completed the questionnaire. Finish experiment"
                    : "I have completed the questionnaire. Continue to rest"}{" "}
                <span>→</span>
            </button>
        </SimpleStage>
    );

}
