export type Stage =
    | "participant"
    | "introduction"
    | "practice"
    | "baseline-intro"
    | "baseline"
    | "calibration-results"
    | "audio-check"
    | "block-intro"
    | "task"
    | "saving"
    | "recovery"
    | "pfs"
    | "block-results"
    | "handover"
    | "complete";
export type FormValues = { recordCode: string; batchCode: string; quantity: string };
export type SubmissionFeedback = "correct" | "incorrect" | null;
