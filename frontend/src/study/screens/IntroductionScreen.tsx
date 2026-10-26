import { SimpleStage, Source } from "../components";
import type { StudyController } from "../hooks/useStudyController";

type Props = Pick<
    StudyController,
    "setStage"
    | "participantId"
    | "baseline"
    | "timing"
    | "introductionStep"
    | "setIntroductionStep"
    | "shortcutMessage"
    | "setShortcutMessage"
    | "introPracticeForm"
    | "introRecordCodeInput"
    | "goBack"
>;

export function IntroductionScreen({
    setStage,
    participantId,
    baseline,
    timing,
    introductionStep,
    setIntroductionStep,
    shortcutMessage,
    setShortcutMessage,
    introPracticeForm,
    introRecordCodeInput,
    goBack,
}: Props) {
    return (
        <SimpleStage
            eyebrow={`PARTICIPANT INSTRUCTIONS · ${introductionStep + 1} OF 3`}
            title={
                introductionStep === 0
                    ? "Session flow"
                    : introductionStep === 1
                        ? "What you will do & keyboard shortcuts"
                        : "Reading source codes"
            }
            description={
                introductionStep === 0
                    ? "Read through each stage before beginning the task."
                    : introductionStep === 1
                        ? "Read how the task works, then try the keyboard shortcuts below. Note: this is NOT yet the practice block."
                        : "Read every character exactly as it appears."
            }
            participantId={participantId}
        >
            {introductionStep === 0 && (
                <>
                    <div className="instructions important-note">
                        <b>Session Flow</b>
                        <ol>
                            <li>
                                <strong>Practice Block:</strong> Get
                                familiar with copying the records. Practice
                                data are exported for reference but are not
                                included in the final study analysis. It may
                                be skipped before or during the task.
                            </li>
                            <li>
                                <strong>
                                    Silent Baseline Calibration Block:
                                </strong>{" "}
                                {baseline.mode === "records"
                                    ? `Complete ${baseline.recordTarget} records correctly without music. Corrections count toward the same record, and there is no time limit.`
                                    : `Complete the task without music for ${timing.baselineSeconds} seconds, until the timer ends.`}
                                {" "}This stage creates your personal reference for Adaptive Music.
                            </li>
                            <li>
                                <strong>Audio Comfort Check:</strong> Listen
                                to a short sample and choose a comfortable
                                volume.
                            </li>
                            <li>
                                <strong>Timed Task Blocks:</strong> Complete
                                the task under the assigned conditions.
                                These blocks provide the study data used to
                                compare no music, static music, and adaptive
                                music.
                            </li>
                        </ol>
                    </div>
                    <div className="stage-actions">
                        <button
                            className="secondary large"
                            onClick={goBack}
                        >
                            ← Back to participant setup
                        </button>
                        <button
                            className="primary large"
                            onClick={() => setIntroductionStep(1)}
                        >
                            Next <span>→</span>
                        </button>
                    </div>
                </>
            )}

            {introductionStep === 1 && (
                <>
                    <div className="instructions">
                        <div className="intro-demo-heading">
                            <b>General Instructions</b>
                        </div>
                        <p>
                            Read the source record, copy each value into its
                            matching field, then submit the record for
                            checking.
                        </p>
                        <div
                            className="task-overview"
                            aria-label="Task overview"
                        >
                            <span>1. Read source record</span>
                            <i aria-hidden="true">→</i>
                            <span>2. Fill the matching fields</span>
                            <i aria-hidden="true">→</i>
                            <span>3. Submit record</span>
                        </div>
                    </div>
                    <div className="instructions">
                        <div className="intro-demo-heading">
                            <b>Use the keyboard to work faster</b>
                        </div>
                        <p>
                            Press <kbd>Tab</kbd> to move to the next field.
                            You can press tab 3x or until you reach the
                            "Quantity" field. Press <kbd>Enter</kbd> to
                            submit a record. Try it in the example below.
                        </p>
                    </div>
                    <div className="intro-practice-box">
                        <div className="intro-demo-heading">
                            <b>Keyboard shortcut demo</b>
                            <p>
                                This is only a short area to try{" "}
                                <kbd>Tab</kbd> and
                                <kbd>Enter</kbd>. It does not start Practice
                                Block, save any data, or affect your
                                session.
                            </p>
                        </div>
                        <form
                            ref={introPracticeForm}
                            className="intro-task-example"
                            aria-label="Example task screen"
                            onSubmit={(event) => {
                                event.preventDefault();
                                setShortcutMessage(
                                    "Enter pressed, submitted.",
                                );
                            }}
                        >
                            <div className="panel">
                                <div className="panel-label">
                                    SOURCE RECORD
                                </div>
                                <Source
                                    record={{
                                        id: "example-source",
                                        recordCode: "a0I-754",
                                        batchCode: "fE-19",
                                        quantity: "954",
                                    }}
                                />
                            </div>

                            <div className="panel">
                                <div className="panel-label">
                                    ENTRY FIELDS
                                </div>

                                <label className="field">
                                    <span>Record Code</span>
                                    <input
                                        ref={introRecordCodeInput}
                                        autoComplete="off"
                                    />
                                </label>

                                <label className="field">
                                    <span>Batch Code</span>
                                    <input autoComplete="off" />
                                </label>

                                <label className="field">
                                    <span>Quantity</span>
                                    <input
                                        autoComplete="off"
                                        inputMode="numeric"
                                    />
                                </label>

                                <button
                                    className="test-submit"
                                    type="submit"
                                >
                                    Submit
                                </button>

                                {shortcutMessage && (
                                    <p
                                        className="shortcut-confirmation"
                                        role="status"
                                    >
                                        {shortcutMessage}
                                    </p>
                                )}
                            </div>
                        </form>

                        <button
                            className="secondary intro-reset-button"
                            type="button"
                            onClick={() => {
                                introPracticeForm.current?.reset();
                                setShortcutMessage("");
                                introRecordCodeInput.current?.focus();
                            }}
                        >
                            Reset demo fields
                        </button>
                    </div>
                    <div className="stage-actions">
                        <button
                            className="secondary large"
                            onClick={goBack}
                        >
                            ← Back
                        </button>
                        <button
                            className="primary large"
                            onClick={() => setIntroductionStep(2)}
                        >
                            Next <span>→</span>
                        </button>
                    </div>
                </>
            )}

            {introductionStep === 2 && (
                <>
                    <div className="instructions important-note">
                        <b>Read each character carefully</b>
                        <p>
                            Record codes may contain capital and lower-case
                            letters. Type each value exactly as displayed,
                            the inputs are case-sensitive. Use{" "}
                            <kbd>Shift</kbd> and/or <kbd>Caps Lock</kbd>{" "}
                            when needed.
                        </p>
                        <p>
                            Refer to the commonly mistaken characters below.
                            The number <b>0</b> has a line through its
                            centre, while <b>O</b> is a letter. The capital
                            letter <b>I</b> has horizontal bars at the top
                            and bottom, while <b>1</b> is the number one.
                            The lower-case letter <b>l</b> can also look
                            similar to <b>1</b>. Also compare <b>6</b>{" "}
                            carefully with the capital letter <b>G</b>.
                        </p>
                    </div>
                    <div
                        className="letters"
                        aria-label="Similar characters guide"
                    >
                        <div className="letter-pair">
                            <div className="letter-card">
                                <b>0</b>
                                <span>Number zero</span>
                            </div>
                            <div className="letter-card">
                                <b>O</b>
                                <span>Letter O</span>
                            </div>
                        </div>
                        <div className="letter-pair">
                            <div className="letter-card">
                                <b>1</b>
                                <span>Number one</span>
                            </div>
                            <div className="letter-card">
                                <b>I</b>
                                <span>Capital letter I</span>
                            </div>
                        </div>
                        <div className="letter-pair">
                            <div className="letter-card">
                                <b>1</b>
                                <span>Number one</span>
                            </div>
                            <div className="letter-card">
                                <b>l</b>
                                <span>Lower-case letter l</span>
                            </div>
                        </div>
                        <div className="letter-pair">
                            <div className="letter-card">
                                <b>6</b>
                                <span>Number six</span>
                            </div>
                            <div className="letter-card">
                                <b>G</b>
                                <span>Capital letter G</span>
                            </div>
                        </div>
                    </div>
                    <div className="intro-source-example">
                        <div className="panel-label">
                            EXAMPLE SOURCE RECORD
                        </div>
                        <Source
                            record={{
                                id: "example-reading",
                                recordCode: "O1g-60I",
                                batchCode: "bG-06",
                                quantity: "106",
                            }}
                        />
                    </div>
                    <div className="stage-actions">
                        <button
                            className="secondary large"
                            onClick={goBack}
                        >
                            ← Back
                        </button>
                        <button
                            className="primary large"
                            onClick={() => setStage("practice")}
                        >
                            I have understood the instructions
                        </button>
                    </div>
                </>
            )}
        </SimpleStage>
    );
}
