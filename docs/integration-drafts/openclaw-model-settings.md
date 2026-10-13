# Choose the model in OpenClaw

Updated: **2026-10-13**. Models and thinking levels belong to the user. liveabit activity/task setup and WhatsApp setup preserve them. The dedicated **liveabit** agent is explicitly configured as **openai/gpt-6.1-sol** with **medium** thinking. Its canonical conversation follows those defaults after clearing its old session overrides; [local configuration result](../../artifacts/openclaw/liveabit-model-selection.json). Main's existing model choice remains unchanged.

Use OpenClaw's Models settings to inspect the available choices. A chat model picker can affect only the active conversation; a pinned conversation can override an agent's configured default. Provider access stays in OpenClaw. Android stores neither model configuration nor provider credentials. See the installed release's [model-selection documentation](https://github.com/openclaw/openclaw/blob/v2026.9.9/docs/concepts/models.md) and the requested [Sol 6.1 model documentation](https://developers.openai.com/api/docs/models/gpt-6.1-sol).

The [model helper](../../scripts/set-openclaw-model.ps1) applies your explicit choice to the selected existing agent and clears that agent's canonical conversation model/thinking overrides so it follows its defaults:

```powershell
.\scripts\set-openclaw-model.ps1 -AgentId liveabit -Model openai/gpt-6.1-sol -Thinking medium
```

Use `-AgentId main` to change main instead; omitting AgentId retains the helper's historical main default. Configure another provider inside OpenClaw before selecting it here. Use the exact catalog model ID and its supported thinking level. The helper verifies catalog availability, preserves provider/authentication profiles and authored fallback order, backs up configuration and retains conversation identity. It neither invokes a model nor chooses one automatically for activity.

A saved preference, catalog entry, inherited session configuration and completed model run are distinct evidence. If resolution cannot be verified, inspect OpenClaw's model/session settings before sending another event. Task-aware runtime evidence belongs in the [current review](../review/openclaw-task-aware-2026-10-13.md).

Earlier main-agent configuration and the [successful operator run](../../artifacts/openclaw/model-choice-verification.json) remain the **2026-10-11 main-agent baseline**. That run confirmed matching requested/effective/response Sol 6.1 and retained conversation identity. Medium was verified inherited configuration; telemetry did not directly report reasoning effort. This historical run is not proof of the dedicated agent's current execution.

## Next steps

Development can continue independently with the user-selected dedicated model. No model approval, account purchase or phone action is required. Future model changes remain the user's choice.
