import { SimpleStage } from "../components";
import type { StudyController } from "../hooks/useStudyController";

type Props = Pick<
    StudyController,
    "participantId"
    | "message"
    | "savingMessage"
    | "retrySavingEvents"
>;

export function SavingScreen({
    participantId,
    message,
    savingMessage,
    retrySavingEvents,
}: Props) {
    return (
        <SimpleStage
            eyebrow="SAVING SESSION DATA"
            title="Saving events"
            description={savingMessage || "Saving task events…"}
            participantId={participantId}
        >
            {savingMessage.startsWith("Some") ? (
                <>
                    <p className="error">{message}</p>
                    <button
                        className="primary large"
                        onClick={retrySavingEvents}
                    >
                        Retry saving events <span>↻</span>
                    </button>
                </>
            ) : (
                <div className="saving-status" aria-live="polite">
                    <i aria-hidden="true" />
                    <span>Please wait. Do not close this page.</span>
                </div>
            )}
        </SimpleStage>
    );
}
