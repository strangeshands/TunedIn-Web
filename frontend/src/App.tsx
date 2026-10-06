import {
    useEffect,
    useMemo,
    useRef,
    useState,
    type FormEvent,
    type ReactNode,
    type RefObject,
} from "react";
import type {
    BlockMeasures,
    Condition,
    MusicCatalogue,
    MusicTrack,
    OrderId,
    SourceRecord,
    StudyMode,
    StudyTiming,
} from "../../shared/types";
import {
    confirmComfortCheck,
    createSession,
    evaluateAdaptiveMusic,
    exportUrl,
    finishApiBlock,
    getMusicCatalogue,
    getNextMusicTrack,
    getPlaybackConfig,
    getStudySetup,
    recordMusicTransition,
    sendTaskEvent,
    startApiBlock,
    submitRecord,
} from "./script/api";
import { AudioController } from "./script/audio";
import { EventQueue } from "./script/eventQueue";
import { fmt } from "./script/format";

type Stage =
    | "participant"
    | "practice"
    | "baseline-intro"
    | "baseline"
    | "calibration-results"
    | "audio-check"
    | "block-intro"
    | "task"
    | "saving"
    | "block-results"
    | "handover"
    | "complete";
type FormValues = { recordCode: string; batchCode: string; quantity: string };
const empty: FormValues = { recordCode: "", batchCode: "", quantity: "" };

const fallbackTiming: StudyTiming = {
    practiceSeconds: 60 * 2,
    baselineSeconds: 60 * 2,
    blockSeconds: 60 * 8,
};

export default function App() {
    const [stage, setStage] = useState<Stage>("participant");
    const [participantId, setParticipantId] = useState(
        () => localStorage.getItem("tunedIn.participantId") ?? "",
    );
    const [orderId, setOrderId] = useState<OrderId>("A");
    const [orders, setOrders] = useState<Record<OrderId, Condition[]>>({});
    const [studyMode, setStudyMode] = useState<StudyMode>("Pilot");
    const [formativeOrder, setFormativeOrder] = useState<Condition[]>([]);
    const [configuredTiming, setConfiguredTiming] =
        useState<StudyTiming>(fallbackTiming);
    const [formativeTiming, setFormativeTiming] =
        useState<StudyTiming>(fallbackTiming);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [blockIndex, setBlockIndex] = useState(0);
    const [record, setRecord] = useState<SourceRecord | null>(null);
    const [form, setForm] = useState<FormValues>(empty);
    const [errors, setErrors] = useState<string[]>([]);
    const [seconds, setSeconds] = useState(0);
    const [started, setStarted] = useState<number | null>(null);
    const [results, setResults] = useState<BlockMeasures[]>([]);
    const [calibration, setCalibration] = useState<BlockMeasures | null>(null);
    const [message, setMessage] = useState("");
    const [musicCatalogue, setMusicCatalogue] = useState<MusicCatalogue>({
        baseline: [],
        reduced: [],
        elevated: [],
    });
    const [audioMessage, setAudioMessage] = useState("");
    const [savingMessage, setSavingMessage] = useState("");
    const firstKey = useRef(false);
    const recordCodeInput = useRef<HTMLInputElement | null>(null);
    const completing = useRef(false);
    const endingDuration = useRef<number | null>(null);
    const endingBlockNumber = useRef<number | null>(null);
    const pendingSubmissions = useRef(new Set<Promise<unknown>>());
    const submitting = useRef(false);
    const queue = useRef<EventQueue | null>(null);
    const audio = useRef(new AudioController());
    const musicCatalogueRef = useRef(musicCatalogue);
    const playbackBlock = useRef<{
        sessionId: string;
        blockNumber: number;
    } | null>(null);
    const conditionOrder =
        studyMode === "Formative" ? formativeOrder : (orders[orderId] ?? []);
    const condition = conditionOrder[blockIndex] ?? "No music";
    const timing =
        studyMode === "Formative" ? formativeTiming : configuredTiming;
    const duration =
        stage === "practice"
            ? timing.practiceSeconds
            : stage === "baseline"
              ? timing.baselineSeconds
              : timing.blockSeconds;
    const remaining = useMemo(
        () => Math.max(0, duration - seconds),
        [duration, seconds],
    );

    useEffect(() => {
        if (
            (stage !== "practice" &&
                stage !== "baseline" &&
                stage !== "task") ||
            started === null
        )
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

    useEffect(() => {
        musicCatalogueRef.current = musicCatalogue;
    }, [musicCatalogue]);

    useEffect(() => {
        audio.current.onTrackEnded((currentTrackId) => {
            const activeBlock = playbackBlock.current;
            if (activeBlock)
                void continueAfterTrackEnd(
                    activeBlock.sessionId,
                    activeBlock.blockNumber,
                    currentTrackId,
                );
        });
        return () => audio.current.onTrackEnded(null);
    }, []);

    useEffect(() => {
        void getStudySetup()
            .then(({ conditionOrders, formativeConditionOrder, timing }) => {
                const firstOrderId = Object.keys(conditionOrders)[0] ?? "";
                setOrders(conditionOrders);
                setFormativeOrder(formativeConditionOrder);
                setConfiguredTiming(timing);
                setFormativeTiming(timing);
                setOrderId((current) =>
                    conditionOrders[current] ? current : firstOrderId,
                );
            })
            .catch(() =>
                setMessage("Could not load the configured study setup."),
            );
    }, []);

    // The first 60 seconds establish the initial rolling window. After that,
    // the backend evaluates the rule every 30 seconds.
    useEffect(() => {
        if (
            stage !== "task" ||
            condition !== "Adaptive music" ||
            !sessionId ||
            started === null
        )
            return;
        let interval: number | null = null;
        const firstEvaluation = window.setTimeout(() => {
            void applyAdaptiveDecision(sessionId, blockIndex + 2);
            interval = window.setInterval(() => {
                void applyAdaptiveDecision(sessionId, blockIndex + 2);
            }, 30_000);
        }, Math.max(0, started + 60_000 - performance.now()));
        return () => {
            window.clearTimeout(firstEvaluation);
            if (interval !== null) window.clearInterval(interval);
        };
    }, [stage, condition, sessionId, started, blockIndex, musicCatalogue]);

    /**
     *  Calls createSession
     */
    async function saveParticipant(event: FormEvent) {
        event.preventDefault();
        const clean = participantId.trim();
        if (!clean || !conditionOrder.length) return;
        try {
            const response = await createSession({
                participantId: clean,
                studyMode,
                orderId: studyMode === "Formative" ? "formative" : orderId,
                conditionOrder,
                timing,
            });
            setSessionId(response.sessionId);
            queue.current = new EventQueue(response.sessionId);
            await Promise.all([loadMusicCatalogue(), loadPlaybackConfig()]);
            localStorage.setItem("tunedIn.participantId", clean);
            setParticipantId(clean);
            setStage("practice");
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

    async function loadPlaybackConfig() {
        try {
            audio.current.configure(await getPlaybackConfig());
        } catch {
            // The safe defaults keep playback usable when only the catalogue is available.
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
        return result;
    }

    async function startMusic(
        nextCondition: Condition,
        initialTrackId: string | null,
        number: number,
    ) {
        if (nextCondition === "No music") {
            playbackBlock.current = null;
            audio.current.stop();
            setAudioMessage("");
            return;
        }
        if (sessionId)
            playbackBlock.current = { sessionId, blockNumber: number };
        await playTrack(trackById(initialTrackId));
    }

    async function continueAfterTrackEnd(
        activeSessionId: string,
        number: number,
        currentTrackId: string,
    ) {
        try {
            const { trackId } = await getNextMusicTrack(
                activeSessionId,
                number,
                currentTrackId,
            );
            // Ignore a late reply if an adaptive decision already changed track.
            if (audio.current.currentTrackId() !== currentTrackId) return;
            await playTrack(
                trackId
                    ? (Object.values(musicCatalogueRef.current)
                          .flat()
                          .find((track) => track.id === trackId) ?? null)
                    : null,
            );
        } catch {
            setAudioMessage("The next music track could not be loaded.");
        }
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
            if (
                completing.current ||
                playbackBlock.current?.sessionId !== activeSessionId ||
                playbackBlock.current?.blockNumber !== number
            )
                return;
            // The backend retains the active track while the selected state is
            // unchanged. Do not restart audio or create a transition row.
            if (decision.previousTrackId === decision.selectedTrackId) return;
            const startedMs = performance.now();
            const playback = await playTrack(
                trackById(decision.selectedTrackId),
            );
            // A playing result resolves after the crossfade, so the exported
            // completion timestamp describes the end of the transition.
            const completedMs =
                playback.status === "playing"
                    ? await playback.transitionCompleted
                    : performance.now();
            await recordMusicTransition(activeSessionId, number, {
                decisionId: decision.id,
                startedMs,
                completedMs,
                outcome: playback.status,
                error: playback.status === "playing" ? null : playback.reason,
            });
        } catch {
            // A rule-engine request must never interrupt data entry or the timer.
            setAudioMessage(
                "Music update was unavailable. The task will continue safely.",
            );
        }
    }

    /**
     *  Attempts initial music before exposing the first record and starting timing.
     */
    async function beginBlock(number: number, nextCondition: Condition) {
        if (!sessionId) return;
        setMessage("");
        try {
            const response = await startApiBlock(
                sessionId,
                number,
                nextCondition,
            );
            if (number > 0)
                await startMusic(
                    nextCondition,
                    response.initialMusicTrackId,
                    number,
                );
            const taskStarted = performance.now();
            setRecord(response.record);
            setForm(empty);
            setErrors([]);
            setSeconds(0);
            firstKey.current = false;
            completing.current = false;
            setStarted(taskStarted);
            setStage(
                number === 0 ? "practice" : number === 1 ? "baseline" : "task",
            );
            await queue.current!.send({
                blockNumber: number,
                recordId: response.record.id,
                eventType: "record_presented",
                clientTimeMs: taskStarted,
            });
        } catch (error) {
            setMessage(String(error));
        }
    }

    function startPractice() {
        void beginBlock(0, "No music");
    }
    function startBaselineCalibration() {
        void beginBlock(1, "No music");
    }
    function startBlock() {
        void beginBlock(blockIndex + 2, condition);
    }

    function update(key: keyof FormValues, value: string) {
        if (!record) return;
        if (!firstKey.current && value.length > form[key].length) {
            firstKey.current = true;
            void queue.current?.send({
                blockNumber:
                    stage === "practice"
                        ? 0
                        : stage === "baseline"
                          ? 1
                          : blockIndex + 2,
                recordId: record.id,
                eventType: "first_key",
                clientTimeMs: performance.now(),
            });
        }
        setForm((old) => ({ ...old, [key]: value.toUpperCase() }));
        setErrors([]);
    }

    function updateFormativeTiming(key: keyof StudyTiming, value: string) {
        const seconds = Number(value);
        if (!Number.isFinite(seconds) || seconds <= 0) return;
        setFormativeTiming((current) => ({
            ...current,
            [key]: seconds,
        }));
    }

    /**
     *  Calls when a record is submitted.
     */
    async function submit(event: FormEvent) {
        event.preventDefault();
        if (!sessionId || !record || submitting.current || completing.current)
            return;
        submitting.current = true;
        setMessage("");
        try {
            const number =
                stage === "practice"
                    ? 0
                    : stage === "baseline"
                      ? 1
                      : blockIndex + 2;
            const submittedAt = performance.now();
            // send() retains failed events but swallows delivery errors. Validation
            // depends on the presentation being saved, so retry/await the queue
            // first and include that wait in the activity block completion awaits.
            const submission = queue.current!.flush().then(() =>
                submitRecord(sessionId, number, record.id, form, submittedAt),
            );
            pendingSubmissions.current.add(submission);
            const response = await submission.finally(() =>
                pendingSubmissions.current.delete(submission),
            );
            setErrors(response.incorrectFields);
            if (
                response.accepted &&
                response.nextRecord &&
                !completing.current
            ) {
                setRecord(response.nextRecord);
                setForm(empty);
                firstKey.current = false;
                requestAnimationFrame(() => recordCodeInput.current?.focus());
                await queue.current!.send({
                    blockNumber: number,
                    recordId: response.nextRecord.id,
                    eventType: "record_presented",
                    clientTimeMs: performance.now(),
                });
            }
        } catch (error) {
            setMessage(
                `Could not save this record. Check the backend connection and submit again. ${String(error)}`,
            );
        } finally {
            submitting.current = false;
        }
    }

    async function finishBlock(elapsedSeconds: number) {
        if (!sessionId) return;
        try {
            const number =
                endingBlockNumber.current ??
                (stage === "practice"
                    ? 0
                    : stage === "baseline"
                      ? 1
                      : blockIndex + 2);
            endingDuration.current = elapsedSeconds;
            endingBlockNumber.current = number;
            setStarted(null);
            setStage("saving");
            setSavingMessage("Saving task events…");
            playbackBlock.current = null;
            audio.current.stop();
            await Promise.all([...pendingSubmissions.current]);
            await queue.current?.flush();
            setSavingMessage("Events saved. Calculating block results…");
            const response = await finishApiBlock(
                sessionId,
                number,
                elapsedSeconds,
            );
            if (number === 0) {
                endingBlockNumber.current = null;
                setStarted(null);
                setStage("baseline-intro");
                return;
            }
            if (number === 1) {
                endingBlockNumber.current = null;
                setCalibration(response.measures);
                setStarted(null);
                setStage("calibration-results");
                return;
            }
            setResults((old) => [
                ...old.filter((item) => item.block !== number),
                response.measures,
            ]);
            endingBlockNumber.current = null;
            setStarted(null);
            setStage("block-results");
        } catch (error) {
            setSavingMessage(
                "Some task events could not be saved. Check the backend connection, then retry.",
            );
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
        if (blockIndex === conditionOrder.length - 1) setStage("handover");
        else {
            setBlockIndex((old) => old + 1);
            setStage("block-intro");
        }
    }
    function retrySavingEvents() {
        if (endingDuration.current !== null)
            void finishBlock(endingDuration.current);
    }
    function restart() {
        playbackBlock.current = null;
        audio.current.stop();
        setStage("participant");
        setSessionId(null);
        setBlockIndex(0);
        setRecord(null);
        setForm(empty);
        setResults([]);
        setCalibration(null);
        setMessage("");
        setAudioMessage("");
        setSavingMessage("");
        endingDuration.current = null;
        endingBlockNumber.current = null;
    }
    const result = results.find((item) => item.block === blockIndex + 2);

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
                        <span>Mode</span>
                        <select
                            value={studyMode}
                            onChange={(event) =>
                                setStudyMode(event.target.value as StudyMode)
                            }
                        >
                            <option value="Pilot">Pilot</option>
                            <option value="Main">Main</option>
                            <option value="Formative">Formative Testing</option>
                        </select>
                    </label>
                    {studyMode === "Formative" ? (
                        <div className="instructions">
                            <b>Formative Testing</b>
                            <p>
                                This session will run one Adaptive Music block.
                            </p>
                            <label className="field">
                                <span>Practice duration (seconds)</span>
                                <input
                                    type="number"
                                    min="1"
                                    value={formativeTiming.practiceSeconds}
                                    onChange={(event) =>
                                        updateFormativeTiming(
                                            "practiceSeconds",
                                            event.target.value,
                                        )
                                    }
                                />
                            </label>
                            <label className="field">
                                <span>Baseline duration (seconds)</span>
                                <input
                                    type="number"
                                    min="1"
                                    value={formativeTiming.baselineSeconds}
                                    onChange={(event) =>
                                        updateFormativeTiming(
                                            "baselineSeconds",
                                            event.target.value,
                                        )
                                    }
                                />
                            </label>
                            <label className="field">
                                <span>Adaptive block duration (seconds)</span>
                                <input
                                    type="number"
                                    min="1"
                                    value={formativeTiming.blockSeconds}
                                    onChange={(event) =>
                                        updateFormativeTiming(
                                            "blockSeconds",
                                            event.target.value,
                                        )
                                    }
                                />
                            </label>
                        </div>
                    ) : (
                    <label className="field">
                        <span>Counterbalanced Condition Order</span>
                        <select
                            value={orderId}
                            onChange={(event) =>
                                setOrderId(event.target.value as OrderId)
                            }
                        >
                            {Object.entries(orders).map(([id, conditions]) => (
                                <option key={id} value={id}>
                                    {id}: {conditions.join(" → ")}
                                </option>
                            ))}
                        </select>
                    </label>
                    )}
                    <div className="instructions">
                        <b>Experiment Sequence</b>
                        <ol>
                            <li>Practice task</li>
                            <li>Silent baseline calibration</li>
                            <li>Audio-comfort check</li>
                            <li>{conditionOrder.length} timed encoding block{conditionOrder.length === 1 ? "" : "s"}</li>
                        </ol>
                    </div>
                    <button className="primary large" disabled={!conditionOrder.length}>
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

    if (stage === "saving")
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

    /**
     *  Second Stage: Practice
     *      * Begins practice typing.
     */
    if (stage === "practice" && started === null)
        return (
            <SimpleStage
                eyebrow="PRACTICE"
                title="Practice encoding task"
                description="Learn the task mechanics. The researcher may clarify instructions during this stage."
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
                    <strong>{fmt(timing.practiceSeconds)}</strong>
                </div>
                <button className="primary large" onClick={startPractice}>
                    Start practice <span>→</span>
                </button>
            </SimpleStage>
        );

    if (stage === "baseline-intro")
        return (
            <SimpleStage
                eyebrow="SILENT BASELINE"
                title="Baseline calibration"
                description="Complete the same task without music. These results become your personal adaptive-music reference."
                participantId={participantId}
            >
                <div className="timer-card">
                    <span>Calibration duration</span>
                    <strong>{fmt(timing.baselineSeconds)}</strong>
                </div>
                <button
                    className="primary large"
                    onClick={startBaselineCalibration}
                >
                    Start silent calibration <span>→</span>
                </button>
            </SimpleStage>
        );

    if (stage === "calibration-results" && calibration)
        return (
            <SimpleStage
                eyebrow="SILENT BASELINE COMPLETE"
                title="Calibration results"
                description="These personal reference values will be used only by the Adaptive Music rule engine."
                participantId={participantId}
            >
                <div className="block-results-grid">
                    <Result
                        label="Median IL"
                        value={
                            calibration.medianInitiationLatencyMs === null
                                ? "—"
                                : `${(calibration.medianInitiationLatencyMs / 1000).toFixed(2)} s`
                        }
                    />
                    <Result
                        label="Median FPED"
                        value={
                            calibration.medianFirstPassEntryDurationMs === null
                                ? "—"
                                : `${(calibration.medianFirstPassEntryDurationMs / 1000).toFixed(2)} s`
                        }
                    />
                    <Result
                        label="First-pass error"
                        value={
                            calibration.firstPassRecordErrorRate === null
                                ? "—"
                                : `${(calibration.firstPassRecordErrorRate * 100).toFixed(1)}%`
                        }
                    />
                    <Result
                        label="Validated records"
                        value={String(calibration.validatedRecords)}
                    />
                </div>
                <button
                    className="primary large"
                    onClick={() => setStage("audio-check")}
                >
                    Continue to audio check <span>→</span>
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
                eyebrow={`BLOCK ${blockIndex + 1} OF ${conditionOrder.length}`}
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
                        <b>{fmt(timing.blockSeconds)}</b>
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
                eyebrow={`BLOCK ${blockIndex + 1} COMPLETE`}
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
                                : `${Math.round(result.medianInitiationLatencyMs / 1000).toFixed(2)} s`
                        }
                    />
                    <Result
                        label="Median FPED"
                        value={
                            result.medianFirstPassEntryDurationMs === null
                                ? "—"
                                : `${Math.round(result.medianFirstPassEntryDurationMs / 1000).toFixed(2)} s`
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
                                : `${Math.round(result.medianTimeToSuccessfulValidationMs / 1000).toFixed(2)} s`
                        }
                    />
                </div>
                <button className="primary large" onClick={nextBlock}>
                    {blockIndex === conditionOrder.length - 1
                        ? "Finish participant"
                        : `Continue to Block ${blockIndex + 2}`}{" "}
                    <span>→</span>
                </button>
            </SimpleStage>
        );

    if (stage === "complete")
        return (
            <SimpleStage
                eyebrow="EXPERIMENTAL BLOCKS COMPLETE"
                title="Encoding session finished."
                description={`Participant ${participantId} has completed all ${conditionOrder.length} configured conditions.`}
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
                <button className="primary large" onClick={restart}>
                    Start another participant
                </button>
            </SimpleStage>
        );

    if (stage === "handover")
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

    /**
     *  Actual block.
     */
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
                            {stage === "baseline"
                                ? "SILENT CALIBRATION"
                                : isPractice
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
                                inputRef={recordCodeInput}
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
                {message && <p className="error" role="alert">{message}</p>}
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
            <footer>
                Version 1: First Iteration of Formative User Feedback
            </footer>
        </main>
    );
}
function Field(props: {
    label: string;
    value: string;
    error?: boolean;
    autoFocus?: boolean;
    inputMode?: "numeric";
    inputRef?: RefObject<HTMLInputElement | null>;
    onChange: (value: string) => void;
}) {
    return (
        <label className={props.error ? "field bad" : "field"}>
            <span>{props.label}</span>
            <input
                ref={props.inputRef}
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
