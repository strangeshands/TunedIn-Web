export type GeneratedRecord = {
  id: string;
  recordCode: string;
  batchCode: string;
  quantity: string;
};

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGITS = "0123456789";

function randomLetter() {
  return LETTERS[Math.floor(Math.random() * LETTERS.length)];
}

function randomDigit() {
  return DIGITS[Math.floor(Math.random() * DIGITS.length)];
}

function randomNumber(length: number) {
  let result = "";

  for (let i = 0; i < length; i++) {
    result += randomDigit();
  }

  return result;
}

function generateRecord(index: number): GeneratedRecord {
  return {
    id: `R${String(index + 1).padStart(3, "0")}`,

    // Example: K7M-418
    recordCode: `${randomLetter()}${randomDigit()}${randomLetter()}-${randomNumber(3)}`,

    // Example: QX-16
    batchCode: `${randomLetter()}${randomLetter()}-${randomNumber(2)}`,

    // Example: 064
    quantity: randomNumber(3),
  };
}

export function generateRecordBank(
  count = 100,
): GeneratedRecord[] {
  const records: GeneratedRecord[] = [];
  const used = new Set<string>();

  while (records.length < count) {
    const record = generateRecord(records.length);

    const key =
      `${record.recordCode}|${record.batchCode}|${record.quantity}`;

    if (!used.has(key)) {
      used.add(key);
      records.push(record);
    }
  }

  return records;
}