import { FormEvent, useEffect, useRef, useState } from "react";

type RecordItem = {
    id: string;
    recordCode: string;
    batchCode: string;
    quantity: string;
};

type Condition = "No music" | "Static music" | "Adaptive music";

const RECORDS: RecordItem[] = [
    { id: "R001", recordCode: "K7M-418", batchCode: "QX-16", quantity: "064" },
    { id: "R002", recordCode: "P3A-902", batchCode: "LM-42", quantity: "128" },
    { id: "R003", recordCode: "T8C-251", batchCode: "BX-07", quantity: "315" },
    { id: "R004", recordCode: "N5R-733", batchCode: "KD-91", quantity: "086" },
    { id: "R005", recordCode: "V2L-640", batchCode: "QP-23", quantity: "207" },
    { id: "R006", recordCode: "H9F-115", batchCode: "MN-58", quantity: "492" },
];

const empty = { recordCode: "", batchCode: "", quantity: "" };

export default function App() {
    const [screen, setScreen] = useState<"landing" | "task" | "complete">(
            "landing",
        ),
        [condition, setCondition] = useState<Condition>("Adaptive music"),
        [i, setI] = useState(0),
        [form, setForm] = useState(empty),
        [errors, setErrors] = useState<string[]>([]),
        [accepted, setAccepted] = useState(0),
        [seconds, setSeconds] = useState(0),
        [started, setStarted] = useState<number | null>(null);
    const firstKey = useRef<number | null>(null);
    const current = RECORDS[i % RECORDS.length];
    
    useEffect(() => {
        if (screen !== "task" || started === null) return;
        const id = setInterval(
            () => setSeconds(Math.floor((performance.now() - started) / 1000)),
            250,
        );
        return () => clearInterval(id);
    }, [screen, started]);

    const start = () => {
        setScreen("task");
        setI(0);
        setForm(empty);
        setErrors([]);
        setAccepted(0);
        setSeconds(0);
        setStarted(performance.now());
    };

    const update = (k: keyof typeof form, v: string) => {
        if (firstKey.current === null && v)
            firstKey.current = performance.now();
        setForm((x) => ({ ...x, [k]: v.toUpperCase() }));
        if (errors.length) setErrors([]);
    };

    const submit = (e: FormEvent) => {
        e.preventDefault();
        const bad: string[] = [];
        if (form.recordCode !== current.recordCode) bad.push("Record Code");
        if (form.batchCode !== current.batchCode) bad.push("Batch Code");
        if (form.quantity !== current.quantity) bad.push("Quantity");
        if (bad.length) {
            setErrors(bad);
            return;
        }
        const n = accepted + 1;
        setAccepted(n);
        setForm(empty);
        setErrors([]);
        if (n >= 12) setScreen("complete");
        else setI((x) => x + 1);
    };
    
    if (screen === "landing")
        return (
            <main className="app">
                <div className="brand">TUNED IN</div>
                <section className="landing card">
                    <div className="eyebrow">
                        DIGITAL ENCODING TASK · PROTOTYPE
                    </div>
                    <h1>
                        Encode the records.
                        <br />
                        <span>Stay accurate.</span>
                    </h1>
                    <p className="lead">
                        Transfer the values from the source panel into the
                        matching fields. Incorrect submissions stay on the same
                        record until corrected.
                    </p>
                    <label className="label">Study condition</label>
                    <div className="conditions">
                        {(
                            [
                                "No music",
                                "Static music",
                                "Adaptive music",
                            ] as Condition[]
                        ).map((x) => (
                            <button
                                key={x}
                                className={
                                    condition === x
                                        ? "condition selected"
                                        : "condition"
                                }
                                onClick={() => setCondition(x)}
                            >
                                {condition === x ? "●" : "○"} {x}
                            </button>
                        ))}
                    </div>
                    <p className="helper">
                        Prototype control only. Participant-facing screens do
                        not expose performance or adaptation metrics.
                    </p>
                    <div className="instructions">
                        <b>Before you begin</b>
                        <ul>
                            <li>Copy all three values exactly.</li>
                            <li>
                                Use <kbd>Tab</kbd> between fields.
                            </li>
                            <li>
                                Press <kbd>Enter</kbd> to submit.
                            </li>
                            <li>Correct rejected fields before continuing.</li>
                        </ul>
                    </div>
                    <button className="primary large" onClick={start}>
                        Start encoding task <span>→</span>
                    </button>
                </section>
                <footer>Local prototype · Fictional records only</footer>
            </main>
        );
    if (screen === "complete")
        return (
            <main className="app">
                <div className="brand">TUNED IN</div>
                <section className="complete card">
                    <div className="check">✓</div>
                    <div className="eyebrow">BLOCK COMPLETE</div>
                    <h1>Encoding task finished.</h1>
                    <p className="lead">
                        The prototype completed the data-entry flow
                        successfully.
                    </p>
                    <div className="summary">
                        <div>
                            <span>Condition</span>
                            <b>{condition}</b>
                        </div>
                        <div>
                            <span>Validated</span>
                            <b>{accepted}</b>
                        </div>
                        <div>
                            <span>Elapsed</span>
                            <b>{fmt(seconds)}</b>
                        </div>
                    </div>
                    <button
                        className="primary"
                        onClick={() => setScreen("landing")}
                    >
                        Return to setup
                    </button>
                </section>
            </main>
        );
    return (
        <main className="task">
            <header>
                <div className="brand">TUNED IN</div>
                <div className="meta">
                    <span className="pill">{condition}</span>
                    <span>{fmt(seconds)}</span>
                </div>
            </header>
            <div className="progress">
                <i style={{ width: `${(accepted / 12) * 100}%` }} />
            </div>
            <section className="content">
                <div className="heading">
                    <div>
                        <div className="eyebrow">DIGITAL ENCODING</div>
                        <h2>Enter the source record</h2>
                    </div>
                    <b>{Math.min(i + 1, 12)} / 12</b>
                </div>
                <div className="grid">
                    <section className="panel">
                        <div className="panel-label">SOURCE RECORD</div>
                        <div className="source">
                            {[
                                ["Record Code", current.recordCode],
                                ["Batch Code", current.batchCode],
                                ["Quantity", current.quantity],
                            ].map(([a, b]) => (
                                <div className="source-row" key={a}>
                                    <span>{a}</span>
                                    <strong>{b}</strong>
                                </div>
                            ))}
                        </div>
                        <p className="note">
                            ● Keep this record visible while entering the
                            values.
                        </p>
                    </section>
                    <form className="panel" onSubmit={submit}>
                        <div className="panel-label">ENTRY FIELDS</div>
                        <Field
                            label="Record Code"
                            value={form.recordCode}
                            error={errors.includes("Record Code")}
                            autoFocus
                            onChange={(v) => update("recordCode", v)}
                        />
                        <Field
                            label="Batch Code"
                            value={form.batchCode}
                            error={errors.includes("Batch Code")}
                            onChange={(v) => update("batchCode", v)}
                        />
                        <Field
                            label="Quantity"
                            value={form.quantity}
                            error={errors.includes("Quantity")}
                            inputMode="numeric"
                            onChange={(v) => update("quantity", v)}
                        />
                        {errors.length > 0 && (
                            <div className="error">
                                <b>
                                    Check the highlighted field
                                    {errors.length > 1 ? "s" : ""}.
                                </b>
                                <span>
                                    The record was not accepted. Correct the
                                    values and submit again.
                                </span>
                            </div>
                        )}
                        <button className="primary submit">
                            Submit Record <span>↵</span>
                        </button>
                    </form>
                </div>
                <div className="foot">
                    Fictional study data · Accuracy matters
                </div>
            </section>
        </main>
    );
}
function Field(p: {
    label: string;
    value: string;
    error?: boolean;
    autoFocus?: boolean;
    inputMode?: "numeric";
    onChange: (v: string) => void;
}) {
    return (
        <label className={p.error ? "field bad" : "field"}>
            <span>{p.label}</span>
            <input
                autoFocus={p.autoFocus}
                value={p.value}
                inputMode={p.inputMode}
                autoComplete="off"
                spellCheck={false}
                aria-invalid={p.error}
                onChange={(e) => p.onChange(e.target.value)}
            />
            {p.error && <small>Does not match the source value.</small>}
        </label>
    );
}
function fmt(s: number) {
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
