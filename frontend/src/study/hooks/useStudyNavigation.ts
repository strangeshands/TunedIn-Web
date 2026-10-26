import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { Stage } from "../types";

type BrowserStage =
    | "participant"
    | "introduction"
    | "practice"
    | "baseline-intro";
type BrowserNavigationState = {
    tunedIn: true;
    stage: BrowserStage;
    introductionStep: number;
};

export function useStudyNavigation(
    stage: Stage,
    introductionStep: number,
    setStage: Dispatch<SetStateAction<Stage>>,
    setIntroductionStep: Dispatch<SetStateAction<number>>,
) {
    const [navigationLocked, setNavigationLocked] = useState(false);
    const navigationLockedRef = useRef(false);
    const browserHistoryReady = useRef(false);
    const restoringBrowserHistory = useRef(false);
    function historyState(): BrowserNavigationState {
        return {
            tunedIn: true,
            stage: stage as BrowserStage,
            introductionStep,
        };
    }

    function lockNavigation() {
        navigationLockedRef.current = true;
        setNavigationLocked(true);
    }

    function unlockNavigation() {
        navigationLockedRef.current = false;
        setNavigationLocked(false);
    }

    function goBack() {
        if (!navigationLockedRef.current) window.history.back();
    }

    // Before a timed block starts, browser Back follows the participant screens.
    // After a timed block starts, Back stays on the current study screen so a
    // participant cannot leave or revisit an earlier stage mid-session.
    useEffect(() => {
        const state = historyState();
        if (!browserHistoryReady.current) {
            window.history.replaceState(state, "", window.location.href);
            browserHistoryReady.current = true;
            return;
        }
        if (restoringBrowserHistory.current) {
            restoringBrowserHistory.current = false;
            return;
        }
        if (navigationLockedRef.current)
            window.history.replaceState(state, "", window.location.href);
        else window.history.pushState(state, "", window.location.href);
    }, [stage, introductionStep]);

    useEffect(() => {
        const onPopState = (event: PopStateEvent) => {
            if (navigationLockedRef.current) {
                window.history.pushState(
                    historyState(),
                    "",
                    window.location.href,
                );
                return;
            }

            const saved = event.state as Partial<BrowserNavigationState> | null;
            if (
                !saved?.tunedIn ||
                !saved.stage ||
                ![
                    "participant",
                    "introduction",
                    "practice",
                    "baseline-intro",
                ].includes(saved.stage)
            )
                return;

            restoringBrowserHistory.current = true;
            setStage(saved.stage);
            setIntroductionStep(saved.introductionStep ?? 0);
        };
        window.addEventListener("popstate", onPopState);
        return () => window.removeEventListener("popstate", onPopState);
    }, [stage, introductionStep]);

    return { navigationLocked, lockNavigation, unlockNavigation, goBack };
}
