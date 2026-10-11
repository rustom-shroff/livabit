# Offline liveabit Skill review packets

The packet generator prepares the existing synthetic interpretation scenarios for a later review in the user's existing agent. It does not send a packet, authenticate delivery, invoke a model, access a device or account, enable a profile, or satisfy M2. Selecting ChatGPT dots elsewhere does not make preparation an observed dot evaluation.

Run from the project:

```text
node scripts/prepare-skill-review.mjs
```

The command creates a new `artifacts/liveabit-skill-review/run-UUID/` directory and prints its project-relative location. It accepts no output path and never replaces a previous run. Generated artifacts remain outside the tracked source tree.

Each case has an opaque numbered file in `agent/` and a matching blank observation in `reviewer/`. The manifest maps case numbers to the original [scenario IDs](../../skills/liveabit/references/scenarios.json), records every event occurrence and page identity, and binds generated files and fixed inputs with byte counts and SHA-256 hashes. Duplicate events remain duplicated with their original identities; missing pages remain missing. The deliberately expired case retains its original expiry and evaluation time.

For a separately authorized evaluation, supply only the appropriate `agent/` packet to the agent. It contains the operational Skill guidance, unchanged synthetic events, synthetic host facts, evaluation time and invocation. Direct questions and the duplicate case's prior evaluation fact are included when applicable. Scenario names, expected outcomes, criteria, review notes and the Skill's final reviewer-resource paragraph are excluded. Keep the manifest, reviewer files, scenario source and rubric with the reviewer. These files are review inputs; they do not establish the authenticated receiver or validated ledger required by the Skill's real integration premise.

Each reviewer file begins with `observed: false`; outcome, message count, uncertainty and critical checks are unanswered. The existing [scoreReview helper](../../skills/liveabit/scripts/score-review.mjs) accepts that file with the corresponding original scenario and reports `unobserved`. Change `observed` only after an actual observation and complete every required field using [the rubric](../../skills/liveabit/references/evaluation.md). Setting `observed: true` while fields remain blank is rejected. A lack of visible output alone does not establish evaluated silence. The scorer's result remains a supplied-observation verdict, with the real-host gate false.

The generator fails if fixed inputs are invalid, the operational/reviewer boundary in the Skill is missing, or the output directory redirects through a symbolic link. Preparation leaves native delivery profiles and receiver behavior unchanged. Actual host eligibility, authenticated receiving, interpretation and output remain separate work.
