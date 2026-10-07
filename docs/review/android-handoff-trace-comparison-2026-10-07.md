# Two owned Android handoff traces

Date: **2026-10-07**. Scope: offline comparison of two preserved Android 15/API 35 fixture captures. Their different timestamp groups explain their different native diagnostic results under the unchanged inference policy. The files do not establish why Android returned different groups, a software accuracy improvement or a production timing threshold.

## Evidence and provenance

The historical 0.2.2 [native handoff replay](../../artifacts/android-inspection-replay/runs/12bb1823-eab6-4a1f-80fb-7f080084a585/handoff-result.json) derives its offsets from archived displayed dates. The [bound derivation](../../artifacts/android-inspection-replay/runs/12bb1823-eab6-4a1f-80fb-7f080084a585/derived/evidence.json) explicitly assumes year 2026 and UTC−07:00 because the old display omitted them. Original numeric consent/query/elapsed-clock anchors were unavailable. Its [validation](../../artifacts/android-inspection-replay/runs/12bb1823-eab6-4a1f-80fb-7f080084a585/validation.json) separately confirmed equal historical-trace results from the preserved baseline and current core.

The final 0.2.3 [exact analysis](../../artifacts/android-timing-analysis/run-33410252-cb83-4399-b113-13360bcf7fb6/summary.json) binds complete numeric epoch/type/interval UI records from the [frozen API 35 run](../../artifacts/android-emulator-0.2.3-api35-final/validation.json). Its [actual current-native handoff replay](../../artifacts/android-timing-analysis/run-33410252-cb83-4399-b113-13360bcf7fb6/native-replay-f43309eb-b541-4f47-bdc0-ea241c5d665f/02-screen_handoffs-result.json) reproduces those intervals and arithmetic. The exact trace origin is epoch **1791358175661 ms**; offsets below refer to that trace alone. No display timezone mapping is assumed for its epoch normalization.

Both native replays supply synthetic host authorization/query bounds and paired clocks. Neither reproduces the original Android query batches. The newer capture records actual session/report clock pairs, but its query cursor remains wall-only and original OS-query batch clocks remain unavailable. Manual fixture values and source completeness remain unverified.

## Recorded difference

| Diagnostic | Historical 0.2.2 handoffs | Exact 0.2.3 handoffs |
| --- | ---: | ---: |
| Projected transition records | 14 | 14 |
| Distinct timestamp groups | 12 | 14 |
| Mixed same-time RESUME/PAUSE groups | 2 | 0 |
| Retained closed intervals at final report | 1 | 7 |
| Full trace's retained inferred sum | 32,896 ms | 86,243 ms |
| Comparison wall-window span | 47,364 ms | 48,320 ms |
| Inferred sum clipped to that window | 3,203 ms, partial | 48,228 ms, no discard warning |
| Entered fixture duration | 47,064 ms | 47,856 ms |
| Signed difference | −43,861 ms | +372 ms |

The equal event counts conceal the decisive grouping difference. In the historical trace, mixed same-time groups at offsets **37,138** and **47,979 ms** reset pairing state and erase earlier closed estimates. The native prefix steps show the first erasing interval **[0, 33,475)** and the second erasing **[40,748, 44,366)**. Later unmatched pauses at **40,741** and **51,637 ms** retain the unmatched-pause warning; their steps already have no closed interval left to discard.

The historical final retained interval is **[51,641, 84,537)**. Its intersection with the derived fixture window **[7,480, 54,844)** is **[51,641, 54,844)**, or **3,203 ms**. This explains the severe partial diagnostic without reordering equal-time records or treating the erased intervals as authenticated actual usage.

The newer trace has one record at every timestamp, alternating RESUME and PAUSE. Its six positive PAUSE-to-RESUME separations are **10, 6, 23, 14, 34 and 5 ms**, totaling **92 ms**. Seven inferred closed intervals remain; neither same-time ambiguity nor an unmatched-pause discard occurs. All six separations fall inside its exact fixture window, and remain excluded from the candidate:

```text
48,320 ms wall-window span − 92 ms excluded separations = 48,228 ms candidate
48,228 ms candidate − 47,856 ms entered duration = +372 ms difference
```

That arithmetic explains the recorded positive difference. It does not prove that the fixture input, source wall-clock window or inferred intervals measure complete real use. A positive pause/resume separation also does not attest inactivity.

## Consequence for development

The existing conservative rules reproduce both outcomes. The 0.2.3 changes added provenance and clock safety; they did not relax same-time or unmatched-pause handling. These two captures cannot attribute the grouping variation to Android scheduling, app implementation, an OEM or a specific defect. Repeated controlled exact captures can investigate its frequency while retaining the present policy and explicit partial/unknown results.

Both comparisons remain unverified and ineligible as OAP summaries. Their separately passing workflow gates establish the recorded local UI/lifecycle behavior, not timing accuracy, a lower bound on actual usage, phone/OEM support or M2/M3 completion. API 36 workflow results are recorded separately and contribute no completed result to this API 35 comparison.
