import { fmt } from "../../script/format";
import { Field, Source } from "../components";
import type { StudyController } from "../hooks/useStudyController";

type Props = Pick<
    StudyController,
    "stage"
    | "participantId"
    | "blockIndex"
    | "record"
    | "form"
    | "errors"
    | "streak"
    | "submissionFeedback"
    | "seconds"
    | "message"
    | "audioMessage"
    | "recordCodeInput"
    | "conditionOrder"
    | "duration"
    | "remaining"
    | "skipPracticeInProgress"
    | "update"
    | "submit"
>;

export function TaskScreen({
    stage,
    participantId,
    blockIndex,
    record,
    form,
    errors,
    streak,
    submissionFeedback,
    seconds,
    message,
    audioMessage,
    recordCodeInput,
    conditionOrder,
    duration,
    remaining,
    skipPracticeInProgress,
    update,
    submit,
}: Props) {
    const isPractice = stage === "practice" || stage === "baseline";
    return (
        <main className="task">
            <header>
                <div>
                    <div className="brand">TUNED IN</div>
                    <small className="participant-tag">
                        Participant {participantId}
                    </small>
                </div>
                <div className="meta">
                    <span className="pill">
                        {stage === "baseline"
                            ? "Calibration"
                            : isPractice
                                ? "Practice"
                                : `Block ${blockIndex + 1} / ${conditionOrder.length}`}
                    </span>
                    <span className="pill">Timed Task</span>
                    <span>{fmt(remaining)} remaining</span>
                </div>
            </header>
            <div className="progress">
                <i
                    style={{
                        width: `${Math.min(100, (seconds / duration) * 100)}%`,
                    }}
                />
            </div>
            <section className="content">
                <div className="heading">
                    <div>
                        <div className="eyebrow">
                            {stage === "baseline"
                                ? "SILENT CALIBRATION"
                                : isPractice
                                    ? "PRACTICE ENCODING"
                                    : "DIGITAL ENCODING"}
                        </div>
                        <h2>Enter the source record</h2>
                    </div>
                    <div
                        className="task-shortcuts"
                        aria-label="Keyboard shortcuts"
                    >
                        <b>
                            <kbd>Tab</kbd> next field
                        </b>
                        <b>
                            <kbd>Enter</kbd> submit
                        </b>
                    </div>
                </div>
                {record && (
                    <div
                        className={`streak-area${streak > 1 ? ` streak-frame streak-${Math.min(streak, 5)}` : ""}${submissionFeedback === "correct" && streak > 1 ? ` streak-celebrate streak-celebrate-${Math.min(streak, 5)}` : ""}`}
                    >
                        <div className="grid">
                            <section className="panel">
                                <div className="panel-label">SOURCE RECORD</div>
                                <Source record={record} />
                            </section>
                            <form
                                className={`panel${submissionFeedback ? ` submission-${submissionFeedback}` : ""}`}
                                onSubmit={submit}
                            >
                                <div className="panel-label">ENTRY FIELDS</div>
                                <p className="entry-note">
                                    Type upper- and lower-case letters exactly
                                    as displayed. Capitalization is not
                                    automatic.
                                </p>
                                <Field
                                    label="Record Code"
                                    value={form.recordCode}
                                    error={errors.includes("recordCode")}
                                    autoFocus
                                    inputRef={recordCodeInput}
                                    onChange={(value) =>
                                        update("recordCode", value)
                                    }
                                />
                                <Field
                                    label="Batch Code"
                                    value={form.batchCode}
                                    error={errors.includes("batchCode")}
                                    onChange={(value) =>
                                        update("batchCode", value)
                                    }
                                />
                                <Field
                                    label="Quantity"
                                    value={form.quantity}
                                    error={errors.includes("quantity")}
                                    inputMode="numeric"
                                    onChange={(value) =>
                                        update("quantity", value)
                                    }
                                />
                                <button className="primary submit">
                                    Submit Record <span>↵</span>
                                </button>
                                {errors.length > 0 && (
                                    <div className="error" role="alert">
                                        <b>
                                            Check the highlighted field
                                            {errors.length > 1 ? "s" : ""}.
                                        </b>
                                        <span>
                                            Correct the value, then submit
                                            again.
                                        </span>
                                    </div>
                                )}
                            </form>
                        </div>
                        {streak > 1 && (
                            <div className="streak" aria-live="polite">
                                🔥 Current Streak: {streak} 🔥
                            </div>
                        )}
                    </div>
                )}
                {stage === "practice" && (
                    <button
                        className="practice-skip-during"
                        onClick={() => void skipPracticeInProgress()}
                    >
                        End Practice Block <span>→</span>
                    </button>
                )}
                {audioMessage && !isPractice && (
                    <p className="error">{audioMessage}</p>
                )}
                {message && (
                    <p className="error" role="alert">
                        {message}
                    </p>
                )}
            </section>
        </main>
    );
}
