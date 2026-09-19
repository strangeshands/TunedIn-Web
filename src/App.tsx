import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
    downloadParticipantCsv,
    downloadParticipantJson,
    type ParticipantSessionResult,
} from "./resultExport";
import { generateRecordBank, type GeneratedRecord } from "./recordGenerator";

type Condition = "No music" | "Static music" | "Adaptive music";
type OrderId = "A" | "B" | "C";
type Stage =
    | "participant"
    | "baseline"
    | "audio-check"
    | "block-intro"
    | "task"
    | "block-results"
    | "complete";

type BlockResult = {
    block: number;
    condition: Condition;
    accepted: number;
    elapsedSeconds: number;
    firstPassAccepted: number;
    firstPassRejected: number;
    correctionCycles: number;
};

const CONDITION_ORDERS: Record<OrderId, Condition[]> = {
    A: ["No music", "Static music", "Adaptive music"],
    B: ["Static music", "Adaptive music", "No music"],
    C: ["Adaptive music", "No music", "Static music"],
};

// Production protocol durations.
const REAL_BASELINE_SECONDS = 2 * 60;
const REAL_BLOCK_SECONDS = 8 * 60;

// TEMPORARY TEST MODE:
// Keep this true while developing so you do not have to wait 2/8 minutes.
// Set to false before actual study sessions.
const TEST_MODE = true;
const TEST_BASELINE_SECONDS = 8;
const TEST_BLOCK_SECONDS = 15;

const BASELINE_SECONDS = TEST_MODE
    ? TEST_BASELINE_SECONDS
    : REAL_BASELINE_SECONDS;
const BLOCK_SECONDS = TEST_MODE ? TEST_BLOCK_SECONDS : REAL_BLOCK_SECONDS;

const empty = { recordCode: "", batchCode: "", quantity: "" };

export default function App() {
    const [stage, setStage] = useState<Stage>("participant");
    const [participantId, setParticipantId] = useState(
        () => localStorage.getItem("tunedIn.participantId") ?? "",
    );
    const [orderId, setOrderId] = useState<OrderId>("A");
    const [blockIndex, setBlockIndex] = useState(0);
    const [recordIndex, setRecordIndex] = useState(0);
    const [form, setForm] = useState(empty);
    const [errors, setErrors] = useState<string[]>([]);
    const [accepted, setAccepted] = useState(0);
    const [seconds, setSeconds] = useState(0);
    const [started, setStarted] = useState<number | null>(null);
    const [baselineStarted, setBaselineStarted] = useState<number | null>(null);
    const [blockResults, setBlockResults] = useState<BlockResult[]>([]);
    const [firstPassAccepted, setFirstPassAccepted] = useState(0);
    const [firstPassRejected, setFirstPassRejected] = useState(0);
    const [correctionCycles, setCorrectionCycles] = useState(0);

    const [recordBank, setRecordBank] = useState<GeneratedRecord[]>(() =>
        generateRecordBank(100),
    );

    const firstKey = useRef<number | null>(null);
    const completionGuard = useRef(false);
    const hasSubmittedCurrentRecord = useRef(false);

    const conditionOrder = CONDITION_ORDERS[orderId];
    const condition = conditionOrder[blockIndex] ?? conditionOrder[0];
    const current = recordBank[recordIndex % recordBank.length];

    const remaining = useMemo(
        () => Math.max(0, BLOCK_SECONDS - seconds),
        [seconds],
    );

    // Silent baseline timer.
    useEffect(() => {
        if (stage !== "baseline" || baselineStarted === null) return;

        const id = window.setInterval(() => {
            const elapsed = Math.floor(
                (performance.now() - baselineStarted) / 1000,
            );
            setSeconds(elapsed);

            if (elapsed >= BASELINE_SECONDS) {
                window.clearInterval(id);
                setSeconds(BASELINE_SECONDS);
                setStage("audio-check");
            }
        }, 250);

        return () => window.clearInterval(id);
    }, [stage, baselineStarted]);

    // Eight-minute block timer. In TEST_MODE this ends after 15 seconds.
    useEffect(() => {
        if (stage !== "task" || started === null) return;

        const id = window.setInterval(() => {
            const elapsed = Math.floor((performance.now() - started) / 1000);
            setSeconds(elapsed);

            if (elapsed >= BLOCK_SECONDS && !completionGuard.current) {
                completionGuard.current = true;
                window.clearInterval(id);
                finishBlock(BLOCK_SECONDS);
            }
        }, 250);

        return () => window.clearInterval(id);
    }, [
        stage,
        started,
        blockIndex,
        condition,
        accepted,
        firstPassAccepted,
        firstPassRejected,
        correctionCycles,
    ]);

    const saveParticipant = (e: FormEvent) => {
        e.preventDefault();
        const cleanId = participantId.trim();
        if (!cleanId) return;

        localStorage.setItem("tunedIn.participantId", cleanId);
        localStorage.setItem("tunedIn.orderId", orderId);
        setParticipantId(cleanId);
        setSeconds(0);
        setBaselineStarted(null);
        setStage("baseline");
    };

    const startBaseline = () => {
        setSeconds(0);
        setBaselineStarted(performance.now());
    };

    const continueFromAudioCheck = () => {
        setBlockIndex(0);
        setStage("block-intro");
    };

    const startBlock = () => {
        completionGuard.current = false;
        firstKey.current = null;
        setRecordBank(generateRecordBank(100));
        setRecordIndex(0);
        setForm(empty);
        setErrors([]);
        setAccepted(0);
        setFirstPassAccepted(0);
        setFirstPassRejected(0);
        setCorrectionCycles(0);
        hasSubmittedCurrentRecord.current = false;
        setSeconds(0);
        setStarted(performance.now());
        setStage("task");
    };

    const update = (key: keyof typeof form, value: string) => {
        if (firstKey.current === null && value) {
            firstKey.current = performance.now();
        }

        setForm((old) => ({ ...old, [key]: value.toUpperCase() }));
        if (errors.length) setErrors([]);
    };

    const submit = (e: FormEvent) => {
        e.preventDefault();

        const isFirstPass = !hasSubmittedCurrentRecord.current;
        hasSubmittedCurrentRecord.current = true;

        const bad: string[] = [];
        if (form.recordCode !== current.recordCode) bad.push("Record Code");
        if (form.batchCode !== current.batchCode) bad.push("Batch Code");
        if (form.quantity !== current.quantity) bad.push("Quantity");

        if (bad.length) {
            if (isFirstPass) {
                setFirstPassRejected((old) => old + 1);
            } else {
                setCorrectionCycles((old) => old + 1);
            }

            setErrors(bad);
            return;
        }

        if (isFirstPass) {
            setFirstPassAccepted((old) => old + 1);
        } else {
            setCorrectionCycles((old) => old + 1);
        }

        setAccepted((old) => old + 1);
        setRecordIndex((old) => old + 1);
        hasSubmittedCurrentRecord.current = false;
        setForm(empty);
        setErrors([]);
        firstKey.current = null;
    };

    const finishBlock = (elapsedSeconds: number) => {
        const result: BlockResult = {
            block: blockIndex + 1,
            condition,
            accepted,
            elapsedSeconds,
            firstPassAccepted,
            firstPassRejected,
            correctionCycles,
        };

        setBlockResults((old) => {
            const next = [
                ...old.filter((x) => x.block !== result.block),
                result,
            ];
            localStorage.setItem(
                `tunedIn.session.${participantId}`,
                JSON.stringify({
                    participantId,
                    orderId,
                    conditionOrder,
                    blocks: next,
                    updatedAt: new Date().toISOString(),
                }),
            );
            return next;
        });

        setStarted(null);

        setStage("block-results");
    };

    const continueAfterBlockResults = () => {
        if (blockIndex >= conditionOrder.length - 1) {
            setStage("complete");
            return;
        }

        setBlockIndex((old) => old + 1);
        setSeconds(0);
        setStage("block-intro");
    };

    const getParticipantSession = (): ParticipantSessionResult => ({
        participantId,
        orderId,
        conditionOrder,
        blocks: blockResults,
        updatedAt: new Date().toISOString(),
    });

    const restartSession = () => {
        setStage("participant");
        setBlockIndex(0);
        setRecordIndex(0);
        setForm(empty);
        setErrors([]);
        setAccepted(0);
        setFirstPassAccepted(0);
        setFirstPassRejected(0);
        setCorrectionCycles(0);
        hasSubmittedCurrentRecord.current = false;
        setSeconds(0);
        setStarted(null);
        setBaselineStarted(null);
        setBlockResults([]);
    };

    if (stage === "participant") {
        return (
            <main className="app">
                <div className="brand">TUNED IN</div>
                <section className="landing card">
                    <div className="eyebrow">SESSION SETUP</div>
                    <h1>
                        Participant setup.
                        <br />
                        <span>Start the protocol.</span>
                    </h1>
                    <p className="lead">
                        Enter the participant ID before beginning. The ID and
                        temporary session summary are stored locally in this
                        browser.
                    </p>

                    <form onSubmit={saveParticipant}>
                        <label className="field">
                            <span>Participant ID</span>
                            <input
                                autoFocus
                                value={participantId}
                                onChange={(e) =>
                                    setParticipantId(e.target.value)
                                }
                                placeholder="e.g. P001"
                                autoComplete="off"
                            />
                        </label>

                        <label className="field">
                            <span>Counterbalanced condition order</span>
                            <select
                                value={orderId}
                                onChange={(e) =>
                                    setOrderId(e.target.value as OrderId)
                                }
                            >
                                <option value="A">
                                    Order A — No → Static → Adaptive
                                </option>
                                <option value="B">
                                    Order B — Static → Adaptive → No
                                </option>
                                <option value="C">
                                    Order C — Adaptive → No → Static
                                </option>
                            </select>
                        </label>

                        <div className="instructions">
                            <b>Prototype sequence</b>
                            <ol>
                                <li>Silent baseline</li>
                                <li>Audio-comfort check</li>
                                <li>Three timed encoding blocks</li>
                            </ol>
                        </div>

                        {TEST_MODE && (
                            <div className="test-banner">
                                TEST MODE — baseline ends after{" "}
                                {TEST_BASELINE_SECONDS}s and each block ends
                                after {TEST_BLOCK_SECONDS}s. Production blocks
                                are 8 minutes.
                            </div>
                        )}

                        <button className="primary large" type="submit">
                            Save participant & continue <span>→</span>
                        </button>
                    </form>
                </section>
                <footer>Local prototype · Fictional records only</footer>
            </main>
        );
    }

    if (stage === "baseline") {
        const baselineRunning = baselineStarted !== null;
        const baselineRemaining = Math.max(0, BASELINE_SECONDS - seconds);

        return (
            <SimpleStage
                eyebrow="SILENT BASELINE"
                title="Silent baseline"
                description="Complete the baseline period without background music. This stage precedes the audio-comfort check and the three experimental blocks."
                participantId={participantId}
            >
                <div className="timer-card">
                    <span>
                        {baselineRunning ? "Time remaining" : "Duration"}
                    </span>
                    <strong>
                        {fmt(
                            baselineRunning
                                ? baselineRemaining
                                : BASELINE_SECONDS,
                        )}
                    </strong>
                </div>
                {!baselineRunning && (
                    <button className="primary large" onClick={startBaseline}>
                        Start silent baseline <span>→</span>
                    </button>
                )}
            </SimpleStage>
        );
    }

    if (stage === "audio-check") {
        return (
            <SimpleStage
                eyebrow="AUDIO-COMFORT CHECK"
                title="Check the playback level"
                description="Play the study audio and adjust the device to a comfortable listening level. Keep that level unchanged for the experimental blocks."
                participantId={participantId}
            >
                <div className="instructions">
                    <b>Researcher / participant check</b>
                    <ul>
                        <li>Confirm that audio is audible and comfortable.</li>
                        <li>
                            Confirm there is no clipping, distortion, or device
                            issue.
                        </li>
                        <li>Do not change the volume once the blocks begin.</li>
                    </ul>
                </div>
                <button
                    className="primary large"
                    onClick={continueFromAudioCheck}
                >
                    Audio level is comfortable <span>→</span>
                </button>
            </SimpleStage>
        );
    }

    if (stage === "block-intro") {
        return (
            <SimpleStage
                eyebrow={`BLOCK ${blockIndex + 1} OF 3`}
                title={condition}
                description={`This encoding block runs for 8 minutes in the study. Continue entering records until the timer ends.`}
                participantId={participantId}
            >
                <div className="summary single-summary">
                    <div>
                        <span>Assigned condition</span>
                        <b>{condition}</b>
                    </div>
                    <div>
                        <span>Study duration</span>
                        <b>08:00</b>
                    </div>
                    <div>
                        <span>Prototype duration</span>
                        <b>{fmt(BLOCK_SECONDS)}</b>
                    </div>
                </div>
                <button className="primary large" onClick={startBlock}>
                    Start Block {blockIndex + 1} <span>→</span>
                </button>
            </SimpleStage>
        );
    }

    if (stage === "block-results") {
        const result = blockResults.find(
            (item) => item.block === blockIndex + 1,
        );

        if (!result) return null;

        const firstPassTotal =
            result.firstPassAccepted + result.firstPassRejected;
        const firstPassAccuracy =
            firstPassTotal === 0
                ? 0
                : (result.firstPassAccepted / firstPassTotal) * 100;
        const minutes = result.elapsedSeconds / 60;
        const throughput = minutes === 0 ? 0 : result.accepted / minutes;

        return (
            <SimpleStage
                eyebrow={`BLOCK ${result.block} COMPLETE`}
                title="Block results"
                description="Review the recorded task summary before continuing to the post-block form and rest period."
                participantId={participantId}
            >
                <div className="block-results-grid">
                    <div className="result-card">
                        <span>Condition</span>
                        <strong>{result.condition}</strong>
                    </div>
                    <div className="result-card">
                        <span>Validated records</span>
                        <strong>{result.accepted}</strong>
                    </div>
                    <div className="result-card">
                        <span>Elapsed time</span>
                        <strong>{fmt(result.elapsedSeconds)}</strong>
                    </div>
                    <div className="result-card">
                        <span>Throughput</span>
                        <strong>{throughput.toFixed(2)}</strong>
                        <small>records / minute</small>
                    </div>
                    <div className="result-card">
                        <span>First-pass accuracy</span>
                        <strong>{firstPassAccuracy.toFixed(1)}%</strong>
                    </div>
                    <div className="result-card">
                        <span>Correction cycles</span>
                        <strong>{result.correctionCycles}</strong>
                    </div>
                </div>

                <div className="instructions">
                    <b>Post-block step</b>
                    <p>
                        Complete the post-block form and allow the scheduled
                        rest period before continuing.
                    </p>
                </div>

                <button
                    className="primary large"
                    onClick={continueAfterBlockResults}
                >
                    {blockIndex >= conditionOrder.length - 1
                        ? "Finish participant"
                        : `Continue to Block ${blockIndex + 2}`}
                    <span>→</span>
                </button>
            </SimpleStage>
        );
    }

    if (stage === "complete") {
        return (
            <main className="app">
                <div className="brand">TUNED IN</div>
                <section className="complete card">
                    <div className="check">✓</div>
                    <div className="eyebrow">THREE BLOCKS COMPLETE</div>
                    <h1>Encoding session finished.</h1>
                    <p className="lead">
                        Participant {participantId} has completed all three
                        experimental conditions. The next protocol steps are the
                        final post-block form, interview, and debriefing.
                    </p>

                    <div className="participant-results">
                        {blockResults.map((result) => {
                            const firstPassTotal =
                                result.firstPassAccepted +
                                result.firstPassRejected;
                            const accuracy =
                                firstPassTotal === 0
                                    ? 0
                                    : (result.firstPassAccepted /
                                          firstPassTotal) *
                                      100;
                            const throughput =
                                result.elapsedSeconds === 0
                                    ? 0
                                    : result.accepted /
                                      (result.elapsedSeconds / 60);

                            return (
                                <div
                                    className="participant-block"
                                    key={result.block}
                                >
                                    <div className="participant-block-heading">
                                        <strong>Block {result.block}</strong>
                                        <span>{result.condition}</span>
                                    </div>
                                    <div className="participant-block-stats">
                                        <span>
                                            Validated
                                            <b>{result.accepted}</b>
                                        </span>
                                        <span>
                                            Throughput
                                            <b>{throughput.toFixed(2)}/min</b>
                                        </span>
                                        <span>
                                            First-pass accuracy
                                            <b>{accuracy.toFixed(1)}%</b>
                                        </span>
                                        <span>
                                            Corrections
                                            <b>{result.correctionCycles}</b>
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="download-actions">
                        <button
                            className="primary"
                            onClick={() =>
                                downloadParticipantCsv(getParticipantSession())
                            }
                        >
                            Download CSV
                        </button>
                        <button
                            className="secondary"
                            onClick={() =>
                                downloadParticipantJson(getParticipantSession())
                            }
                        >
                            Download JSON
                        </button>
                    </div>

                    <button
                        className="primary new-participant"
                        onClick={restartSession}
                    >
                        Start another participant
                    </button>
                </section>
            </main>
        );
    }

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
                    <span className="pill">Block {blockIndex + 1} / 3</span>
                    <span className="pill">{condition}</span>
                    <span>{fmt(remaining)} remaining</span>
                </div>
            </header>

            <div className="progress">
                <i
                    style={{
                        width: `${Math.min(100, (seconds / BLOCK_SECONDS) * 100)}%`,
                    }}
                />
            </div>

            <section className="content">
                <div className="heading">
                    <div>
                        <div className="eyebrow">DIGITAL ENCODING</div>
                        <h2>Enter the source record</h2>
                    </div>
                    <b>{accepted} validated</b>
                </div>

                <div className="grid">
                    <section className="panel">
                        <div className="panel-label">SOURCE RECORD</div>
                        <div className="source">
                            {[
                                ["Record Code", current.recordCode],
                                ["Batch Code", current.batchCode],
                                ["Quantity", current.quantity],
                            ].map(([label, value]) => (
                                <div className="source-row" key={label}>
                                    <span>{label}</span>
                                    <strong>{value}</strong>
                                </div>
                            ))}
                        </div>
                        <p className="note">
                            ● Keep this record visible while entering the
                            values.
                        </p>
                    </section>

                    <form className="panel" onSubmit={submit}>
                        <div className="panel-label">ENTRY FIELDS</div>
                        <Field
                            label="Record Code"
                            value={form.recordCode}
                            error={errors.includes("Record Code")}
                            autoFocus
                            onChange={(value) => update("recordCode", value)}
                        />
                        <Field
                            label="Batch Code"
                            value={form.batchCode}
                            error={errors.includes("Batch Code")}
                            onChange={(value) => update("batchCode", value)}
                        />
                        <Field
                            label="Quantity"
                            value={form.quantity}
                            error={errors.includes("Quantity")}
                            inputMode="numeric"
                            onChange={(value) => update("quantity", value)}
                        />

                        {errors.length > 0 && (
                            <div className="error">
                                <b>
                                    Check the highlighted field
                                    {errors.length > 1 ? "s" : ""}.
                                </b>
                                <span>
                                    The record was not accepted. Correct the
                                    values and submit again.
                                </span>
                            </div>
                        )}

                        <button className="primary submit">
                            Submit Record <span>↵</span>
                        </button>
                    </form>
                </div>

                <div className="foot">
                    Block ends automatically when the timer reaches 00:00 ·
                    Fictional study data
                </div>
            </section>
        </main>
    );
}

function SimpleStage(props: {
    eyebrow: string;
    title: string;
    description: string;
    participantId: string;
    children: React.ReactNode;
}) {
    return (
        <main className="app">
            <div className="brand">TUNED IN</div>
            <section className="landing card">
                <div className="eyebrow">{props.eyebrow}</div>
                <h1 className="stage-title">{props.title}</h1>
                <p className="lead">{props.description}</p>
                <div className="participant-line">
                    Participant {props.participantId}
                </div>
                {props.children}
            </section>
            <footer>Local prototype · Fictional records only</footer>
        </main>
    );
}

function Field(props: {
    label: string;
    value: string;
    error?: boolean;
    autoFocus?: boolean;
    inputMode?: "numeric";
    onChange: (value: string) => void;
}) {
    return (
        <label className={props.error ? "field bad" : "field"}>
            <span>{props.label}</span>
            <input
                autoFocus={props.autoFocus}
                value={props.value}
                inputMode={props.inputMode}
                autoComplete="off"
                spellCheck={false}
                aria-invalid={props.error}
                onChange={(e) => props.onChange(e.target.value)}
            />
            {props.error && <small>Does not match the source value.</small>}
        </label>
    );
}

function fmt(totalSeconds: number) {
    const safeSeconds = Math.max(0, Math.floor(totalSeconds));
    return `${String(Math.floor(safeSeconds / 60)).padStart(2, "0")}:${String(
        safeSeconds % 60,
    ).padStart(2, "0")}`;
}
