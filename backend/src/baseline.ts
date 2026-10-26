import type { BaselineConfig, BaselineSettings, Session } from "../../shared/types.js";
import { config } from "./config.js";

export const baselineOptions: BaselineConfig = config.baseline ?? {
    defaultMode: "timed", enabledModes: ["timed"], recordTarget: 15,
};
export function validateBaselineOptions(options: BaselineConfig) {
    if (!options.enabledModes.length || new Set(options.enabledModes).size !== options.enabledModes.length ||
        options.enabledModes.some(mode => !["timed", "records"].includes(mode)) ||
        !options.enabledModes.includes(options.defaultMode) ||
        !Number.isInteger(options.recordTarget) || options.recordTarget < 1)
        throw new Error("Invalid baseline configuration: enable at least one mode, select an enabled default, and use a positive integer record target.");
}
validateBaselineOptions(baselineOptions);

/** Only study configuration selects the rule for new sessions. */
export function baselineForNewSession(options = baselineOptions): BaselineSettings {
    validateBaselineOptions(options);
    return { mode: options.defaultMode, recordTarget: options.recordTarget };
}

/** Sessions created before selectable baselines retain their original timed rule. */
export function baselineFor(session: Session): BaselineSettings {
    return session.baseline ?? { mode: "timed", recordTarget: 15 };
}

export function validatedRecordCount(session: Session, blockNumber: number) {
    return new Set(session.events.filter(event => event.blockNumber === blockNumber &&
        event.eventType === "validation_result" && event.payload?.accepted === true).map(event => event.recordId)).size;
}

export function recordBaselineDuration(session: Session) {
    const events = session.events.filter(event => event.blockNumber === 1);
    const presentations = events.filter(event => event.eventType === "record_presented");
    const validations = events.filter(event => event.eventType === "validation_result" && event.payload?.accepted === true);
    if (!presentations.length || !validations.length) throw new Error("Baseline timing events are missing.");
    const start = Math.min(...presentations.map(event => event.clientTimeMs));
    const end = Math.max(...validations.map(event => event.clientTimeMs));
    if (end < start) throw new Error("Invalid baseline timing events.");
    return (end - start) / 1000;
}
