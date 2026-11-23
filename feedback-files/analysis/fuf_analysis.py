"""Shared ingestion and analysis stages for the formative feedback reports."""

from dataclasses import dataclass
from io import BytesIO
import json
from pathlib import Path
import zipfile

import pandas as pd

TABLES = ("blocks", "records", "decisions", "transitions", "tracks")
STATES = ("baseline", "reduced", "elevated")
BLOCK_NUMBERS = (
    "block", "duration_seconds", "records_presented", "validated_records",
    "validated_records_per_minute", "median_il_ms", "median_fped_ms",
    "first_pass_error_rate", "first_pass_accuracy", "median_ttsv_ms",
    "correction_cycles", "correction_cycles_per_validated_record",
    "configured_practice_seconds", "configured_baseline_seconds", "configured_block_seconds",
)
DECISION_NUMBERS = (
    "block", "record_count", "median_il_ms", "median_fped_ms", "first_pass_error_rate",
    "baseline_il_ms", "baseline_fped_ms", "window_start_ms", "window_end_ms",
)


@dataclass
class Exports:
    sessions: pd.DataFrame
    blocks: pd.DataFrame
    records: pd.DataFrame
    decisions: pd.DataFrame
    transitions: pd.DataFrame
    tracks: pd.DataFrame


def read_bundles(archive, source):
    """Yield each session with the CSVs stored alongside its session.json."""
    names = [
        name for name in archive.namelist()
        if not name.endswith("/") and "__MACOSX" not in Path(name).parts
        and not Path(name).name.startswith("._")
    ]
    for name in names:
        if name.lower().endswith(".zip"):
            with zipfile.ZipFile(BytesIO(archive.read(name))) as nested:
                yield from read_bundles(nested, name)
        elif Path(name).name == "session.json":
            folder = name.removesuffix("session.json")
            session = json.loads(archive.read(name))
            tables = {}
            for table in TABLES:
                member = f"{folder}{table}.csv"
                if member in names:
                    tables[table] = pd.read_csv(BytesIO(archive.read(member)))
            yield source, session, tables


def load_exports(archives, *, sort_sources=False):
    """Load round-labelled archives, rejecting repeated session bundles within a round."""
    sessions = []
    frames = {table: [] for table in TABLES}
    for round_name, path in archives.items():
        with zipfile.ZipFile(path) as archive:
            bundles = list(read_bundles(archive, path.name))
        if not bundles:
            raise ValueError(f"No participant exports found in {path}")
        if sort_sources:
            bundles.sort(key=lambda bundle: bundle[0])
        seen = set()
        for source, session, tables in bundles:
            session_id = session.get("id") or session.get("sessionId")
            if not session_id or session_id in seen:
                raise ValueError(f"Missing or duplicate session ID in {round_name}: {source}")
            seen.add(session_id)
            provenance = {"round": round_name, "source_archive": source, "source_zip": Path(source).name}
            sessions.append({**session, **provenance})
            for table, frame in tables.items():
                if "session_id" in frame and not frame.session_id.eq(session_id).all():
                    raise ValueError(f"Session ID mismatch in {source}/{table}.csv")
                frames[table].append(frame.assign(**provenance, session_id=session_id))
    tables = {}
    for name, parts in frames.items():
        populated = [part for part in parts if not part.empty]
        tables[name] = (
            pd.concat(populated or parts[:1], ignore_index=True) if parts else pd.DataFrame()
        )
    return Exports(sessions=pd.DataFrame(sessions), **tables)


def numeric(frame, columns):
    return frame.assign(**{
        column: pd.to_numeric(frame[column], errors="coerce")
        for column in columns if column in frame
    })


def prepare_blocks(blocks):
    blocks = numeric(blocks, BLOCK_NUMBERS)
    status = blocks.get("attempt_status", pd.Series(pd.NA, index=blocks.index))
    blocks = blocks.assign(attempt_status=status)
    completed = blocks.loc[status.isna() | status.eq("completed")].copy()
    restarted = blocks.loc[status.eq("interrupted_restart")].copy()
    completed["segment"] = completed.block.map({0: "Practice", 1: "Silent Baseline"}).fillna("Experimental")
    adaptive = completed.loc[completed.condition.eq("Adaptive music")].copy()
    return blocks, completed, restarted, adaptive


def waiting_for_records(decisions):
    return decisions.reason.str.contains("waiting", case=False, na=False)


def prepare_decisions(decisions, minimum_records=None):
    decisions = numeric(decisions, DECISION_NUMBERS)
    if minimum_records is None:
        return decisions
    return decisions.assign(
        eligible=decisions.record_count.ge(minimum_records),
        il_ratio=decisions.median_il_ms / decisions.baseline_il_ms,
        fped_ratio=decisions.median_fped_ms / decisions.baseline_fped_ms,
        retained_while_waiting=waiting_for_records(decisions),
    )


def eligibility_summary(decisions, *, include_waiting=False):
    columns = {
        "evaluations": ("eligible", "size"),
        "eligible_evaluations": ("eligible", "sum"),
    }
    if include_waiting:
        columns["retained_while_waiting"] = ("retained_while_waiting", "sum")
    columns["mean_records_in_window"] = ("record_count", "mean")
    summary = decisions.groupby("participant_id", as_index=False).agg(**columns)
    return summary.assign(eligible_percent=100 * summary.eligible_evaluations / summary.evaluations)


def state_counts(decisions, keys=("participant_id",), *, states=None):
    counts = decisions.groupby([*keys, "selected_state"]).size().unstack(fill_value=0)
    return counts if states is None else counts.reindex(columns=list(states), fill_value=0)


def reason_counts(decisions):
    return (decisions.groupby(["participant_id", "reason"], as_index=False).size()
            .sort_values(["participant_id", "size"], ascending=[True, False]))


def participant_state_activity(decisions):
    """Count non-waiting selections and entries into a different recorded state."""
    keys = ("round", "participant_id")
    selections = decisions.loc[~waiting_for_records(decisions)]
    entries = selections.loc[
        selections.previous_state.notna()
        & selections.previous_state.ne(selections.selected_state)
    ]
    participants = decisions.groupby(list(keys)).size().index
    return pd.concat({
        "Rule selections": state_counts(selections, keys, states=STATES).reindex(participants, fill_value=0),
        "State entries": state_counts(entries, keys, states=STATES).reindex(participants, fill_value=0),
    }, axis=1)


def elevated_condition(decisions, il_multiplier, fped_multiplier, max_error_rate):
    return (
        decisions.il_ratio.le(il_multiplier)
        & decisions.fped_ratio.le(fped_multiplier)
        & decisions.first_pass_error_rate.le(max_error_rate)
    )


def simulate_elevated(decisions, candidates):
    def summarize(candidate):
        minimum = candidate["minimum_records"]
        error_rate = candidate["max_error_rate"]
        il = candidate.get("il_multiplier", candidate.get("speed_cutoff"))
        fped = candidate.get("fped_multiplier", candidate.get("speed_cutoff"))
        eligible = decisions.loc[decisions.record_count.ge(minimum)]
        selected = elevated_condition(eligible, il, fped, error_rate)
        return pd.Series({
            "eligible_evaluations": len(eligible),
            "would_select_elevated": int(selected.sum()),
            "elevated_percent_of_eligible": 100 * selected.mean() if len(eligible) else 0,
            "participants_reaching_elevated": ", ".join(sorted(eligible.loc[selected, "participant_id"].unique())) or "None",
        })
    return pd.concat([candidates, candidates.apply(summarize, axis=1)], axis=1)


def prepare_transitions(transitions, duration_column):
    transitions = numeric(transitions, ("block", "started_ms", "completed_ms", "configured_crossfade_ms"))
    return transitions.assign(**{duration_column: transitions.completed_ms - transitions.started_ms})


def direct_extreme_changes(decisions):
    extremes = ("reduced", "elevated")
    return (
        decisions.previous_state.isin(extremes)
        & decisions.selected_state.isin(extremes)
        & decisions.previous_state.ne(decisions.selected_state)
    )
