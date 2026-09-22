import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const root = fileURLToPath(new URL("../../", import.meta.url));
export const config = JSON.parse(
    readFileSync(new URL("../../config/study.json", import.meta.url), "utf8"),
) as {
    version: string;
    taskVersion: string;
    practiceSeconds: number;
    blockSeconds: number;
    audioIntegration: "rule-engine";
    adaptiveRules: {
        rollingWindowSeconds: number;
        evaluationIntervalSeconds: number;
        minimumRecordCount: number;
        slowerThanBaselinePercent: number;
        fasterThanBaselinePercent: number;
        errorRateIncrease: number;
    };
};
