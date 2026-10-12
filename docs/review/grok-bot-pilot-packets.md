# Offline Grok Bot pilot handoff

The Grok Bot handoff generator packages the existing eighteen synthetic liveabit Skill cases, portable operational guidance and a human setup note. It prepares a later interpretation review in the user's existing Bot. [ADR-0012](../decisions/0012-grok-bot-direct-webhook-priority.md) now prioritizes the direct routine webhook; its production [profile draft](../integration-drafts/grok-bot-profile.md) remains disabled, with actual account access unverified; this generator implements no adapter or receiving endpoint. The [target decision](../decisions/0011-grok-bot-first-integration.md) preserves the earlier ChatGPT dots research.

Run from the project:

```text
node scripts/prepare-grok-bot-pilot.mjs
```

The command creates a new `artifacts/grok-bot-pilot/run-UUID/` directory and prints its location. `--help` describes usage. Other arguments are rejected before output creation and never echoed. There are no output-path, credential, account, device, network or activation options. Fixed source files and generated files are bound by byte counts and SHA-256 hashes. Source and output redirection through symbolic links is rejected, writes are exclusive, and total output including the manifest is limited to eight MiB. Previous runs are preserved.

The handoff contains:

- `agent/liveabit-skill.md`: the existing operational guidance, with its final reviewer-resource paragraph removed using the existing extraction boundary.
- Eighteen opaque `agent/case-NNN.json` files: exactly the existing synthetic interpretation packets, without scenario names, expected outcomes, criteria, review notes or answer-bearing links.
- Eighteen matching `reviewer/case-NNN.json` files: blank observations, with `observed: false` and unanswered outcomes and checks.
- `SETUP.md`: human instructions for a separately authorized handoff, including the account-wide private Skill and cloud computer sharing boundaries.
- `manifest.json`: reviewer-only scenario mapping, event occurrences, evidence limits and source/output bindings.

Keep the setup note, manifest, reviewer files, scenario source and rubric with the reviewer. Do not upload the whole folder. When an actual host review is authorized, share only the operational Skill file to request a private Skill named `liveabit`, or one opaque agent case framed as an explicit synthetic interpretation exercise. There is no required batch of eighteen user trials. The generator submits nothing and does not install the Skill, access an account, invoke a model, read a device, create a routine, open a listener, purchase or upgrade a plan.

Private Skills are shared across the account's Bots according to the [official Skills documentation](https://docs.x.ai/grok-bot/skills-routines-and-automations). The [official cloud computer documentation](https://docs.x.ai/grok-bot/computer-and-apps) also describes shared files, sessions and credentials. The setup note does not assume a Grok Bot installation path, package upload format or isolation between Bots. The user's actual base-plan access remains unverified.

The builder reuses [the existing packet generator](../../src/skill-review-packet.mjs). Duplicate event occurrences and identities remain unchanged; missing pages and partial coverage stay explicit. The deliberately expired case retains its original expiry and evaluation time. Use the original scenarios and [review method](liveabit-skill-review-packets.md) to score an actual observation, keeping all reviewer material away from the Bot. Missing output alone cannot establish evaluated silence.

Offline preparation and a manually supplied synthetic case do not prove authenticated receipt, validated durable consumption, MCP Events compatibility, plan eligibility, monitoring consent, agent evaluation, user-visible output or M2. All runtime and acceptance gates remain false in the manifest. A Bot's assertion of support is not transport evidence. The retained [Grok Bot research](../research/grok-bot-integration-2026-10-08.md) records the earlier MCP Events uncertainty; the [webhook follow-up](../research/grok-bot-webhook-feasibility-2026-10-08.md) documents the selected interface and remaining account-dependent evidence; no bridge or tunnel is introduced by this handoff.
