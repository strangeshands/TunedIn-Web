import type { ReactNode, RefObject } from "react";
import type { SourceRecord } from "../../../shared/types";

export function Source({ record }: { record: SourceRecord }) {
    return (
        <div className="source">
            {[
                ["Record Code", record.recordCode],
                ["Batch Code", record.batchCode],
                ["Quantity", record.quantity],
            ].map(([label, value]) => (
                <div className="source-row" key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                </div>
            ))}
        </div>
    );
}
export function CompletionConfetti() {
    const colors = ["#f2b84b", "#e56a35", "#d94545", "#5b9a6d", "#5b87b6"];
    return (
        <div className="completion-confetti" aria-hidden="true">
            {Array.from({ length: 20 }, (_, index) => (
                <i
                    key={index}
                    className="completion-confetti-piece"
                    style={{
                        left: `${5 + ((index * 37) % 90)}%`,
                        backgroundColor: colors[index % colors.length],
                        animationDelay: `${(index % 7) * 0.08}s`,
                        animationDuration: `${1.6 + (index % 4) * 0.15}s`,
                    }}
                />
            ))}
        </div>
    );
}
export function SimpleStage(props: {
    eyebrow: string;
    title: string;
    description: string;
    participantId: string;
    children: ReactNode;
}) {
    return (
        <main className="app">
            <div className="brand">TUNED IN</div>
            <section className="landing card">
                <div className="eyebrow">{props.eyebrow}</div>
                <h1 className="stage-title">{props.title}</h1>
                <p className="lead">{props.description}</p>
                {props.participantId && (
                    <div className="participant-line">
                        Participant {props.participantId}
                    </div>
                )}
                {props.children}
            </section>
            <footer>
                Version 3: Third Iteration of Formative User Feedback
            </footer>
        </main>
    );
}
export function Field(props: {
    label: string;
    value: string;
    error?: boolean;
    autoFocus?: boolean;
    inputMode?: "numeric";
    inputRef?: RefObject<HTMLInputElement | null>;
    onChange: (value: string) => void;
}) {
    return (
        <label className={props.error ? "field bad" : "field"}>
            <span>{props.label}</span>
            <input
                ref={props.inputRef}
                autoFocus={props.autoFocus}
                value={props.value}
                inputMode={props.inputMode}
                autoComplete="off"
                spellCheck={false}
                aria-invalid={props.error}
                onPaste={(event) => event.preventDefault()}
                onDrop={(event) => event.preventDefault()}
                onChange={(event) => props.onChange(event.target.value)}
            />
            {props.error && <small>Does not match the source value.</small>}
        </label>
    );
}
