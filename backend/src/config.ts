import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { BaselineConfig, Condition } from "../../shared/types.js";

export const root = fileURLToPath(new URL("../../", import.meta.url));
export const config = JSON.parse(
    readFileSync(new URL("../../config/study.json", import.meta.url), "utf8"),
) as {
    version: string;
    buildVersion: string;
    randomizationSeed: string;
    taskVersion: string;
    conditionOrders: Record<string, Condition[]>;
    formativeConditionOrder: Condition[];
    practiceSeconds: number;
    baselineSeconds: number;
    baseline?: BaselineConfig;
    blockSeconds: number;
    restSeconds: number;
    audioIntegration: "rule-engine";
    playback: {
        manifestVersion: string;
        crossfadeMs: number;
        masterHeadroomDb: number;
        avoidImmediateComposerRepeat: boolean;
        loopTracks: boolean;
        staticTrackId: string;
    };
    adaptiveRules: {
        rollingWindowSeconds: number;
        evaluationIntervalSeconds: number;
        minimumRecordCount: number;
        reducedIlMultiplier: number;
        reducedFpedMultiplier: number;
        reducedErrorRate: number;
        elevatedIlMultiplier: number;
        elevatedFpedMultiplier: number;
        elevatedErrorRate: number;
    };
};
