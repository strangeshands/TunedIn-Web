"""Trace adaptive rule decisions to successful track changes in archived sessions."""

import pandas as pd


def timing_comparison(value, baseline):
    """Show the recent median and its reference, both in milliseconds."""
    if value is None or not baseline:
        return "Unavailable"
    return f"{value:.1f} / {baseline:.1f} ({value / baseline:.1%})"


def rule_trigger(decision):
    """Explain the archived selection using its logged state and measures."""
    state = decision["selectedState"]
    if state == "reduced":
        triggers = [
            label for current, baseline, label in [
                ("medianInitiationLatencyMs", "baselineInitiationLatencyMs", "IL ≥ 120%"),
                ("medianFirstPassEntryDurationMs", "baselineFirstPassEntryDurationMs", "FPED ≥ 120%"),
            ]
            if decision[baseline] and decision[current] is not None
            and decision[current] >= 1.2 * decision[baseline]
        ]
        if decision["firstPassRecordErrorRate"] > 0.15:
            triggers.append("Error > 15%")
        return " or ".join(triggers) or decision["reason"]
    if state == "elevated":
        return "Both timing cutoffs and the error cap met"
    return "Neither Reduced nor Elevated triggered"


def transition_examples(sessions, *, limit_per_round=3):
    """Sample logged track changes, covering distinct target states first."""
    rows = []
    for session in sorted(sessions, key=lambda row: (row.get("round", ""), row["participantId"])):
        decisions = {decision["id"]: decision for decision in session["musicDecisions"]}
        for transition in session["musicTransitions"]:
            decision = decisions.get(transition["decisionId"])
            if (
                transition["outcome"] != "playing"
                or decision is None
                or decision["blockNumber"] != transition["blockNumber"]
                or decision["selectedState"] not in ("baseline", "reduced", "elevated")
                or decision["previousState"] == decision["selectedState"]
                or not transition["selectedTrackId"]
                or transition["selectedTrackId"] == transition["previousTrackId"]
                or any(decision[key] != transition[key] for key in ("previousTrackId", "selectedTrackId"))
            ):
                continue

            rows.append({
                "Round / pilot": session.get("round", session["buildVersion"]),
                "Participant": session["participantId"],
                "Decision → playback log": f'B{decision["blockNumber"]} · {decision["id"]} → {transition["id"]}',
                "Records": decision["recordCount"],
                "IL recent / baseline (ms)": timing_comparison(
                    decision["medianInitiationLatencyMs"], decision["baselineInitiationLatencyMs"]
                ),
                "FPED recent / baseline (ms)": timing_comparison(
                    decision["medianFirstPassEntryDurationMs"], decision["baselineFirstPassEntryDurationMs"]
                ),
                "First-pass error": f'{decision["firstPassRecordErrorRate"]:.1%}',
                "Trigger": rule_trigger(decision),
                "Track change": f'{transition["previousTrackId"]} → {transition["selectedTrackId"]}',
                "Crossfade (s)": round((transition["completedMs"] - transition["startedMs"]) / 1000, 3),
                "Selected state": decision["selectedState"],
            })

    if not rows:
        return pd.DataFrame()
    examples = pd.DataFrame(rows)
    state_rank = examples.groupby(["Round / pilot", "Selected state"]).cumcount()
    return (
        examples.assign(state_rank=state_rank)
        .sort_values(["Round / pilot", "state_rank"], kind="stable")
        .groupby("Round / pilot", sort=False)
        .head(limit_per_round)
        .drop(columns=["state_rank", "Selected state"])
        .reset_index(drop=True)
    )
