import {
    useEffect,
    useMemo,
    useRef,
    useState,
    type FormEvent,
    type ReactNode,
} from "react";
import type {
    BlockMeasures,
    Condition,
    MusicCatalogue,
    MusicTrack,
    OrderId,
    SourceRecord,
} from "../../shared/types";
import {
    confirmComfortCheck,
    createSession,
    evaluateAdaptiveMusic,
    exportUrl,
    finishApiBlock,
    getMusicCatalogue,
    sendTaskEvent,
    startApiBlock,
    submitRecord,
} from "./script/api";
import { AudioController } from "./script/audio";
import { EventQueue } from "./script/eventQueue";
import { fmt } from "./script/format";

type Stage =
    | "participant"
    | "baseline"
    | "audio-check"
    | "block-intro"
    | "task"
    | "block-results"
    | "complete";
type FormValues = { recordCode: string; batchCode: string; quantity: string };
const empty: FormValues = { recordCode: "", batchCode: "", quantity: "" };
const orders: Record<OrderId, Condition[]> = {
    A: ["No music", "Static music", "Adaptive music"],
    B: ["Static music", "Adaptive music", "No music"],
    C: ["Adaptive music", "No music", "Static music"],
};
/**
 *  2 minutes = 120
 *  8 minutes = 480
 *
 *  Change duration here.
 */
const PRACTICE_SECONDS = 8;
const BLOCK_SECONDS = 12;

export default function App() {
    const [stage, setStage] = useState<Stage>("participant");
    const [participantId, setParticipantId] = useState(
        () => localStorage.getItem("tunedIn.participantId") ?? "",
    );
    const [orderId, setOrderId] = useState<OrderId>("A");
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [blockIndex, setBlockIndex] = useState(0);
    const [record, setRecord] = useState<SourceRecord | null>(null);
    const [form, setForm] = useState<FormValues>(empty);
    const [errors, setErrors] = useState<string[]>([]);
    const [seconds, setSeconds] = useState(0);
    const [started, setStarted] = useState<number | null>(null);
    const [results, setResults] = useState<BlockMeasures[]>([]);
    const [message, setMessage] = useState("");
    const [musicCatalogue, setMusicCatalogue] = useState<MusicCatalogue>({
        baseline: [],
        reduced: [],
        elevated: [],
    });
    const [audioMessage, setAudioMessage] = useState("");
    const firstKey = useRef(false);
    const completing = useRef(false);
    const queue = useRef<EventQueue | null>(null);
    const audio = useRef(new AudioController());
    const order = orders[orderId];
    const condition = order[blockIndex];
    const duration = stage === "baseline" ? PRACTICE_SECONDS : BLOCK_SECONDS;
    const remaining = useMemo(
        () => Math.max(0, duration - seconds),
        [duration, seconds],
    );

    useEffect(() => {
        if ((stage !== "baseline" && stage !== "task") || started === null)
            return;
        const timer = window.setInterval(() => {
            const elapsed = Math.floor((performance.now() - started) / 1000);
            setSeconds(elapsed);
            if (elapsed >= duration && !completing.current) {
                completing.current = true;
                void finishBlock(duration);
            }
        }, 250);
        return () => window.clearInterval(timer);
    }, [stage, started, duration]);

    // Stop audio if the app is closed or React removes this screen.
    useEffect(() => () => audio.current.stop(), []);

    // Adaptive blocks ask the backend for a new decision every 30 seconds.
    useEffect(() => {
        if (
            stage !== "task" ||
            condition !== "Adaptive music" ||
            !sessionId ||
            started === null
        )
            return;
        const interval = window.setInterval(() => {
            void applyAdaptiveDecision(sessionId, blockIndex + 1);
        }, 30_000);
        return () => window.clearInterval(interval);
    }, [stage, condition, sessionId, started, blockIndex, musicCatalogue]);

    /**
     *  Calls createSession
     */
    async function saveParticipant(event: FormEvent) {
        event.preventDefault();
        const clean = participantId.trim();
        if (!clean) return;
        try {
            const response = await createSession({
                participantId: clean,
                orderId,
                conditionOrder: order,
            });
            setSessionId(response.sessionId);
            queue.current = new EventQueue(response.sessionId);
            void loadMusicCatalogue();
            localStorage.setItem("tunedIn.participantId", clean);
            setParticipantId(clean);
            setStage("baseline");
        } catch (error) {
            setMessage(String(error));
        }
    }

    async function loadMusicCatalogue() {
        try {
            setMusicCatalogue(await getMusicCatalogue());
        } catch {
            // A catalogue failure must never prevent the participant task from running.
            setMusicCatalogue({ baseline: [], reduced: [], elevated: [] });
            setAudioMessage(
                "Music is unavailable. This session will continue silently.",
            );
        }
    }

    function trackById(trackId: string | null): MusicTrack | null {
        if (!trackId) return null;
        return (
            Object.values(musicCatalogue)
                .flat()
                .find((track) => track.id === trackId) ?? null
        );
    }

    async function playTrack(track: MusicTrack | null) {
        const result = await audio.current.play(track);
        if (result.status === "playing") setAudioMessage("");
        else
            setAudioMessage(
                result.status === "silent"
                    ? result.reason
                    : `Audio could not play. The task will continue silently.`,
            );
    }

    async function startMusic(nextCondition: Condition) {
        if (nextCondition === "No music") {
            audio.current.stop();
            setAudioMessage("");
            return;
        }
        const initialTrack =
            nextCondition === "Static music"
                ? (musicCatalogue.baseline[0] ?? null)
                : (musicCatalogue.baseline[0] ??
                  musicCatalogue.reduced[0] ??
                  musicCatalogue.elevated[0] ??
                  null);
        await playTrack(initialTrack);
    }

    async function applyAdaptiveDecision(
        activeSessionId: string,
        number: number,
    ) {
        try {
            const { decision } = await evaluateAdaptiveMusic(
                activeSessionId,
                number,
                performance.now(),
            );
            await playTrack(trackById(decision.selectedTrackId));
        } catch {
            // A rule-engine request must never interrupt data entry or the timer.
            setAudioMessage(
                "Music update was unavailable. The task will continue safely.",
            );
        }
    }

    /**
     *  Starts the block and then starts the condition's safe music behaviour.
     */
    async function beginBlock(number: number, nextCondition: Condition) {
        if (!sessionId) return;
        try {
            const response = await startApiBlock(
                sessionId,
                number,
                nextCondition,
            );
            setRecord(response.record);
            setForm(empty);
            setErrors([]);
            setSeconds(0);
            firstKey.current = false;
            completing.current = false;
            setStarted(performance.now());
            setStage(number === 0 ? "baseline" : "task");
            if (number > 0) await startMusic(nextCondition);
            await queue.current!.send({
                blockNumber: number,
                recordId: response.record.id,
                eventType: "record_presented",
                clientTimeMs: performance.now(),
            });
        } catch (error) {
            setMessage(String(error));
        }
    }

    function startPractice() {
        void beginBlock(0, "No music");
    }
    function startBlock() {
        void beginBlock(blockIndex + 1, condition);
    }

    function update(key: keyof FormValues, value: string) {
        if (!record) return;
        if (!firstKey.current && value.length > form[key].length) {
            firstKey.current = true;
            void queue.current?.send({
                blockNumber: stage === "baseline" ? 0 : blockIndex + 1,
                recordId: record.id,
                eventType: "first_key",
                clientTimeMs: performance.now(),
            });
        }
        setForm((old) => ({ ...old, [key]: value.toUpperCase() }));
        setErrors([]);
    }

    /**
     *  Calls when a record is submitted.
     */
    async function submit(event: FormEvent) {
        event.preventDefault();
        if (!sessionId || !record) return;
        try {
            const number = stage === "baseline" ? 0 : blockIndex + 1;
            const response = await submitRecord(
                sessionId,
                number,
                record.id,
                form,
                performance.now(),
            );
            setErrors(response.incorrectFields);
            if (response.accepted && response.nextRecord) {
                setRecord(response.nextRecord);
                setForm(empty);
                firstKey.current = false;
                await queue.current!.send({
                    blockNumber: number,
                    recordId: response.nextRecord.id,
                    eventType: "record_presented",
                    clientTimeMs: performance.now(),
                });
            }
        } catch (error) {
            setMessage(String(error));
        }
    }

    async function finishBlock(elapsedSeconds: number) {
        if (!sessionId) return;
        try {
            audio.current.stop();
            const number = stage === "baseline" ? 0 : blockIndex + 1;
            const response = await finishApiBlock(
                sessionId,
                number,
                elapsedSeconds,
            );
            if (number === 0) {
                setStarted(null);
                setStage("audio-check");
                return;
            }
            setResults((old) => [
                ...old.filter((item) => item.block !== number),
                response.measures,
            ]);
            setStarted(null);
            setStage("block-results");
        } catch (error) {
            setMessage(String(error));
        }
    }

    /**
     *  When audio check is confirmed.
     */
    async function continueFromAudioCheck() {
        if (!sessionId) return;
        try {
            audio.current.stop();
            await confirmComfortCheck(sessionId);
            setStage("block-intro");
        } catch (error) {
            setMessage(String(error));
        }
    }
    function nextBlock() {
        if (blockIndex === 2) setStage("complete");
        else {
            setBlockIndex((old) => old + 1);
            setStage("block-intro");
        }
    }
    function restart() {
        audio.current.stop();
        setStage("participant");
        setSessionId(null);
        setBlockIndex(0);
        setRecord(null);
        setForm(empty);
        setResults([]);
        setMessage("");
        setAudioMessage("");
    }
    const result = results.find((item) => item.block === blockIndex + 1);

    /**
     *  First Stage: Participant
     *      * Saves the participant ID, creates a session.
     */
    if (stage === "participant")
        return (
            <SimpleStage
                eyebrow="SESSION SETUP"
                title="Participant setup."
                description="Enter the participant ID before beginning."
                participantId=""
            >
                <form onSubmit={saveParticipant}>
                    <Field
                        label="Participant ID"
                        value={participantId}
                        autoFocus
                        onChange={setParticipantId}
                    />
                    <label className="field">
                        <span>Counterbalanced condition order</span>
                        <select
                            value={orderId}
                            onChange={(event) =>
                                setOrderId(event.target.value as OrderId)
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
                            <li>Silent baseline practice</li>
                            <li>Audio-comfort check</li>
                            <li>Three timed encoding blocks</li>
                        </ol>
                    </div>
                    <button className="primary large">
                        Save participant & continue <span>→</span>
                    </button>
                </form>
                {message && <p className="error">{message}</p>}
            </SimpleStage>
        );

    /**
     *  Third Stage: audio check.
     *      * Checks if the audio is heard, and volume is comfortable.
     */
    if (stage === "audio-check")
        return (
            <SimpleStage
                eyebrow="AUDIO-COMFORT CHECK"
                title="Check the playback level"
                description="Confirm that headphones are comfortable before the timed blocks."
                participantId={participantId}
            >
                <div className="instructions">
                    <b>Researcher / participant check</b>
                    <ul>
                        <li>Confirm the headphones fit comfortably.</li>
                        <li>
                            If test audio is provided separately, adjust the
                            device to a comfortable level.
                        </li>
                        <li>
                            Do not change that device level during the blocks.
                        </li>
                    </ul>
                </div>
                <div className="test-banner">
                    {musicCatalogue.baseline.length
                        ? "Use the test button to check the first baseline track."
                        : "No test track was found. The session can still continue silently."}
                </div>
                {musicCatalogue.baseline.length > 0 && (
                    <button
                        className="secondary"
                        onClick={() =>
                            void playTrack(musicCatalogue.baseline[0])
                        }
                    >
                        Play test audio
                    </button>
                )}
                {audioMessage && <p className="error">{audioMessage}</p>}
                <button
                    className="primary large"
                    onClick={() => void continueFromAudioCheck()}
                >
                    Audio level is comfortable <span>→</span>
                </button>
            </SimpleStage>
        );

    /**
     *  Second Stage: Practice
     *      * Begins practice typing.
     */
    if (stage === "baseline" && started === null)
        return (
            <SimpleStage
                eyebrow="SILENT BASELINE"
                title="Practice encoding task"
                description="Complete a short silent practice task before the experimental blocks begin."
                participantId={participantId}
            >
                <div className="instructions">
                    <b>Practice instructions</b>
                    <ul>
                        <li>
                            Copy the source values into the matching fields.
                        </li>
                        <li>
                            Use <kbd>Tab</kbd> between fields and{" "}
                            <kbd>Enter</kbd> to submit.
                        </li>
                        <li>Incorrect records must be corrected.</li>
                    </ul>
                </div>
                <div className="timer-card">
                    <span>Practice duration</span>
                    <strong>{fmt(PRACTICE_SECONDS)}</strong>
                </div>
                <button className="primary large" onClick={startPractice}>
                    Start practice <span>→</span>
                </button>
            </SimpleStage>
        );

    /**
     *  Stage: Block introduction.
     *      * Tells which block is next.
     */
    if (stage === "block-intro")
        return (
            <SimpleStage
                eyebrow={`BLOCK ${blockIndex + 1} OF 3`}
                title={condition}
                description="Continue entering records until the timer ends."
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
                        <span>Current duration</span>
                        <b>{fmt(BLOCK_SECONDS)}</b>
                    </div>
                </div>
                <button className="primary large" onClick={startBlock}>
                    Start Block {blockIndex + 1} <span>→</span>
                </button>
            </SimpleStage>
        );

    /**
     *  Stage: Block results
     *      * Shows the results of the current block.
     */
    if (stage === "block-results" && result)
        return (
            <SimpleStage
                eyebrow={`BLOCK ${result.block} COMPLETE`}
                title="Block results"
                description="Processed task measures for the completed block."
                participantId={participantId}
            >
                <div className="block-results-grid">
                    <Result label="Condition" value={result.condition} />
                    <Result
                        label="Validated records"
                        value={String(result.validatedRecords)}
                    />
                    <Result
                        label="Throughput"
                        value={result.validatedRecordThroughput.toFixed(2)}
                    />
                    <Result
                        label="Median IL"
                        value={
                            result.medianInitiationLatencyMs === null
                                ? "—"
                                : `${Math.round(result.medianInitiationLatencyMs)} ms`
                        }
                    />
                    <Result
                        label="Median FPED"
                        value={
                            result.medianFirstPassEntryDurationMs === null
                                ? "—"
                                : `${Math.round(result.medianFirstPassEntryDurationMs)} ms`
                        }
                    />
                    <Result
                        label="First-pass error"
                        value={
                            result.firstPassRecordErrorRate === null
                                ? "—"
                                : `${(result.firstPassRecordErrorRate * 100).toFixed(1)}%`
                        }
                    />
                    <Result
                        label="Median TTSV"
                        value={
                            result.medianTimeToSuccessfulValidationMs === null
                                ? "—"
                                : `${Math.round(result.medianTimeToSuccessfulValidationMs)} ms`
                        }
                    />
                </div>
                <button className="primary large" onClick={nextBlock}>
                    {blockIndex === 2
                        ? "Finish participant"
                        : `Continue to Block ${blockIndex + 2}`}{" "}
                    <span>→</span>
                </button>
            </SimpleStage>
        );

    if (stage === "complete")
        return (
            <SimpleStage
                eyebrow="THREE BLOCKS COMPLETE"
                title="Encoding session finished."
                description={`Participant ${participantId} has completed all three conditions.`}
                participantId={participantId}
            >
                <div className="download-actions">
                    {sessionId && (
                        <>
                            <a
                                className="primary"
                                href={exportUrl(sessionId, "blocks.csv")}
                            >
                                Download block CSV
                            </a>
                            <a
                                className="secondary"
                                href={exportUrl(sessionId, "records.csv")}
                            >
                                Download record CSV
                            </a>
                        </>
                    )}
                </div>
                <button className="primary new-participant" onClick={restart}>
                    Start another participant
                </button>
            </SimpleStage>
        );

    /**
     *  Actual block.
     */
    const isPractice = stage === "baseline";
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
                        {isPractice
                            ? "Practice"
                            : `Block ${blockIndex + 1} / 3`}
                    </span>
                    <span className="pill">
                        {isPractice ? "No music" : condition}
                    </span>
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
                            {isPractice
                                ? "PRACTICE ENCODING"
                                : "DIGITAL ENCODING"}
                        </div>
                        <h2>Enter the source record</h2>
                    </div>
                </div>
                {record && (
                    <div className="grid">
                        <section className="panel">
                            <div className="panel-label">SOURCE RECORD</div>
                            <Source record={record} />
                        </section>
                        <form className="panel" onSubmit={submit}>
                            <div className="panel-label">ENTRY FIELDS</div>
                            <Field
                                label="Record Code"
                                value={form.recordCode}
                                error={errors.includes("recordCode")}
                                autoFocus
                                onChange={(value) =>
                                    update("recordCode", value)
                                }
                            />
                            <Field
                                label="Batch Code"
                                value={form.batchCode}
                                error={errors.includes("batchCode")}
                                onChange={(value) => update("batchCode", value)}
                            />
                            <Field
                                label="Quantity"
                                value={form.quantity}
                                error={errors.includes("quantity")}
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
                                        Correct the values and submit again.
                                    </span>
                                </div>
                            )}
                            <button className="primary submit">
                                Submit Record <span>↵</span>
                            </button>
                        </form>
                    </div>
                )}
                {audioMessage && !isPractice && (
                    <p className="error">{audioMessage}</p>
                )}
            </section>
        </main>
    );
}

function Source({ record }: { record: SourceRecord }) {
    return (
        <div className="source">
            {[
                ["Record Code", record.recordCode],
                ["Batch Code", record.batchCode],
                ["Quantity", record.quantity],
            ].map(([label, value]) => (
                <div className="source-row" key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                </div>
            ))}
        </div>
    );
}
function Result({ label, value }: { label: string; value: string }) {
    return (
        <div className="result-card">
            <span>{label}</span>
            <strong>{value}</strong>
        </div>
    );
}
function SimpleStage(props: {
    eyebrow: string;
    title: string;
    description: string;
    participantId: string;
    children: ReactNode;
}) {
    return (
        <main className="app">
            <div className="brand">TUNED IN</div>
            <section className="landing card">
                <div className="eyebrow">{props.eyebrow}</div>
                <h1 className="stage-title">{props.title}</h1>
                <p className="lead">{props.description}</p>
                {props.participantId && (
                    <div className="participant-line">
                        Participant {props.participantId}
                    </div>
                )}
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
                onChange={(event) => props.onChange(event.target.value)}
            />
            {props.error && <small>Does not match the source value.</small>}
        </label>
    );
}
