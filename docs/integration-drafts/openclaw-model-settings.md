# Choose the model in OpenClaw

Updated: **2026-10-11**. The model and thinking level belong to the user. liveabit activity setup and WhatsApp setup preserve them. The requested **Sol 6.1, medium thinking** choice is configured as `openai/gpt-6.1-sol`. The [configuration result](../../artifacts/openclaw/model-config-result.json) confirmed that the retained main conversation follows its defaults. A separate [successful operator agent run](../../artifacts/openclaw/model-choice-verification.json) confirmed the requested/effective/response model and returned its expected marker without changing conversation identity. Medium thinking is verified as saved configuration with no session/hook override and source-confirmed inheritance; run telemetry did not directly report reasoning effort.

Use OpenClaw's **Models** settings to inspect the current account's available choices. Its chat model picker changes the active conversation; use the helper below for main's configured model/thinking. Conversation-specific overrides can affect the effective choice, so changing a default does not necessarily retarget a pinned conversation. See the installed release's [model-selection documentation](https://github.com/openclaw/openclaw/blob/v2026.9.9/docs/concepts/models.md). Keep provider access and model configuration in OpenClaw; the Android app stores neither.

The optional [model helper](../../scripts/set-openclaw-model.ps1) applies an explicit choice to the existing main agent and clears that conversation's model/thinking overrides so it follows main's settings:

```powershell
.\scripts\set-openclaw-model.ps1 -Model openai/gpt-6.1-sol -Thinking medium
```

For later choices, use the exact provider/model ID shown in the available catalog and the supported thinking level. The helper keeps the current provider and authentication profile, checks catalog availability, retains authored fallback ordering, backs up configuration and preserves conversation identity. Configure another provider inside OpenClaw before using it here. It does not invoke a model or choose one automatically for activity events.

If the helper saves settings but cannot verify their effective resolution, check OpenClaw's model and conversation settings before sending another event. A saved preference, an available catalog entry and a completed run are separate evidence.

## Next steps

Model selection is ready for user-controlled changes, and the requested model has a completed-run check. Further development can continue independently; no account purchase or phone action is required.
