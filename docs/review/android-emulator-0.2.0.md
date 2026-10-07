# Historical Android 0.2.0 emulator run

Date: **2026-10-06**. Result: **incomplete runtime validation: six cases recorded pass, the seventh failed in UI automation, and later workflows were not reached**. This run does not satisfy the emulator-first gate for a personal phone trial. Inspector 0.2.1 requires its own complete run; an earlier build, partial emulator result or qualitative phone report cannot substitute for it.

## Exact builds and preserved evidence

The [versioned native audit](android-local-inspector-0.2.0-validation.json) and [versioned runtime report](android-emulator-0.2.0-validation.json) identify these exact installed bytes:

| Package | Version | SHA256 |
| --- | --- | --- |
| `org.liveabit.inspect` | `0.2.0-local` | `3033c78a20b1e6761c7a656a66732b005642b7e6b4652f30854d35912176ec4a` |
| `org.liveabit.fixture` | `0.1.0-fixture` | `28ea22850e7224a5a959c9d614af07f0b76674655db51b96bc0d94ee79e04b46` |

The final attempt ran on the dedicated account-free Android 15/API35 x86_64 AOSP image, revision 2, using emulator 37.2.12, existing WHPX and software graphics. Its build fingerprint was `Android/sdk_phone64_x86_64/emu64x:15/AE3A.240806.019/12368160:userdebug/test-keys`. The recorded attempt began at 20:07:09 UTC and ended at 20:26:31 UTC on October 6. These UTC times identify the machine report; the corresponding local date is also October 6.

[Raw final output](../../artifacts/android-emulator-0.2.0-test/raw-final-validation.json) is preserved byte-for-byte with SHA256 `7df2a1a060f70566fb063a3f60d182e904f57e2974348b9fc4a685a5866d470c`. The [archived harness source](../../artifacts/android-emulator-0.2.0-test/attempts/04-harness-source.mjs) matches its recorded SHA256 `c562615e32b101628e058dfaa64482bd71875062c888cc29f4abfaba411f5b1f`. Earlier automation attempts under `artifacts/android-emulator-0.2.0-test/attempts/` remain separate evidence; their outcomes were not merged into the final attempt.

The versioned review JSON relocates only 59 UI reference occurrences into the archived UI directory `artifacts/android-emulator-0.2.0-test/` and adds raw-report/harness provenance. Recorded results, numbers, timestamps and non-UI references are unchanged. Its embedded startup provenance retains the original record/hash; the unversioned startup file may describe a later run and should not be treated as the historical file's unchanged contents.

## Executed cases

The final attempt recorded passing assertions for fresh stopped launch and denied/empty-scope Start; a real stock Settings grant that did not start a session; invalid selection and successful owned-fixture system-picker selection; exclusion of pre-consent observations and unknown empty output; and the two controlled comparisons below. Repeated inspection retained a stable record count in both comparisons. Only the deliberately selected fixture appeared in the inspected package output.

| Scenario | Window length | Fixture resumed union | Clipped retained estimate | Signed difference | Fixture callbacks / retained source transitions |
| --- | ---: | ---: | ---: | ---: | --- |
| Idle | 53,232 ms | 53,233 ms | 53,232 ms | −1 ms | 0 / 2 |
| Six internal screen handoffs | 44,266 ms | 43,845 ms | 9,984 ms | −33,861 ms | 12 / 14 |

The idle interval includes UI automation overhead beyond the requested approximately 30-second wait. Paired clock samples produced the one-millisecond difference between wall-window length and the fixture's elapsed-clock union. This single comparison is diagnostic evidence, not a measured production accuracy result.

The screen-handoff result is a **partial retained estimate**, not successful reconstruction of the entire fixture interval. Android returned transitions sharing a millisecond; the collector's conservative ambiguity handling discarded earlier estimates and also reported an unmatched pause. Its general diagnostics disclosed those reasons. The optional comparison panel displayed the clipped retained total without carrying those specific discard reasons beside the difference, making a substantial partial result easier to misread. This finding prompted the minimal 0.2.1 clarity update. It does not justify inventing missing intervals, joining real handoff gaps or treating either candidate duration as complete source coverage. The runtime case's recorded pass checks workflow, filtering, arithmetic and conservative labels; its `production_accuracy_pass` remains false.

## Failure and untested workflows

The seventh case, `comparison_validation_and_input_erasure`, failed with `Input was not found: Fixture callback duration (milliseconds)`. Its [failure hierarchy](../../artifacts/android-emulator-0.2.0-test/0256-comparison-validation-and-input-erasure-failure.xml) shows Android's launcher rather than the inspector. An unconditional Back used while dismissing an input method is a plausible automation cause; this output does not establish a comparison-input product defect. The harness requires a corrected navigation/input sequence and another complete run.

The remaining Stop/fresh-horizon/process-restart, revocation/rapid-regrant and persistent-clear/fixture-clear workflows were not reached in this attempt. The failed comparison case cannot be credited as complete even if earlier actions within it occurred. Pre-unlock credential storage, rotation, split-screen/multi-resume, clock mutation, record overflow, expiry, deterministic source races, physical/OEM behavior, battery/background quality and direct agent delivery also remain outside this evidence.

Both APKs retained their local diagnostic scope. This historical run establishes neither a complete runtime pass nor physical-device accuracy, complete acceptance-case coverage, M2 or M3. Agent selection and Linux remain deferred. The [current emulator plan](android-emulator-plan-2026-10-06.md) governs the full 0.2.1 rerun before any personal trial recommendation.
