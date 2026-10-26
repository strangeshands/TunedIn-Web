# Pilot Study v1: app-improvement summary

Scope: 3 participants, 9 completed experimental blocks, 9 PFS responses; historical build pilot-1.0.1.

## Main findings

- Raw-event checks found 0 flagged sequence/pairing/timing/presentation issues; record-field mismatches: 0; block-measure mismatches: 0. These checks cover the supplied exports, not every failure mode.
- Completed experimental blocks: 9; saved durations: [300] seconds. 26 adaptive evaluations were exported; 2 were at/after the nominal duration boundary. Strictly in-block counts: {'PIL001': 8, 'PIL002': 8, 'PIL003': 8}.
- All 13 logged track transitions reported playback success, with durations 5.018–5.047 seconds. Logs do not establish subjective smoothness.
- Questionnaire timing requires clarification for PIL003. Their scores are preserved and flagged; confirm form time zone and whether researchers entered answers in a batch.
- PIL003’s form submissions were at 19:51:17, 19:51:20, and 19:51:23 on 17 October 2026 (Asia/Manila assumed), after the final block ended at 19:39:47. This can reflect delayed responses OR later researcher data entry; the files cannot distinguish them.
- No claim about support for flow, condition superiority, or statistical effectiveness is made.

## Prioritized changes

### P2: Calibration quality visibility

**Evidence:** Calibration first-submitted sample sizes: {'PIL001': 18, 'PIL002': 11, 'PIL003': 12}.

**Change / follow-up:** Log sample size, missing measures, interruption status and reference medians for researchers. Review practice-to-calibration consistency; retest an extension/repeat policy only when calibration quality is inadequate.

**Retest:** Empty, interrupted and unusually sparse calibration attempts cannot silently supply missing/invalid references; researcher guidance explains the next step.

### P2: Task repetition and perceived reward

**Evidence:** The 'experience rewarding' item was rated 1–3 in 7/9 valid responses; PFS is not a direct usability diagnosis.

**Change / follow-up:** Ask participants whether repetition, task purpose, correction friction or audio explains their ratings. Retain modest, block-specific completion feedback and optional practice; the later streak changes need their own retest and cannot be evaluated from these exports.

**Retest:** Collect brief comments after the questionnaire and verify that feedback is consistent across conditions and does not interrupt entry or prime the post-block ratings.

## Baseline calibration results

### Baseline results in plain language

Across 3 completed silent calibration blocks (6 total minutes), participants saw **44 records**, submitted **41 distinct records**, and successfully validated **41 records**.

- **PIL001:** 19 presented; 18 submitted; 18 validated; 18 correct on the first attempt; 0 first-pass rejections; 0 correction cycles. Reference IL **0.746 s** and FPED **5.515 s**, each based on 18/18 available records respectively.
- **PIL002:** 12 presented; 11 submitted; 11 validated; 9 correct on the first attempt; 2 first-pass rejections; 2 correction cycles. Reference IL **1.021 s** and FPED **7.775 s**, each based on 11/11 available records respectively.
- **PIL003:** 13 presented; 12 submitted; 12 validated; 12 correct on the first attempt; 0 first-pass rejections; 0 correction cycles. Reference IL **1.148 s** and FPED **7.650 s**, each based on 12/12 available records respectively.

There were 3 presented-but-unsubmitted records and 0 submitted-but-unvalidated records. A final record shown at a timed cutoff is not automatically evidence of data loss.

**App implication:** retain and export the calibration record counts alongside each person's reference values. These three sessions alone do not justify lengthening the two-minute baseline or changing adaptive thresholds.

## Experimental-block completed records

Completed records are distinct records eventually accepted, including corrections. Practice and silent baseline are excluded. Each experimental block lasted five minutes.

| Participant | No music | Static music | Adaptive music | Total |
| --- | ---: | ---: | ---: | ---: |
| PIL001 | 36 | 42 | 40 | 118 |
| PIL002 | 25 | 27 | 28 | 80 |
| PIL003 | 36 | 33 | 33 | 102 |
| **Total** | 97 | 102 | 101 | **300** |

### Observed timing as an additional basis for 15 calibration records

These times come directly from raw validation events, not from scaling whole-block throughput.

| Participant | Main block | Condition | Completed in first 120 s | Seconds to complete record 15 |
| --- | ---: | --- | ---: | ---: |
| PIL001 | 1 | No music | 14 | 120.041 |
| PIL001 | 2 | Static music | 16 | 112.596 |
| PIL001 | 3 | Adaptive music | 15 | 115.468 |
| PIL002 | 1 | Static music | 11 | 162.324 |
| PIL002 | 2 | Adaptive music | 11 | 161.398 |
| PIL002 | 3 | No music | 11 | 172.931 |
| PIL003 | 1 | Adaptive music | 12 | 141.237 |
| PIL003 | 2 | No music | 15 | 119.515 |
| PIL003 | 3 | Static music | 13 | 133.980 |

Across the nine main blocks, participants completed **25–42 records per five minutes**, for **300 completed records** in total. The 15th record was completed after **112.6–172.9 seconds** (median across blocks **134.0 seconds**). These nine blocks are repeated observations from three participants, not nine independent participants.

**Baseline-design implication:** a 15-record silent calibration remains a reasonable next-pilot candidate. The main-block observations show that 15 records were achievable, and indicate a plausible workload/time range. However, these blocks occurred after practice/calibration and used different auditory conditions, so their times cannot establish how long a new 15-record silent baseline will take or whether its timing medians will be stable. The directly measured two-minute baseline counts remain 18, 11, and 12 for PIL001, PIL002, and PIL003. Retest the 15-record baseline itself, record actual elapsed time, and inspect how IL/FPED medians change as records accumulate.

## Limits and sources

Three participants provide a pilot diagnostic, not a causal or inferential study. There are no free-text interviews, field-level keystroke traces, PFS form-open timestamps, or immutable full historical rule settings in these supplied files. Incorrect-field classification uses later accepted values from the same record. PFS timing flags use Asia/Manila as the form time zone; confirm that assumption.

Inputs (relative to the repository): `feedback-files/results/pilot-study-v1.zip` and `feedback-files/results/pilot-study-v1-pfs.csv`. Original supplied filenames were `Pilot Study v1 Results.zip` and `Tuned In - Post-Block Form (Responses) - Form Responses 1.csv`. Source hashes are retained in the notebook. PFS grouping/scoring follows the supplied thesis Appendix E.1, without efficacy testing.

The notebooks and this summary do not modify the app or the raw inputs. The notebook contains calculations and results only; interpretation and recommendations are kept in this separate Markdown file. Re-running the notebook recalculates the evidence; update this summary if the source inputs change.