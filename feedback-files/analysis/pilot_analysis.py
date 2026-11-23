"""Shared pilot analysis stages. The notebooks supply inputs and display the reports."""

from io import BytesIO
from pathlib import Path
import hashlib
import json
import zipfile

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

CONDITIONS = ["No music", "Static music", "Adaptive music"]
COLORS = {"No music": "#697a89", "Static music": "#d69c42", "Adaptive music": "#31877b"}

FORM_TIMEZONE = "Asia/Manila"
TABLES = ("blocks", "records", "decisions", "transitions", "tracks")


def configure_display():
    pd.set_option("display.max_columns", 30)
    pd.set_option("display.float_format", lambda value: f"{value:,.3f}")
    plt.rcParams.update({"figure.dpi": 120, "axes.spines.top": False, "axes.spines.right": False,
                         "font.size": 10, "axes.titlesize": 12})


def input_provenance(export_zip, questionnaire):
    return pd.DataFrame([
        {"input": path.name, "bytes": path.stat().st_size,
         "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}
        for path in (export_zip, questionnaire)
    ])


def walk_zip(data, source="outer"):
    with zipfile.ZipFile(BytesIO(data)) as archive:
        names = [n for n in archive.namelist() if not n.endswith("/")
                 and "__MACOSX" not in n.split("/") and not Path(n).name.startswith("._")]
        for name in names:
            if name.lower().endswith(".zip"):
                yield from walk_zip(archive.read(name), source + "/" + name)
        for member in [n for n in names if Path(n).name == "session.json"]:
            folder = member.rsplit("/", 1)[0] + "/" if "/" in member else ""
            session = json.loads(archive.read(member))
            bundle = {"source": source + "/" + member, "session": session}
            for table in TABLES:
                key = folder + table + ".csv"
                bundle[table] = pd.read_csv(BytesIO(archive.read(key))) if key in names else pd.DataFrame()
            raw_key = folder + "events.jsonl"
            bundle["jsonl_events"] = [json.loads(line) for line in archive.read(raw_key).decode("utf-8").splitlines() if line.strip()] if raw_key in names else None
            yield bundle


def verify_session_copies(export_zip, bundles):
    """Verify standalone session copies without importing duplicate sessions."""
    sessions = {bundle["session"]["id"]: bundle["session"] for bundle in bundles}
    with zipfile.ZipFile(export_zip) as archive:
        copies = [name for name in archive.namelist() if name.endswith(".json")
                  and Path(name).name != "session.json"
                  and "__MACOSX" not in Path(name).parts
                  and not Path(name).name.startswith("._")]
        for name in copies:
            session = json.loads(archive.read(name))
            if sessions.get(session.get("id")) != session:
                raise ValueError(f"Standalone session does not match a results bundle: {name}")
    return len(copies)


def load_exports(export_zip, display):
    bundles = list(walk_zip(export_zip.read_bytes(), export_zip.name))
    if not bundles:
        raise ValueError("No session.json export bundles found.")
    ids = [bundle["session"]["id"] for bundle in bundles]
    if len(ids) != len(set(ids)):
        raise ValueError("Duplicate session bundles: resolve explicitly before analysis.")
    copy_count = verify_session_copies(export_zip, bundles)
    if copy_count:
        print(f"Verified {copy_count} standalone session copies against the participant bundles.")

    def combine(name):
        frames = []
        for bundle in bundles:
            frame = bundle[name].copy()
            if frame.empty:
                continue
            session = bundle["session"]
            assert "session_id" not in frame or frame.session_id.eq(session["id"]).all(), f"Wrong session label in {name}"
            frame["session_id"] = session["id"]
            frame["source_bundle"] = bundle["source"]
            frames.append(frame)
        return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()

    blocks, records, decisions, transitions = (
        combine(name) for name in ("blocks", "records", "decisions", "transitions")
    )
    sessions = pd.DataFrame([{
        "session_id": b["session"]["id"], "participant_id": b["session"]["participantId"],
        "mode": b["session"]["studyMode"], "build": b["session"].get("buildVersion"),
        "order": " → ".join(b["session"]["conditionOrder"]),
        "baseline_mode": b["session"].get("baseline", {}).get("mode", "timed"),
        "baseline_target": b["session"].get("baseline", {}).get("recordTarget"),
        "early_end": b["session"].get("endedEarlyAt"),
    } for b in bundles]).sort_values("participant_id")
    for frame in [blocks, records, decisions, transitions]:
        for column in frame.columns:
            if column.endswith("_ms") or column in {"block", "duration_seconds", "record_count", "records_presented", "validated_records", "validated_records_per_minute", "first_pass_error_rate", "first_pass_accuracy", "correction_cycles", "submission_count"}:
                frame[column] = pd.to_numeric(frame[column], errors="coerce")
    status = blocks.get("attempt_status", pd.Series("legacy_unspecified", index=blocks.index))
    completed = blocks.loc[status.eq("completed") | status.eq("legacy_unspecified")].copy()
    experimental = completed.loc[completed.block.ge(2)].copy()
    experimental["form_block"] = experimental.block - 1
    experimental["condition"] = pd.Categorical(experimental.condition, CONDITIONS, ordered=True)
    assert not experimental.duplicated(["session_id", "block"]).any(), "Ambiguous completed block keys."
    print(f"{len(sessions)} sessions; {len(blocks)} block rows; {len(records)} record rows; {len(decisions)} decisions; {len(transitions)} transitions")
    display(sessions)
    display(experimental[["participant_id", "block", "form_block", "condition", "duration_seconds", "validated_records", "validated_records_per_minute", "first_pass_error_rate"]].sort_values(["participant_id", "form_block"]))
    return bundles, blocks, records, decisions, transitions, completed, experimental


def event_rows(session):
    rows = []
    for (block, record_id), events in group_events(session).items():
        events = sorted(events, key=lambda event: (event["clientTimeMs"], event["sequence"]))
        def first(kind):
            return next((e for e in events if e["eventType"] == kind), None)
        p, k = first("record_presented"), first("first_key")
        submissions = [e for e in events if e["eventType"] == "record_submitted"]
        validations = [e for e in events if e["eventType"] == "validation_result"]
        accepted = next((e for e in validations if e.get("payload", {}).get("accepted") is True), None)
        s = submissions[0] if submissions else None
        rows.append({"session_id": session["id"], "participant_id": session["participantId"],
            "block": block, "record_id": record_id,
            "presented_ms": p["clientTimeMs"] if p else np.nan,
            "first_key_ms": k["clientTimeMs"] if k else np.nan,
            "first_submission_ms": s["clientTimeMs"] if s else np.nan,
            "validated_ms": accepted["clientTimeMs"] if accepted else np.nan,
            "first_pass_rejected": not validations[0].get("payload", {}).get("accepted", False) if validations else np.nan,
            "submission_count": len(submissions), "validation_count": len(validations),
            "presentation_count": sum(e["eventType"] == "record_presented" for e in events),
            "first_key_count": sum(e["eventType"] == "first_key" for e in events),
            "paired_timestamps": len(submissions) == len(validations) and all(a["clientTimeMs"] == b["clientTimeMs"] and a["sequence"] < b["sequence"] for a,b in zip(submissions, validations)),
        })
    return rows

def group_events(session):
    groups = {}
    for event in session["events"]:
        groups.setdefault((event["blockNumber"], event["recordId"]), []).append(event)
    return groups


def audit_exports(bundles, records, completed, display):
    raw_records = pd.DataFrame([row for bundle in bundles for row in event_rows(bundle["session"])])
    raw_records["il_ms"] = raw_records.first_key_ms - raw_records.presented_ms
    raw_records["fped_ms"] = raw_records.first_submission_ms - raw_records.first_key_ms
    raw_records["ttsv_ms"] = raw_records.validated_ms - raw_records.presented_ms
    issues = []
    for bundle in bundles:
        session = bundle["session"]
        seq = [e["sequence"] for e in session["events"]]
        jsonl = bundle["jsonl_events"]
        event_keys = list(session["events"][0]) if session["events"] else []
        jsonl_matches = jsonl is not None and [{k: e.get(k) for k in event_keys} for e in jsonl] == [{k: e.get(k) for k in event_keys} for e in session["events"]]
        rows = raw_records.loc[raw_records.session_id.eq(session["id"])]
        issues.append({"participant_id": session["participantId"], "events": len(seq),
            "duplicate_sequences": len(seq) - len(set(seq)),
            "sequence_order_errors": sum(b <= a for a,b in zip(seq, seq[1:])),
            "duplicate_presentations": int(rows.presentation_count.sub(1).clip(lower=0).sum()),
            "duplicate_first_keys": int(rows.first_key_count.sub(1).clip(lower=0).sum()),
            "submitted_missing_first_key": int((rows.submission_count.gt(0) & rows.first_key_ms.isna()).sum()),
            "unpaired_records": int((~rows.paired_timestamps).sum()),
            "negative_timing_records": int(rows[["il_ms", "fped_ms", "ttsv_ms"]].lt(0).any(axis=1).sum()),
            "no_presentation_records": int(rows.presentation_count.eq(0).sum()),
            "jsonl_agrees": jsonl_matches,
            "presented_not_submitted": int(rows.submission_count.eq(0).sum()),
            "submitted_not_validated": int((rows.submission_count.gt(0) & rows.validated_ms.isna()).sum()),
        })
    audit = pd.DataFrame(issues).sort_values("participant_id")

    comparison = records.merge(raw_records, on=["session_id", "participant_id", "block", "record_id"], suffixes=("_csv", "_raw"), validate="one_to_one", how="outer", indicator=True)
    record_mismatches = []
    for field in ["presented_ms", "first_key_ms", "first_submission_ms", "validated_ms", "il_ms", "fped_ms", "ttsv_ms", "submission_count"]:
        ok = np.isclose(comparison[field+"_csv"], comparison[field+"_raw"], equal_nan=True, rtol=1e-9, atol=1e-5)
        record_mismatches.append({"field": field, "mismatched_rows": int((~ok).sum())})
    def normalize_bool(series):
        return series.map(lambda value: np.nan if pd.isna(value) else str(value).lower() == "true")
    left_bool, right_bool = normalize_bool(comparison.first_pass_rejected_csv), normalize_bool(comparison.first_pass_rejected_raw)
    record_mismatches.append({"field": "first_pass_rejected", "mismatched_rows": int((~(left_bool.eq(right_bool) | (left_bool.isna() & right_bool.isna()))).sum())})
    record_reconciliation = pd.DataFrame(record_mismatches)
    block_checks = []
    for _, block in completed.iterrows():
        r = raw_records.loc[raw_records.session_id.eq(block.session_id) & raw_records.block.eq(block.block)]
        attempted = r.loc[r.first_submission_ms.notna() & r.first_pass_rejected.notna()]
        valid = r.loc[r.validated_ms.notna()]
        computed = {"records_presented": len(r), "validated_records": len(valid),
            "validated_records_per_minute": len(valid)/(block.duration_seconds/60) if block.duration_seconds else 0,
            "median_il_ms": attempted.il_ms.median(), "median_fped_ms": attempted.fped_ms.median(),
            "first_pass_error_rate": attempted.first_pass_rejected.astype(float).mean(),
            "first_pass_accuracy": 1-attempted.first_pass_rejected.astype(float).mean(),
            "median_ttsv_ms": valid.ttsv_ms.median(),
            "correction_cycles": r.submission_count.sub(1).clip(lower=0).sum()}
        for field, value in computed.items():
            block_checks.append({"participant_id": block.participant_id, "block": block.block, "field": field,
                "matches": bool(np.isclose(value, block[field], equal_nan=True, rtol=1e-9, atol=1e-5))})
    block_reconciliation = pd.DataFrame(block_checks)
    print("Raw-event audit")
    display(audit)
    timing_fields = ["il_ms", "fped_ms", "ttsv_ms"]
    negative = raw_records.loc[raw_records[timing_fields].lt(0).any(axis=1)]
    if not negative.empty:
        print("Records with negative timing values")
        display(negative[["participant_id", "block", "record_id", *timing_fields]])
    print("Record-level export reconciliation")
    display(record_reconciliation)
    print("Unmatched record keys:", int(comparison._merge.ne("both").sum()))
    print("Block measure mismatches:", int((~block_reconciliation.matches).sum()))
    if (~block_reconciliation.matches).any():
        display(block_reconciliation.loc[~block_reconciliation.matches])
    return raw_records


def analyze_task(bundles, experimental, display):
    performance = experimental[["participant_id", "session_id", "form_block", "block", "condition", "duration_seconds", "validated_records", "validated_records_per_minute", "first_pass_error_rate", "correction_cycles", "median_il_ms", "median_fped_ms", "median_ttsv_ms"]].copy()
    performance["median_il_s"] = performance.median_il_ms / 1000
    performance["median_fped_s"] = performance.median_fped_ms / 1000
    performance["corrections_per_validated"] = performance.correction_cycles / performance.validated_records.replace(0, np.nan)
    display(performance[["participant_id", "form_block", "condition", "validated_records_per_minute", "first_pass_error_rate", "correction_cycles", "corrections_per_validated", "median_il_s", "median_fped_s"]].sort_values(["participant_id", "form_block"]))

    rejected_fields = []
    for bundle in bundles:
        session = bundle["session"]
        for (block, record_id), events in group_events(session).items():
            events = sorted(events, key=lambda event: event["sequence"])
            submissions = [e for e in events if e["eventType"] == "record_submitted"]
            validations = [e for e in events if e["eventType"] == "validation_result"]
            successful_values = next((s.get("payload", {}).get("values") for s,v in zip(submissions, validations) if v.get("payload", {}).get("accepted") is True), None)
            for submission, validation in zip(submissions, validations):
                if validation.get("payload", {}).get("accepted") is True:
                    continue
                for field in validation.get("payload", {}).get("incorrectFields", []):
                    entered = submission.get("payload", {}).get("values", {}).get(field)
                    expected = successful_values.get(field) if successful_values else None
                    case_only = isinstance(entered, str) and isinstance(expected, str) and entered != expected and entered.casefold() == expected.casefold()
                    rejected_fields.append({"participant_id": session["participantId"], "session_id": session["id"], "block": block,
                        "record_id": record_id, "field": field, "classification": "case_only" if case_only else "other_mismatch" if expected is not None else "unresolved_answer"})
    field_errors = pd.DataFrame(rejected_fields, columns=[
        "participant_id", "session_id", "block", "record_id", "field", "classification"
    ])
    main_field_errors = field_errors.merge(
        experimental[["session_id", "block"]], on=["session_id", "block"], validate="many_to_one"
    )
    field_summary = main_field_errors.groupby(["field", "classification"]).size().unstack(fill_value=0)
    print("Experimental-block incorrect fields across all rejected submissions (a submission can have several incorrect fields)")
    display(field_summary)
    print("Case-only checks use a later accepted submission of the SAME record as the answer key; no historical record generator is assumed.")

    fig, axes = plt.subplots(1, 2, figsize=(11, 3.8))
    for condition in CONDITIONS:
        subset = performance.loc[performance.condition.eq(condition)].sort_values("participant_id")
        axes[0].scatter(subset.participant_id, subset.validated_records_per_minute, label=condition, color=COLORS[condition], s=65)
        axes[1].scatter(subset.participant_id, 100*subset.first_pass_error_rate, label=condition, color=COLORS[condition], s=65)
    axes[0].set(title="Task throughput: individual block observations", ylabel="Validated records per minute")
    axes[1].set(title="First-pass errors: individual block observations", ylabel="First-pass rejected records (%)")
    axes[0].legend(fontsize=8, frameon=False); axes[1].set_ylim(bottom=0)
    fig.tight_layout(); plt.show()
    return performance


def analyze_record_counts(experimental, completed, raw_records, records, display):
    main_record_rows = []
    for block in experimental.sort_values(["participant_id", "form_block"]).itertuples():
        rows = raw_records.loc[raw_records.session_id.eq(block.session_id) & raw_records.block.eq(block.block)]
        origin = rows.presented_ms.min()
        valid = rows.loc[rows.validated_ms.notna()].sort_values("validated_ms")
        submitted = rows.loc[rows.first_submission_ms.notna()]
        export_rows = records.loc[records.session_id.eq(block.session_id) & records.block.eq(block.block)]
        export_valid = export_rows.loc[export_rows.validated_ms.notna()].sort_values("validated_ms")
        seconds_to_20 = (
            (export_valid.iloc[19].validated_ms - export_rows.presented_ms.min()) / 1000
            if len(export_valid) >= 20 else np.nan
        )
        observed_completed = len(valid)
        assert observed_completed == block.validated_records, "Main-block completed count disagrees with CSV."
        main_record_rows.append({
            "participant_id": block.participant_id, "session_id": block.session_id,
            "form_block": block.form_block, "exported_block": block.block, "condition": str(block.condition),
            "duration_seconds": block.duration_seconds,
            "records_presented": len(rows), "records_submitted": len(submitted),
            "records_completed": observed_completed,
            "completed_per_minute": observed_completed/(block.duration_seconds/60),
            "completed_in_first_120s": int(valid.validated_ms.le(origin+120_000).sum()),
            "seconds_to_15_completed": (valid.iloc[14].validated_ms-origin)/1000 if len(valid) >= 15 else np.nan,
            "seconds_to_20_completed": seconds_to_20,
            "presented_not_completed": len(rows)-observed_completed,
        })
    main_record_counts = pd.DataFrame(main_record_rows)
    print("Completed experimental blocks")
    display(main_record_counts.drop(columns=["session_id", "seconds_to_20_completed"]))
    print("Completed records by condition")
    main_counts_by_condition = main_record_counts.pivot(index="participant_id", columns="condition", values="records_completed").reindex(columns=CONDITIONS)
    main_counts_by_condition["total_main_records"] = main_counts_by_condition.sum(axis=1)
    display(main_counts_by_condition)
    print("Completed records by experimental position; condition order differs across participants")
    display(main_record_counts.pivot(index="participant_id", columns="form_block", values="records_completed").rename(columns={1:"Block 1",2:"Block 2",3:"Block 3"}))

    timed_baselines = completed.loc[
        completed.block.eq(1) & completed.duration_seconds.eq(120)
        & completed.get("baseline_mode", pd.Series("timed", index=completed.index)).fillna("timed").eq("timed")
    ]
    baseline_by_participant = timed_baselines.set_index("participant_id").validated_records
    main_two_minute_comparison = main_record_counts.groupby("participant_id").agg(
        main_first_120s_min=("completed_in_first_120s", "min"),
        main_first_120s_max=("completed_in_first_120s", "max"),
        main_time_to_15_min_s=("seconds_to_15_completed", "min"),
        main_time_to_15_max_s=("seconds_to_15_completed", "max"),
    )
    if not baseline_by_participant.empty:
        main_two_minute_comparison.insert(0, "silent_baseline_completed_in_120s", baseline_by_participant)
    print("Directly observed early-main-block completion and any 120-second timed baselines")
    display(main_two_minute_comparison)
    print("Main-block totals and time-to-15 range")
    display(pd.DataFrame([{
        "experimental_blocks": len(main_record_counts),
        "total_records_completed": int(main_record_counts.records_completed.sum()),
        "completed_per_block_min": int(main_record_counts.records_completed.min()),
        "completed_per_block_max": int(main_record_counts.records_completed.max()),
        "time_to_15_min_s": main_record_counts.seconds_to_15_completed.min(),
        "time_to_15_median_s": main_record_counts.seconds_to_15_completed.median(),
        "time_to_15_max_s": main_record_counts.seconds_to_15_completed.max(),
    }]))
    return main_record_counts


def report_time_to_20(main_record_counts, display):
    time_to_20 = main_record_counts[["participant_id", "form_block", "condition", "seconds_to_20_completed"]]
    display(time_to_20)
    observed = time_to_20.dropna(subset=["seconds_to_20_completed"])
    print(f"{len(observed)} of {len(time_to_20)} experimental blocks reached 20 accepted records.")
    if not observed.empty:
        seconds = observed.seconds_to_20_completed
        display(observed.groupby("participant_id").seconds_to_20_completed.agg(["median", "min", "max"]))
        print(f"Median {seconds.median():.3f} s, mean {seconds.mean():.3f} s, "
              f"range {seconds.min():.3f}–{seconds.max():.3f} s.")


def analyze_calibration(completed, raw_records, display):
    calibration = completed.loc[completed.block.eq(1)].copy().sort_values("participant_id")
    assert not calibration.duplicated("session_id").any(), "More than one completed baseline per session: inspect attempts."
    baseline_rows = []
    for baseline in calibration.itertuples():
        rows = raw_records.loc[raw_records.session_id.eq(baseline.session_id) & raw_records.block.eq(1)]
        submitted = rows.loc[rows.first_submission_ms.notna()]
        judged = submitted.loc[submitted.first_pass_rejected.notna()]
        validated = rows.loc[rows.validated_ms.notna()]
        baseline_rows.append({
            "participant_id": baseline.participant_id, "session_id": baseline.session_id,
            "baseline_mode": getattr(baseline, "baseline_mode", "timed"),
            "baseline_target_records": getattr(baseline, "baseline_target_records", None),
            "duration_seconds": baseline.duration_seconds,
            "records_presented": len(rows), "first_submitted_records": len(submitted),
            "validated_records": len(validated), "presented_not_submitted": int(rows.first_submission_ms.isna().sum()),
            "submitted_not_validated": int(submitted.validated_ms.isna().sum()),
            "first_pass_correct": int(judged.first_pass_rejected.eq(False).sum()),
            "first_pass_rejected_records": int(judged.first_pass_rejected.eq(True).sum()),
            "correction_cycles": int(rows.submission_count.sub(1).clip(lower=0).sum()),
            "il_reference_records": int(submitted.il_ms.notna().sum()),
            "fped_reference_records": int(submitted.fped_ms.notna().sum()),
        })
    baseline_counts = pd.DataFrame(baseline_rows).sort_values("participant_id")
    print("Baseline record counts (one row per participant)")
    display(baseline_counts.drop(columns="session_id"))

    baseline_results = calibration[["participant_id", "validated_records_per_minute", "first_pass_error_rate", "first_pass_accuracy", "median_il_ms", "median_fped_ms", "median_ttsv_ms", "correction_cycles_per_validated_record"]].copy()
    baseline_results["first_pass_error_percent"] = 100*baseline_results.first_pass_error_rate
    baseline_results["first_pass_accuracy_percent"] = 100*baseline_results.first_pass_accuracy
    baseline_results["reference_il_seconds"] = baseline_results.median_il_ms/1000
    baseline_results["reference_fped_seconds"] = baseline_results.median_fped_ms/1000
    baseline_results["median_validation_time_seconds"] = baseline_results.median_ttsv_ms/1000
    print("Baseline performance and participant-specific timing references")
    display(baseline_results[["participant_id", "validated_records_per_minute", "first_pass_error_percent", "first_pass_accuracy_percent", "reference_il_seconds", "reference_fped_seconds", "median_validation_time_seconds", "correction_cycles_per_validated_record"]])

    count_columns = ["records_presented", "first_submitted_records", "validated_records", "presented_not_submitted", "submitted_not_validated", "first_pass_correct", "first_pass_rejected_records", "correction_cycles"]
    baseline_totals = baseline_counts[count_columns].sum().astype(int)
    total_baseline_minutes = baseline_counts.duration_seconds.sum()/60
    baseline_overview = pd.DataFrame([{
        "participants": len(calibration), "total_baseline_minutes": total_baseline_minutes,
        **baseline_totals.to_dict(),
        "pooled_validated_records_per_minute": baseline_totals.validated_records/total_baseline_minutes,
        "pooled_first_pass_accuracy_percent": 100*baseline_totals.first_pass_correct/(baseline_totals.first_pass_correct+baseline_totals.first_pass_rejected_records),
    }])
    print("Combined baseline counts and rates; pooled rates are ratios of totals, not averages of participant percentages")
    display(baseline_overview)
    return baseline_counts


def audit_scheduling(bundles, raw_records, decisions, experimental, display):
    block_meta = pd.DataFrame([{**block, "session_id": b["session"]["id"], "participant_id": b["session"]["participantId"]} for b in bundles for block in b["session"]["blocks"]])
    block_meta["started_utc"] = pd.to_datetime(block_meta.startedAt, utc=True)
    block_meta["ended_utc"] = pd.to_datetime(block_meta.endedAt, utc=True)
    block_meta["wall_duration_s"] = (block_meta.ended_utc-block_meta.started_utc).dt.total_seconds()
    block_meta["wall_minus_saved_s"] = block_meta.wall_duration_s - block_meta.durationSeconds
    print("Wall-clock duration minus saved block duration (seconds)")
    display(block_meta.groupby("participant_id").wall_minus_saved_s.agg(["min", "max"]))

    first_presentations = raw_records.groupby(["session_id", "block"], as_index=False).presented_ms.min().rename(columns={"presented_ms": "block_origin_ms"})
    decision_audit = decisions.merge(first_presentations, on=["session_id", "block"], validate="many_to_one").merge(
        experimental[["session_id", "block", "duration_seconds"]], on=["session_id", "block"], validate="many_to_one")
    decision_audit["elapsed_s"] = (decision_audit.window_end_ms-decision_audit.block_origin_ms)/1000
    # Evaluations at or after the nominal block duration cannot provide meaningful in-block exposure.
    decision_audit["at_or_after_end"] = decision_audit.elapsed_s.ge(decision_audit.duration_seconds)
    decision_audit["waiting"] = decision_audit.reason.fillna("").str.contains("waiting", case=False)
    # Legacy exports do not freeze the full adaptive config. Infer waiting from the recorded reason,
    # not the current minimumRecordCount setting.
    decision_audit["actionable"] = ~decision_audit.at_or_after_end
    cadence = decision_audit.groupby("participant_id").agg(total_evaluations=("block", "size"),
        in_block_evaluations=("actionable", "sum"), terminal_evaluations=("at_or_after_end", "sum"),
        waiting_evaluations=("waiting", "sum"), first_evaluation_s=("elapsed_s", "min"), last_evaluation_s=("elapsed_s", "max"))
    display(cadence)
    display(decision_audit.loc[decision_audit.at_or_after_end, ["participant_id", "elapsed_s", "record_count", "previous_state", "selected_state", "reason"]])
    return block_meta, decision_audit


def audit_playback(bundles, decision_audit, transitions, display):
    in_block_decisions = decision_audit.loc[decision_audit.actionable].copy()
    state_counts = in_block_decisions.groupby(["participant_id", "selected_state"]).size().unstack(fill_value=0).reindex(columns=["baseline", "reduced", "elevated", "silent"], fill_value=0)
    display(state_counts)

    decision_details = pd.DataFrame([{**d, "session_id": b["session"]["id"], "participant_id": b["session"]["participantId"]} for b in bundles for d in b["session"].get("musicDecisions", [])])
    expected_changes = decision_details.loc[decision_details.previousTrackId.fillna("<silent>").ne(decision_details.selectedTrackId.fillna("<silent>"))].copy()
    actual_transitions = pd.DataFrame([{**t, "session_id": b["session"]["id"]} for b in bundles for t in b["session"].get("musicTransitions", [])])
    transition_match = expected_changes.merge(actual_transitions, left_on=["session_id", "id"], right_on=["session_id", "decisionId"], how="outer", indicator=True, suffixes=("_decision", "_transition"), validate="one_to_one")
    transitions["observed_crossfade_ms"] = transitions.completed_ms - transitions.started_ms
    transitions["deviation_ms"] = transitions.observed_crossfade_ms - transitions.configured_crossfade_ms
    transition_summary = transitions.groupby("participant_id").agg(transitions=("block", "size"),
        successful=("outcome", lambda values: values.eq("playing").sum()),
        minimum_ms=("observed_crossfade_ms", "min"), maximum_ms=("observed_crossfade_ms", "max"),
        mean_deviation_ms=("deviation_ms", "mean"))
    display(transition_summary)
    missing = transition_match.loc[transition_match._merge.eq("left_only")]
    print("Track-changing decisions without a transition:", len(missing))
    if not missing.empty:
        missing = missing.rename(columns={
            "blockNumber_decision": "block", "windowEndMs": "window_end_ms",
            "participant_id_decision": "participant_id", "id_decision": "id",
        })
        keys = ["session_id", "block", "window_end_ms"]
        # CSV time values and JSON numbers can differ by a floating-point round trip.
        missing = missing.assign(window_end_ms=missing.window_end_ms.round(3))
        schedule = decision_audit[keys + ["elapsed_s", "at_or_after_end"]].copy()
        schedule["window_end_ms"] = schedule.window_end_ms.round(3)
        missing = missing.merge(schedule, on=keys, how="left", validate="many_to_one")
        display(missing[["participant_id", "block", "id", "elapsed_s", "at_or_after_end"]])
    print("Transition rows without a matching track-changing decision:", int(transition_match._merge.eq("right_only").sum()))
    print("Duplicate decision IDs within sessions:", int(decision_details.duplicated(["session_id", "id"]).sum()))

    fig, ax = plt.subplots(figsize=(8, 3.2))
    for row_index, (participant, group) in enumerate(in_block_decisions.groupby("participant_id")):
        for state, color in [("baseline", "#697a89"), ("reduced", "#d69c42"), ("elevated", "#31877b"), ("silent", "#b85450")]:
            subset = group.loc[group.selected_state.eq(state)]
            ax.scatter(subset.elapsed_s, [row_index]*len(subset), color=color, s=65, label=state if row_index == 0 else None)
    ax.set(yticks=range(len(state_counts)), yticklabels=sorted(state_counts.index), xlabel="Seconds since first adaptive-block presentation", title="In-block adaptive state selections (terminal evaluations excluded)")
    ax.legend(frameon=False, ncol=4, loc="upper center", bbox_to_anchor=(0.5, -0.18)); fig.tight_layout(); plt.show()
    print("Successful timing logs confirm reported playback completion, not perceived smoothness or headphone comfort; ask participants about those separately.")


PFS_ITEMS = [
    "I was absorbed in the task", "I was highly focused on the task", "All my attention was on the task",
    "I felt like I could easily control what I was doing", "My actions flowed effortlessly", "There was a sense of fluidity to my actions",
    "I found the experience rewarding", "The experience felt satisfying", "I would like the feeling of that experience again",
]


def score_questionnaire(questionnaire, experimental, performance, display, *, sheet_name=0, prior_cohort=()):
    pfs_raw = (
        pd.read_excel(questionnaire, sheet_name=sheet_name)
        if questionnaire.suffix.lower() == ".xlsx" else pd.read_csv(questionnaire)
    )
    assert set(["Timestamp", "Participant Code", "Block Number", *PFS_ITEMS]).issubset(pfs_raw.columns), "Unexpected PFS form columns."
    pfs = pfs_raw.rename(columns={"Participant Code": "participant_id", "Block Number": "form_block"}).copy()
    pfs["participant_id"] = pfs.participant_id.astype(str).str.strip().str.upper()
    pfs["form_block"] = pd.to_numeric(pfs.form_block, errors="coerce")
    pfs["form_row"] = np.arange(2, len(pfs)+2)  # CSV row number, including its header
    excluded = pfs.loc[pfs.participant_id.isin(prior_cohort)]
    if not excluded.empty:
        print("Earlier pilot questionnaire rows in the supplied workbook")
        display(excluded[["form_row", "participant_id", "form_block"]])
    pfs = pfs.loc[~pfs.participant_id.isin(prior_cohort)].copy()
    for item in PFS_ITEMS:
        pfs[item] = pd.to_numeric(pfs[item], errors="coerce")
    pfs["missing_items"] = pfs[PFS_ITEMS].isna().sum(axis=1)
    pfs["invalid_items"] = ((pfs[PFS_ITEMS].lt(1) | pfs[PFS_ITEMS].gt(7) | pfs[PFS_ITEMS].mod(1).ne(0)) & pfs[PFS_ITEMS].notna()).sum(axis=1)
    pfs["valid_items"] = pfs.missing_items.eq(0) & pfs.invalid_items.eq(0)
    pfs["absorption"] = pfs[PFS_ITEMS[:3]].mean(axis=1).where(pfs.valid_items)
    pfs["effortless_control"] = pfs[PFS_ITEMS[3:6]].mean(axis=1).where(pfs.valid_items)
    pfs["intrinsic_reward"] = pfs[PFS_ITEMS[6:9]].mean(axis=1).where(pfs.valid_items)
    pfs["overall_item_mean"] = pfs[PFS_ITEMS].mean(axis=1).where(pfs.valid_items)

    expected_keys = experimental[["participant_id", "session_id", "form_block", "block", "condition"]].copy()
    expected_keys["participant_id"] = expected_keys.participant_id.str.strip().str.upper()
    assert not expected_keys.duplicated(["participant_id", "form_block"]).any(), "Repeated sessions need an explicit session ID in the form."
    pfs_duplicates = pfs.loc[pfs.duplicated(["participant_id", "form_block"], keep=False)]
    if not pfs_duplicates.empty:
        display(pfs_duplicates[["form_row", "participant_id", "form_block"]])
        raise ValueError("Duplicate form keys: explicitly resolve responses rather than selecting the latest automatically.")
    link_audit = expected_keys.merge(pfs[["participant_id", "form_block"]], on=["participant_id", "form_block"], how="outer", indicator=True, validate="one_to_one")
    print("In-scope questionnaire rows:", len(pfs))
    print("Missing form responses:", int(link_audit._merge.eq("left_only").sum()), "Unmatched form responses:", int(link_audit._merge.eq("right_only").sum()))
    if link_audit._merge.ne("both").any():
        display(link_audit.loc[link_audit._merge.ne("both")])
    print("Invalid/missing item rows:", int((~pfs.valid_items).sum()))
    joined = expected_keys.merge(pfs, on=["participant_id", "form_block"], how="left", validate="one_to_one")
    joined = joined.merge(performance.drop(columns=["participant_id", "form_block", "condition"]), on=["session_id", "block"], validate="one_to_one")
    display(joined[["participant_id", "form_block", "condition", "absorption", "effortless_control", "intrinsic_reward", "overall_item_mean"]].sort_values(["participant_id", "form_block"]))
    return pfs, joined


def audit_questionnaire_timing(joined, block_meta, display):
    timestamps = joined.Timestamp
    if not pd.api.types.is_datetime64_any_dtype(timestamps):
        timestamps = pd.to_datetime(timestamps, format="%m/%d/%Y %H:%M:%S", errors="coerce")
    joined = joined.assign(form_time=timestamps.dt.tz_localize(FORM_TIMEZONE))
    ends = block_meta.loc[block_meta.number.ge(2), ["session_id", "number", "started_utc", "ended_utc"]].rename(columns={"number": "block"}).copy()
    ends = ends.sort_values(["session_id", "block"])
    ends["next_block_start_utc"] = ends.groupby("session_id").started_utc.shift(-1)
    joined = joined.merge(ends, on=["session_id", "block"], how="left", validate="one_to_one")
    joined["form_time_utc"] = joined.form_time.dt.tz_convert("UTC")
    joined["minutes_after_block_end"] = (joined.form_time_utc-joined.ended_utc).dt.total_seconds()/60
    joined["before_block_end"] = joined.form_time_utc.lt(joined.ended_utc)
    joined["after_next_block_start"] = joined.next_block_start_utc.notna() & joined.form_time_utc.ge(joined.next_block_start_utc)
    joined = joined.sort_values(["participant_id", "form_block"])
    joined["seconds_since_previous_form"] = joined.groupby("participant_id").form_time.diff().dt.total_seconds()
    clustered_ids = set(joined.loc[joined.seconds_since_previous_form.between(0, 10), "participant_id"])
    joined["clustered_submission"] = joined.participant_id.isin(clustered_ids)
    joined["timing_review"] = joined.before_block_end | joined.after_next_block_start | joined.clustered_submission | joined.form_time.isna() | joined.ended_utc.isna()
    print("The <=10-second clustering flag is a workflow diagnostic, not a validated response-exclusion rule.")
    display(joined[["participant_id", "form_block", "condition", "form_time", "minutes_after_block_end", "seconds_since_previous_form", "after_next_block_start", "clustered_submission", "timing_review"]])
    print("Flagged participants:", ", ".join(sorted(joined.loc[joined.timing_review, "participant_id"].unique())) or "None")
    return joined


def analyze_questionnaire(pfs, joined, display):
    item_summary = pd.DataFrame({"item": PFS_ITEMS, "n_valid": [pfs.loc[pfs.valid_items, item].count() for item in PFS_ITEMS],
        "mean": [pfs.loc[pfs.valid_items, item].mean() for item in PFS_ITEMS],
        "median": [pfs.loc[pfs.valid_items, item].median() for item in PFS_ITEMS],
        "responses_1_to_3": [pfs.loc[pfs.valid_items, item].le(3).sum() for item in PFS_ITEMS]})
    display(item_summary)
    dimensions = ["absorption", "effortless_control", "intrinsic_reward"]
    sensitivity = []
    for label, subset in [("All linked responses", joined), ("Timing-review rows set aside (sensitivity only)", joined.loc[~joined.timing_review])]:
        for dimension in dimensions:
            sensitivity.append({"scope": label, "dimension": dimension, "n_forms": subset[dimension].count(),
                "n_participants": subset.loc[subset[dimension].notna(), "participant_id"].nunique(), "mean": subset[dimension].mean(), "median": subset[dimension].median()})
    display(pd.DataFrame(sensitivity))

    participant_count = joined.participant_id.nunique()
    fig, axes = plt.subplots(1, participant_count, figsize=(max(4, 3.7 * participant_count), 3.8),
                             sharey=True, squeeze=False)
    axes = axes[0]
    for ax, (pid, subset) in zip(axes, joined.groupby("participant_id")):
        values = subset.set_index("form_block")[dimensions]
        for dimension, color in zip(dimensions, ["#697a89", "#31877b", "#d69c42"]):
            ax.plot(values.index, values[dimension], marker="o", color=color, label=dimension.replace("_", " "))
        ax.set(title=pid + (" • timing review" if subset.timing_review.any() else ""), xticks=[1,2,3], xlabel="Experimental block position", ylim=(1,7))
    axes[0].set_ylabel("Descriptive item-group mean (1–7)")
    axes[0].legend(fontsize=8, frameon=False, loc="lower left")
    fig.suptitle("Questionnaire profiles to guide follow-up questions; no efficacy comparison", y=1.02)
    fig.tight_layout(); plt.show()
