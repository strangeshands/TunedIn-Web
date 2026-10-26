import {
    useEffect,
    useMemo,
    useRef,
    useState,
    type FormEvent,
} from "react";
import type {
    BaselineConfig, BaselineSettings,
    Condition,
    OrderId,
    SourceRecord,
    StudyMode,
    StudyTiming
} from "../../../../shared/types";
import {
    confirmComfortCheck,
    createSession,
    endRecoveredSession,
    finishApiBlock,
    getStudySetup,
    recoverSession,
    restartRecoveredBlock,
    startApiBlock,
} from "../../script/api";
import { EventQueue } from "../../script/eventQueue";
import type { FormValues, Stage, SubmissionFeedback } from "../types";
import { useBlockTimers } from "./useBlockTimers";
import { useStudyAudio } from "./useStudyAudio";
import { useStudyNavigation } from "./useStudyNavigation";

const empty: FormValues = { recordCode: "", batchCode: "", quantity: "" };
const activeSessionStorageKey = "tunedIn.activeSessionId";

const fallbackTiming: StudyTiming = {
    practiceSeconds: 60 * 2,
    baselineSeconds: 60 * 2,
    blockSeconds: 60 * 8,
};

// Coordinates session changes and preserves event/submission ordering. Rendering,
// navigation, timers, and audio lifecycles are handled by separate modules.
export function useStudyController() {
    const [baselineOptions, setBaselineOptions] = useState<BaselineConfig>({ defaultMode: "records", enabledModes: ["records", "timed"], recordTarget: 15 });
    const [sessionBaseline, setSessionBaseline] = useState<BaselineSettings | null>(null);
    const [baselineCompletedRecords, setBaselineCompletedRecords] = useState(0);
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
    const [restSeconds, setRestSeconds] = useState(120);
    const [restRemaining, setRestRemaining] = useState(120);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [sessionConditionOrder, setSessionConditionOrder] = useState<
        Condition[] | null
    >(null);
    const [recoveryActiveBlock, setRecoveryActiveBlock] = useState<
        number | null
    >(null);
    const [blockIndex, setBlockIndex] = useState(0);
    const [record, setRecord] = useState<SourceRecord | null>(null);
    const [form, setForm] = useState<FormValues>(empty);
    const [errors, setErrors] = useState<string[]>([]);
    const [streak, setStreak] = useState(0);
    const [blockHighestStreak, setBlockHighestStreak] = useState(0);
    const [submissionFeedback, setSubmissionFeedback] =
        useState<SubmissionFeedback>(null);
    const [seconds, setSeconds] = useState(0);
    const [started, setStarted] = useState<number | null>(null);
    const [message, setMessage] = useState("");
    const [savingMessage, setSavingMessage] = useState("");
    const [introductionStep, setIntroductionStep] = useState(0);
    const [shortcutMessage, setShortcutMessage] = useState("");
    const firstKey = useRef(false);
    const recordWasRejected = useRef(false);
    const feedbackTimer = useRef<number | null>(null);
    const recordCodeInput = useRef<HTMLInputElement | null>(null);
    const introPracticeForm = useRef<HTMLFormElement | null>(null);
    const introRecordCodeInput = useRef<HTMLInputElement | null>(null);
    const completing = useRef(false);
    const restTransitioning = useRef(false);
    const endingDuration = useRef<number | null>(null);
    const endingBlockNumber = useRef<number | null>(null);
    const pendingSubmissions = useRef(new Set<Promise<unknown>>());
    const submitting = useRef(false);
    const queue = useRef<EventQueue | null>(null);
    const activeAttemptId = useRef<string>("");
    const conditionOrder =
        sessionConditionOrder ??
        (studyMode === "Formative" ? formativeOrder : (orders[orderId] ?? []));
    const condition = conditionOrder[blockIndex] ?? "No music";
    const timing =
        studyMode === "Formative" ? formativeTiming : configuredTiming;
    const baseline = sessionBaseline ?? { mode: baselineOptions.defaultMode, recordTarget: baselineOptions.recordTarget };
    const recordBasedBaseline = stage === "baseline" && baseline.mode === "records";
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

    const { navigationLocked, lockNavigation, unlockNavigation, goBack } =
        useStudyNavigation(stage, introductionStep, setStage, setIntroductionStep);
    const { musicCatalogue, audio, playbackBlock, audioMessage, setAudioMessage, audioVolume,
        setAudioVolume, testAudioPlaying, setTestAudioPlaying, loadMusicCatalogue,
        loadPlaybackConfig, toggleTestAudio, startMusic } = useStudyAudio({
            sessionId, stage, condition, started, blockIndex, completing,
        });
    useBlockTimers({
        stage, started, duration, recordBasedBaseline, completing, setSeconds, finishBlock,
        blockIndex, conditionCount: conditionOrder.length, restSeconds,
        setRestRemaining, continueFromRest
    });

    function clearSubmissionFeedback() {
        if (feedbackTimer.current !== null) {
            window.clearTimeout(feedbackTimer.current);
            feedbackTimer.current = null;
        }
        setSubmissionFeedback(null);
    }

    function showSubmissionFeedback(value: Exclude<SubmissionFeedback, null>) {
        clearSubmissionFeedback();
        setSubmissionFeedback(value);
        feedbackTimer.current = window.setTimeout(() => {
            setSubmissionFeedback(null);
            feedbackTimer.current = null;
        }, value === "correct" ? 1_200 : 900);
    }

    useEffect(() => {
        void getStudySetup()
            .then(
                ({
                    conditionOrders,
                    formativeConditionOrder,
                    timing,
                    restSeconds,
                    baseline: baselineSetup,
                }) => {
                    const firstOrderId = Object.keys(conditionOrders)[0] ?? "";
                    setOrders(conditionOrders);
                    setFormativeOrder(formativeConditionOrder);
                    setConfiguredTiming(timing);
                    setFormativeTiming(timing);
                    setRestSeconds(restSeconds);
                    setBaselineOptions(baselineSetup);
                    setOrderId((current) =>
                        conditionOrders[current] ? current : firstOrderId,
                    );
                },
            )
            .catch(() =>
                setMessage("Could not load the configured study setup."),
            );
    }, []);

    // Each introduction page begins at its heading. The keyboard demo is lower
    // on page two, so it should never be the first content a participant sees.
    useEffect(() => {
        if (stage !== "introduction") return;
        const frame = requestAnimationFrame(() => window.scrollTo(0, 0));
        return () => cancelAnimationFrame(frame);
    }, [stage, introductionStep]);

    function createEventQueue(id: string) {
        return new EventQueue(id, error => setMessage(
            `Some task data have not been saved. Keep this tab open and check browser storage and the backend connection. ${String(error)}`,
        ));
    }

    async function saveParticipant(event: FormEvent) {
        event.preventDefault();
        const clean = participantId.trim();
        if (!clean || !conditionOrder.length) return;
        setMessage("");
        unlockNavigation();
        try {
            const response = await createSession({
                participantId: clean,
                studyMode,
                orderId: studyMode === "Formative" ? "formative" : orderId,
                conditionOrder,
                timing,
            });
            setSessionId(response.sessionId);
            setSessionBaseline(response.baseline);
            setSessionConditionOrder(conditionOrder);
            queue.current = createEventQueue(response.sessionId);
            await Promise.all([loadMusicCatalogue(), loadPlaybackConfig()]);
            localStorage.setItem("tunedIn.participantId", clean);
            localStorage.setItem(activeSessionStorageKey, response.sessionId);
            setParticipantId(clean);
            setBlockHighestStreak(0);
            setIntroductionStep(0);
            setShortcutMessage("");
            setStage("introduction");
        } catch (error) {
            setMessage(String(error));
        }
    }

    async function recoverSavedParticipant() {
        const clean = participantId.trim();
        if (!clean) return;
        setMessage("");
        try {
            const { session, checkpoint } = await recoverSession(
                clean,
                studyMode,
            );
            setSessionId(session.id);
            setSessionConditionOrder(session.conditionOrder);
            setParticipantId(session.participantId);
            setStudyMode(session.studyMode);
            setOrderId(session.orderId);
            setSessionBaseline(session.baseline ?? { mode: "timed", recordTarget: 15 });
            setConfiguredTiming(session.timing);
            setFormativeTiming(session.timing);
            setBlockIndex(checkpoint.blockIndex);
            setRecoveryActiveBlock(checkpoint.activeBlockNumber);
            queue.current = createEventQueue(session.id);
            await queue.current.flush();
            localStorage.setItem(
                "tunedIn.participantId",
                session.participantId,
            );
            localStorage.setItem(activeSessionStorageKey, session.id);
            await Promise.all([loadMusicCatalogue(), loadPlaybackConfig()]);
            if (checkpoint.stage === "active-block") {
                lockNavigation();
                setStage("recovery");
            } else {
                const canNavigateBack =
                    checkpoint.stage === "introduction" ||
                    checkpoint.stage === "baseline-intro";
                if (canNavigateBack) unlockNavigation();
                else lockNavigation();
                setIntroductionStep(0);
                setStage(checkpoint.stage);
            }
        } catch (error) {
            setMessage(String(error));
        }
    }

    async function endInterruptedSession() {
        if (!sessionId) return;
        try {
            await queue.current?.flush();
            await endRecoveredSession(sessionId);
            setRecoveryActiveBlock(null);
            setStage("complete");
        } catch (error) {
            setMessage(String(error));
        }
    }

    async function restartInterruptedBlock() {
        if (!sessionId) return;
        try {
            setMessage("");
            audio.current.stop();
            await queue.current?.flush();
            const response = await restartRecoveredBlock(sessionId);
            queue.current = createEventQueue(sessionId);
            setRecoveryActiveBlock(null);
            setBlockIndex(Math.max(0, response.blockNumber - 2));
            await activateStartedBlock(
                response.blockNumber,
                response.condition,
                response,
            );
        } catch (error) {
            setMessage(String(error));
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
            await activateStartedBlock(number, nextCondition, response);
        } catch (error) {
            setMessage(String(error));
        }
    }

    async function activateStartedBlock(
        number: number,
        nextCondition: Condition,
        response: { record: SourceRecord; initialMusicTrackId: string | null; attemptId: string },
    ) {
        if (number > 0)
            await startMusic(
                nextCondition,
                response.initialMusicTrackId,
                number,
            );
        activeAttemptId.current = response.attemptId;
        const taskStarted = performance.now();
        setRecord(response.record);
        setForm(empty);
        setErrors([]);
        setStreak(0);
        setBlockHighestStreak(0);
        setBaselineCompletedRecords(0);
        clearSubmissionFeedback();
        setSeconds(0);
        firstKey.current = false;
        recordWasRejected.current = false;
        completing.current = false;
        setStarted(taskStarted);
        setStage(
            number === 0 ? "practice" : number === 1 ? "baseline" : "task",
        );
        await queue.current!.send({
            blockNumber: number,
            recordId: response.record.id,
            eventType: "record_presented",
            attemptId: activeAttemptId.current,
            clientTimeMs: taskStarted,
        });
    }

    function startPractice() {
        lockNavigation();
        void beginBlock(0, "No music");
    }
    function skipPractice() {
        setStage("baseline-intro");
    }
    function skipPracticeInProgress() {
        if (!sessionId || stage !== "practice" || started === null) return;
        completing.current = true;
        void finishBlock(seconds);
    }
    function startBaselineCalibration() {
        lockNavigation();
        void beginBlock(1, "No music");
    }
    function startBlock() {
        lockNavigation();
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
                attemptId: activeAttemptId.current,
                clientTimeMs: performance.now(),
            });
        }
        // Record codes use mixed case, so preserve the participant's exact input.
        setForm((old) => ({ ...old, [key]: value }));
        setErrors([]);
        clearSubmissionFeedback();
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
            // Persist the submission before transmission; replay the same request ID after a failure.
            const submission = queue.current!.submit({
                blockNumber: number, recordId: record.id, values: { ...form },
                clientTimeMs: submittedAt, attemptId: activeAttemptId.current,
            });
            pendingSubmissions.current.add(submission);
            const response = await submission.finally(() =>
                pendingSubmissions.current.delete(submission),
            );
            setErrors(response.incorrectFields);
            if (number === 1 && response.validatedRecords !== undefined) setBaselineCompletedRecords(response.validatedRecords);
            if (response.accepted) {
                if (number >= 1 && !recordWasRejected.current) {
                    setStreak((current) => {
                        const next = current + 1;
                        setBlockHighestStreak((highest) => Math.max(highest, next));
                        return next;
                    });
                }
                showSubmissionFeedback("correct");
            } else {
                recordWasRejected.current = true;
                setStreak(0);
                showSubmissionFeedback("incorrect");
            }
            if (response.baselineComplete && response.completedDurationSeconds != null) {
                completing.current = true;
                await finishBlock(response.completedDurationSeconds);
                return;
            }
            if (
                response.accepted &&
                response.nextRecord &&
                !completing.current
            ) {
                setRecord(response.nextRecord);
                setForm(empty);
                firstKey.current = false;
                recordWasRejected.current = false;
                requestAnimationFrame(() => recordCodeInput.current?.focus());
                await queue.current!.send({
                    blockNumber: number,
                    recordId: response.nextRecord.id,
                    eventType: "record_presented",
                    attemptId: activeAttemptId.current,
                    clientTimeMs: performance.now(),
                });
            }
        } catch (error) {
            setMessage(
                `Could not save this record. Keep this tab open, check browser storage and the backend connection, then submit again. ${String(error)}`,
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
            setSavingMessage("Events saved. Saving block progress…");
            await finishApiBlock(sessionId, number, elapsedSeconds);
            if (number === 0) {
                endingBlockNumber.current = null;
                setStarted(null);
                setStage("baseline-intro");
                return;
            }
            if (number === 1) {
                endingBlockNumber.current = null;
                setStarted(null);
                setStage("calibration-results");
                return;
            }
            endingBlockNumber.current = null;
            setStarted(null);
            restTransitioning.current = false;
            setRestRemaining(restSeconds);
            setStage("pfs");
        } catch (error) {
            setSavingMessage(
                "Some task data could not be saved. Keep this tab open, check browser storage and the backend connection, then retry.",
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
            setTestAudioPlaying(false);
            await confirmComfortCheck(sessionId, Math.round(audioVolume * 100));
            setStage("block-intro");
        } catch (error) {
            setMessage(String(error));
        }
    }
    function continueFromRest() {
        if (restTransitioning.current) return;
        restTransitioning.current = true;
        if (blockIndex === conditionOrder.length - 1) {
            setStage("handover");
        } else {
            setBlockIndex((old) => old + 1);
            setStage("block-intro");
        }
    }
    function continueAfterPfs() {
        setStage("block-results");
    }
    function retrySavingEvents() {
        if (endingDuration.current !== null)
            void finishBlock(endingDuration.current);
    }
    function restart() {
        unlockNavigation();
        playbackBlock.current = null;
        audio.current.stop();
        setStage("participant");
        setSessionId(null);
        setSessionConditionOrder(null);
        setSessionBaseline(null);
        setRecoveryActiveBlock(null);
        setBlockIndex(0);
        setRecord(null);
        setForm(empty);
        setStreak(0);
        setBlockHighestStreak(0);
        setBaselineCompletedRecords(0);
        clearSubmissionFeedback();
        setMessage("");
        setAudioMessage("");
        setSavingMessage("");
        endingDuration.current = null;
        endingBlockNumber.current = null;
    }
    return {
        baseline, recordBasedBaseline, baselineCompletedRecords,
        stage,
        setStage,
        participantId,
        setParticipantId,
        orderId,
        setOrderId,
        orders,
        studyMode,
        setStudyMode,
        formativeTiming,
        restRemaining,
        sessionId,
        recoveryActiveBlock,
        blockIndex,
        record,
        form,
        errors,
        streak,
        blockHighestStreak,
        submissionFeedback,
        seconds,
        started,
        message,
        musicCatalogue,
        audioMessage,
        audioVolume,
        setAudioVolume,
        testAudioPlaying,
        savingMessage,
        introductionStep,
        setIntroductionStep,
        shortcutMessage,
        setShortcutMessage,
        navigationLocked,
        recordCodeInput,
        introPracticeForm,
        introRecordCodeInput,
        conditionOrder,
        timing,
        duration,
        remaining,
        goBack,
        saveParticipant,
        recoverSavedParticipant,
        endInterruptedSession,
        restartInterruptedBlock,
        toggleTestAudio,
        startPractice,
        skipPractice,
        skipPracticeInProgress,
        startBaselineCalibration,
        startBlock,
        update,
        updateFormativeTiming,
        submit,
        continueFromAudioCheck,
        continueFromRest,
        continueAfterPfs,
        retrySavingEvents,
        restart
    };
}

export type StudyController = ReturnType<typeof useStudyController>;
