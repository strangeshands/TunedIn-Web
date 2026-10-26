import { SimpleStage } from "../components";
import type { StudyController } from "../hooks/useStudyController";

type Props = Pick<
    StudyController,
    "setStage"
    | "participantId"
>;

export function HandoverScreen({
    setStage,
    participantId,
}: Props) {
    return (
        <SimpleStage
            eyebrow="SESSION COMPLETE"
            title="Thank you"
            description="You may now give the device back to the researcher."
            participantId={participantId}
        >
            <button
                className="primary large"
                onClick={() => setStage("complete")}
            >
                Proceed
            </button>
        </SimpleStage>
    );
}
