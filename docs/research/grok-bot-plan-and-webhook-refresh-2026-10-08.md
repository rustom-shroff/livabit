# Grok Bot plan and native webhook refresh

Date: **2026-10-08**. Status: **Grok Bot direct routine webhook resumed by the user; no account or subscription yet; local development can proceed without a purchase**. Preserve the earlier Grok findings and the completed Muse investigation as dated history. [ADR-0014](../decisions/0014-resume-grok-bot-direct-webhook.md) records the target change.

## What the provider documents

Official x.ai documentation identifies the personal Grok Bot and links Cursor account/billing documentation: [overview](https://docs.x.ai/grok-bot/overview), [settings](https://docs.x.ai/grok-bot/settings-and-notifications). The Cursor sources below therefore concern the selected product.

| Question | Current primary-source finding |
| --- | --- |
| Entry paid plan | Cursor Pro includes Grok Bot. The current public price is USD 20/month before applicable tax. [Pricing](https://cursor.com/pricing), [Bot plan eligibility](https://cursor.com/help/grok-bot/plans) |
| Grok subscriptions | Linked individual standard SuperGrok qualifies; SuperGrok Lite does not include Grok Bot. A generic cheapest Grok subscription must not be assumed eligible. [Plans](https://cursor.com/help/grok-bot/plans) |
| Webhook capability | A routine can use a provider-issued POST URL and bearer key, accept JSON and start the existing Bot. Exact HTTP 200 reports acceptance/run start, not completion or validated OAP consumption. [Routine webhook guide](https://cursor.com/help/grok-bot/routines) |
| Base-plan webhook entitlement | Pro access plus the generally documented webhook feature support availability on Pro; the guide states no higher-tier requirement. This is an inference across official documents, not an observed account entitlement or a guarantee for every region/account. |
| Before purchasing | A usage-credit trial has a seven-day window and does not automatically become paid. Webhook access on that trial is not separately promised; inspect the actual routine fields before relying on it. [Trial and billing](https://cursor.com/help/grok-bot/plans) |
| Usage | Runs spend usage. With on-demand disabled, exhaustion stops work; a spending cap is not a hard stop for a run already underway. Verify included/trial access and on-demand-off status before a live trial. [Billing](https://cursor.com/help/grok-bot/plans), [routine usage](https://cursor.com/help/grok-bot/routines) |

No checked source supplies a receiving hostname/path policy, idempotency guarantee, webhook size/rate budget or key lifetime/rotation contract. Do not infer the webhook origin from the documentation host or substitute an unrelated API. Exact native destination ownership and intended routine require account evidence before credential capture and a live attempt.

The [official October 5 changelog](https://x.ai/changelog/bot) says routine row-click behavior changed. Inspect the actual application instead of promising that clicking a row opens Webhook fields. [Skills and routines](https://docs.x.ai/grok-bot/skills-routines-and-automations) records routine lifecycle/run-history limits; its scheduled interval restriction is not a documented webhook frequency limit. Custom MCP Events remains unverified and unnecessary for this webhook route.

## Development consequence

The user has explicitly reported having no existing Grok Bot yet and wants feature confidence before subscribing. Do not require a purchase to develop or test protected local setup. The [local setup guide](../integration-drafts/grok-bot-local-setup.md) describes a short-lived, one-attempt synthetic session; it does not discover account features, attest ownership automatically or register a production profile. A later account/trial check must establish the actual receiving contract and included access without an upgrade, on-demand spending or intermediary. Android remains unchanged and local-only; M2/M3 remain unproven.
