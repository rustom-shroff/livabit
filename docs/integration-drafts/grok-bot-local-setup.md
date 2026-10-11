# Grok Bot protected local setup

Date: **2026-10-08**. Status: **local ephemeral setup for the single-attempt synthetic probe; real account setup and production pairing remain unverified**. Grok is again the selected target under [ADR-0014](../decisions/0014-resume-grok-bot-direct-webhook.md). The user has no Grok Bot yet; no subscription is needed for local development. See the [current plan/webhook refresh](../research/grok-bot-plan-and-webhook-refresh-2026-10-08.md).

## Local implementation

The [session module](../../src/experimental/grok-webhook-connection.mjs) joins the retained [hidden reader](../../src/experimental/protected-local-input.mjs) to the existing [synthetic probe](../../src/experimental/grok-webhook-probe.mjs). It admits only a trusted operator-reviewed setup: exact endpoint digest, recent review time and affirmative assertions of the existing Bot, eligible routine access, intended routine, provider-owned exact destination and on-demand-disabled setting. These assertions are not automated provider verification; setting booleans or possessing a public TLS certificate cannot establish account eligibility or provider ownership.

The hidden endpoint is bounded and must match the previously reviewed digest before the key prompt appears. The key is bounded and never echoed. No caller-supplied activity is accepted. The session holds endpoint/key in private RAM buffers, exposes safe metadata only, and requires explicit authorization tied to its session before one synthetic attempt. The local expiry is at most fifteen minutes, bounded by the original review and capture/session lifetime. Expiry, clock rollback, cancellation, disposal and completion clear the owned buffers; cancellation also aborts pending work. One attempt consumes authority before transport guards. A possibly submitted request requires reconciliation before any resend; this module does not perform reconciliation.

Credential copies used transiently by JavaScript/HTTPS are not guaranteed erased. The hidden reader's bounded paste drain cannot hide arbitrarily delayed input after terminal restoration. This is an expiring local test connection, not durable OS-protected storage, provider key expiry or production consent. No background sender, collector networking, persistent secret file or account permission is introduced.

## Readiness command and account gate

```text
node scripts/prepare-grok-webhook-connection.mjs
```

The [command](../../scripts/prepare-grok-webhook-connection.mjs) is a local readiness check. It accepts no secret arguments, files or environment configuration; it does not prompt for credentials or contact an account. Unexpected arguments are rejected without reflection. A live CLI is not exposed while the exact provider destination and actual account are unverified. The module can be exercised by a trusted reviewed driver against owned mocks; mock observations remain explicitly test evidence.

The future account check should inspect the existing Bot's actual Webhook fields and included/trial access before any purchase-dependent trial. Do not copy a URL, key or full authorization header into chat, source, command-line arguments or review logs. The official guide provides no hostname allowlist; no hostname is guessed. Review the exact destination and native recipient first, then enter connection values locally through the protected flow. Do not use browser-cookie replay, a third-party relay, an API-built replacement agent or a running forwarding desktop.

## Result boundaries

The native probe reports possible body submission and exact HTTP status. HTTP 200 is the documented accepted/run-start report, not completed coaching, durable OAP admission or validated consumption. A lost acknowledgement after possible submission is uncertain, and no outcome enables automatic retry. Local cancellation does not prove remote cancellation. Synthetic page recipient identifiers are fixtures and do not authenticate the account's actual Bot identity.

[Production gate](grok-bot-profile.md), [pilot scope](grok-bot-webhook-pilot.md), [current review](../review/grok-bot-resumption-2026-10-08.md) and the original OAP consent/receipt requirements remain separate. Receiver admission/ledger, actual Bot evaluation, protected persistent pairing and Android production delivery still need evidence. No existing Android APK changes; future changed phone-trial APKs require exact-byte emulator testing.

## Next steps

Local tests and review can proceed independently. A later live attempt needs the actual account/trial, exact native destination/routine and protected key entry. No approval, subscription purchase or phone testing is required for the local work. The documented entry-plan inference should be checked against the trial UI before the user pays; no account eligibility is claimed observed.
