import type { SourceRecord } from "../../shared/types.js";

const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const digits = "0123456789";

function seedFromText(value: string) {
    let hash = 0;
    for (const character of value)
        hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
    return hash >>> 0;
}

// Deterministic fictional records: backend owns the answer key and generation.
export function generateRecord(
    index: number,
    set: number,
    randomizationSeed = "",
): SourceRecord {
    let seed =
        (((index + 1) * 2654435761) ^
            ((set + 17) * 1597334677) ^
            seedFromText(randomizationSeed)) >>>
        0;
    const pick = (length: number) => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return Math.floor((seed / 4294967296) * length);
    };
    const letter = () => {
        const value = letters[pick(letters.length)];
        return pick(2) === 0 ? value : value.toLowerCase();
    };
    const number = (length: number) =>
        Array.from({ length }, () => digits[pick(digits.length)]).join("");
    return {
        id: `S${set}-R${index + 1}`,
        recordCode: `${letter()}${number(1)}${letter()}-${number(3)}`,
        batchCode: `${letter()}${letter()}-${number(2)}`,
        quantity: number(3),
    };
}

export function wrongFields(
    answer: SourceRecord,
    values: Record<string, string>,
) {
    return (["recordCode", "batchCode", "quantity"] as const).filter(
        (field) => values[field] !== answer[field],
    );
}
