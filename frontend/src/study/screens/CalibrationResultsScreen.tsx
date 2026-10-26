import { SimpleStage } from "../components";
import type { StudyController } from "../hooks/useStudyController";

type Props = Pick<
    StudyController,
    "setStage"
    | "participantId"
>;

export function CalibrationResultsScreen({
    setStage,
    participantId,
}: Props) {
    return (
        <SimpleStage
            eyebrow="SILENT BASELINE COMPLETE"
            title="Silent Baseline complete."
            description="Your progress has been saved. Your personal reference will be used quietly during the Adaptive Music block."
            participantId={participantId}
        >
            <button
                className="primary large"
                onClick={() => setStage("audio-check")}
            >
                Continue to audio check <span>→</span>
            </button>
        </SimpleStage>
    );
}
