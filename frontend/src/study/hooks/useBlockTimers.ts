import { useEffect, type RefObject } from "react";
import type { Stage } from "../types";

export function useBlockTimers({
    stage,
    started,
    duration,
    recordBasedBaseline,
    completing,
    setSeconds,
    finishBlock,
    blockIndex,
    conditionCount,
    restSeconds,
    setRestRemaining,
    continueFromRest,
}: {
    stage: Stage;
    started: number | null;
    duration: number;
    recordBasedBaseline: boolean;
    completing: RefObject<boolean>;
    setSeconds: (seconds: number) => void;
    finishBlock: (seconds: number) => Promise<void>;
    blockIndex: number;
    conditionCount: number;
    restSeconds: number;
    setRestRemaining: (seconds: number) => void;
    continueFromRest: () => void;
}) {
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
            if (!recordBasedBaseline && elapsed >= duration && !completing.current) {
                completing.current = true;
                void finishBlock(duration);
            }
        }, 250);
        return () => window.clearInterval(timer);
    }, [stage, started, duration, recordBasedBaseline]);

    // The rest countdown is client-only: it does not create backend task events or exports.
    useEffect(() => {
        const hasNextBlock = blockIndex < conditionCount - 1;
        if (stage !== "block-results" || !hasNextBlock) return;
        const restStartedAt = performance.now();
        const tick = () => {
            const elapsed = Math.floor(
                (performance.now() - restStartedAt) / 1000,
            );
            const remainingSeconds = Math.max(0, restSeconds - elapsed);
            setRestRemaining(remainingSeconds);
            if (remainingSeconds === 0) continueFromRest();
        };
        tick();
        const timer = window.setInterval(tick, 250);
        return () => window.clearInterval(timer);
    }, [stage, blockIndex, conditionCount, restSeconds]);

}
