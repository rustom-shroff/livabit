# Meta Muse connection preparation

Date: **2026-10-08**. Status: **selected target; protected local setup foundation implemented; authorized account discussion completed; no supported native receiving path found in the inspected interfaces**.

[ADR-0013](../decisions/0013-meta-muse-first-integration.md) selects the user's existing Meta Muse. Official sources confirm free usage with limits; they do not establish a general inbound webhook. The [research record](../research/meta-muse-webhook-feasibility-2026-10-08.md#authorized-direct-account-inspection) now includes two authorized messages in the existing account. Muse inspected its schemas/docs and reported no supported external route with Android authentication or artifact-action-to-agent wake wiring. The visible activity trace corroborates inspection, not live receiving behavior. Its earlier backend/broker suggestions violate the no-intermediary requirement. No Grok header, endpoint or response rule is assumed to apply to Muse.

## What is available now

The [local readiness command](../../scripts/prepare-meta-muse-connection.mjs) reports whether the native interface is verified. Run it from the project with:

```text
node scripts/prepare-meta-muse-connection.mjs
```

It accepts no connection arguments or configuration files and uses no account, model or network. It currently reports `credential_entry_enabled: false` and `dispatch_enabled: false`. It stops before requesting any connection secret. Passing an unexpected argument returns a fixed error without printing that argument. This is a readiness check, not an enabled Muse adapter or completed account pairing. Its fixed `actual_host_accessed: false` describes this isolated preparation implementation; it does not inspect browser state or override the separately observed authorized account conversation.

The [hidden input primitive](../../src/experimental/protected-local-input.mjs) and [ephemeral draft](../../src/experimental/meta-muse-connection.mjs) are implemented for a later verified setup. Their tests use synthetic material only. The input requires an exclusive interactive terminal, suppresses echo, rejects oversized/control/multiline input and restores terminal state on success, cancellation, timeout and errors. It keeps raw input during a 100 ms quiet drain, capped at 500 ms, to catch fragmented paste tails. **Input arriving after the bounded drain and terminal restoration is outside this reader's capture window; arbitrarily delayed paste tails are not guaranteed to remain hidden.** No real credential entry is currently enabled.

An opaque draft retains at most 8 KiB in a private RAM buffer for at most fifteen minutes. Cancellation, expiry, detected clock rollback, disposal or the refused attempt clears that owned buffer and its timer. The draft exposes no credential getter, dispatch callback or network path; review shows only non-secret lifecycle metadata. An attempted unsupported connection consumes local attempt authority and erases the draft. A local deadline is not provider credential expiry. Buffer clearing and dropping references do not guarantee erasure of all JavaScript strings, terminal buffers or OS memory.

No durable OS keystore, protected persistent pairing, OAP sharing grant, background sender or Android integration is implemented by these primitives. Existing `JsonStore` is not used for secrets. A future persistent setup needs separately verified OS secure storage; plaintext project files or a platform-independent file mode are insufficient Windows protection.

## Information needed to complete the native connection

The actual Muse documentation or supported account setup must establish:

- A provider-owned receiving destination bound to the intended existing Muse agent and available on its free account.
- The HTTP method, native authentication, body format, size limits and response meaning.
- Credential issuance, expiry/rotation/revocation, duplicate handling, rate limits and free usage behavior.
- What starts a run, how to inspect it and what stopping a local send can actually cancel.

A valid public TLS certificate alone does not prove Meta owns a destination. If the native endpoint embeds a secret in its URL, hide the whole URL and explicitly review that native authentication difference from [OAP authorization](../../specs/protocol/authorization.md#a6-secrets-integrity-and-failure-states); do not silently relax the existing direct profile. Do not put URLs, headers or keys in chat, source, command-line arguments, logs or reviewer artifacts.

Once those facts are established, implement the exact native request and a separately classified result, bind the protected setup to the chosen destination, test it against an owned final TLS mock, and conduct one synthetic live trial. Receipt, validated consumption, agent evaluation and visible output stay separate. Neither HTTP 200 nor arbitrary 2xx is currently interpreted as Muse acceptance. No automatic retry follows uncertain delivery. The [retained Grok probe](../../src/experimental/grok-webhook-probe.mjs) remains historical groundwork with its own documented semantics.

## Continuing development

The local foundation and tests required no account input. The authorized direct Muse discussion is now complete; repeating the request to sign in or ask Muse the same question is not a remaining prerequisite. Actual dispatch and full pairing need a supported direct receiving contract that the inspected interfaces did not supply. Internal hooks can wake a worker from already-present local state according to Muse, but do not create external admission. Do not develop an artifact receiver against undocumented URLs, browser session replay or unverified storage/wake wiring. Muse remains selected, with credential entry and dispatch disabled, until new platform evidence or a user target decision. No phone test or approval can resolve this missing interface. No purchase, subscription upgrade or paid API replacement is part of this route.

The accepted Android inspector and APKs remain unchanged and local-only. Linux and further precision/coverage proof remain deferred. No relay, hosted webhook broker, mailbox or forwarding machine is introduced. M2/M3 remain unproven; any future changed APK proposed for a phone trial must first pass its exact-byte emulator checks.
