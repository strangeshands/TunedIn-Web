export type ParticipantBlockResult = {
    block: number;
    condition: "No music" | "Static music" | "Adaptive music";
    accepted: number;
    elapsedSeconds: number;
    firstPassAccepted: number;
    firstPassRejected: number;
    correctionCycles: number;
};

export type ParticipantSessionResult = {
    participantId: string;
    orderId: "A" | "B" | "C";
    conditionOrder: string[];
    blocks: ParticipantBlockResult[];
    updatedAt: string;
};

function safeFileName(value: string) {
    return value.replace(/[^a-z0-9_-]/gi, "_");
}

function downloadBlob(contents: string, fileName: string, type: string) {
    const blob = new Blob([contents], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    URL.revokeObjectURL(url);
}

export function downloadParticipantJson(session: ParticipantSessionResult) {
    downloadBlob(
        JSON.stringify(session, null, 2),
        `tuned-in_${safeFileName(session.participantId)}.json`,
        "application/json",
    );
}

export function downloadParticipantCsv(session: ParticipantSessionResult) {
    const header = [
        "participant_id",
        "order_id",
        "block",
        "condition",
        "accepted_records",
        "elapsed_seconds",
        "throughput_records_per_minute",
        "first_pass_accepted",
        "first_pass_rejected",
        "first_pass_accuracy",
        "correction_cycles",
    ];

    const rows = session.blocks.map((block) => {
        const firstPassTotal =
            block.firstPassAccepted + block.firstPassRejected;
        const firstPassAccuracy =
            firstPassTotal === 0 ? 0 : block.firstPassAccepted / firstPassTotal;
        const minutes = block.elapsedSeconds / 60;
        const throughput = minutes === 0 ? 0 : block.accepted / minutes;

        return [
            session.participantId,
            session.orderId,
            block.block,
            block.condition,
            block.accepted,
            block.elapsedSeconds,
            throughput.toFixed(3),
            block.firstPassAccepted,
            block.firstPassRejected,
            firstPassAccuracy.toFixed(4),
            block.correctionCycles,
        ];
    });

    const csv = [header, ...rows]
        .map((row) =>
            row
                .map((value) => `"${String(value).replaceAll('"', '""')}"`)
                .join(","),
        )
        .join("\n");

    downloadBlob(
        csv,
        `tuned-in_${safeFileName(session.participantId)}.csv`,
        "text/csv;charset=utf-8",
    );
}
