import { fmt } from "../../script/format";
import { SimpleStage } from "../components";
import type { StudyController } from "../hooks/useStudyController";

type Props = Pick<
    StudyController,
    "participantId"
    | "navigationLocked"
    | "timing"
    | "goBack"
    | "startPractice"
    | "skipPractice"
>;

export function PracticeScreen({
    participantId,
    navigationLocked,
    timing,
    goBack,
    startPractice,
    skipPractice,
}: Props) {
    return (
        <SimpleStage
            eyebrow="PRACTICE"
            title="Practice Block"
            description="This is only for getting a feel for the task. Practice data are exported for reference but are not included in the final study analysis."
            participantId={participantId}
        >
            <div className="instructions">
                <b>Practice instructions</b>
                <ul>
                    <li>
                        Copy the source values into the three matching
                        fields. No music will play during Practice.
                    </li>
                    <li>
                        Press <kbd>Tab</kbd> to move through the fields,
                        then <kbd>Enter</kbd> to submit.
                    </li>
                    <li>
                        Type capital and lower-case letters exactly as
                        shown. Capitalization is not changed automatically.
                    </li>
                    <li>Incorrect records must be corrected.</li>
                    <li>
                        You may end Practice at any time and continue to
                        Silent Baseline Calibration.
                    </li>
                </ul>
            </div>
            <div className="timer-card">
                <span>Practice duration</span>
                <strong>{fmt(timing.practiceSeconds)}</strong>
            </div>
            <button className="primary large" onClick={startPractice}>
                Start Practice Block <span>→</span>
            </button>
            <div className="practice-options">
                {!navigationLocked && (
                    <button className="secondary large" onClick={goBack}>
                        ← Back to instructions
                    </button>
                )}
                <button className="secondary large" onClick={skipPractice}>
                    I am ready, skip Practice Block
                </button>
            </div>
        </SimpleStage>
    );
}
