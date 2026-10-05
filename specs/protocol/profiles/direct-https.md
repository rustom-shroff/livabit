# OAP direct receiver profiles, version 1

Status: OAP 0.1.0 agreed at G1 on 2026-10-04. Date: 2026-10-03. The production profile is `direct-https-v1`; explicit variants are `direct-local-tls-v1` and `direct-loopback-test-v1`. These profiles specify OAP-FR-011/012, OAP-NFR-009 and OAP-PR-002/003. Common record, timing and budget semantics are defined in [OAP](../oap.md) and [authorization](../authorization.md). The shipped mock receiver implements the synthetic loopback variant; adapter TLS tests do not establish a deployed production receiver.

## H1. Scope and topology

The user's device sends directly to a receiver inside the chosen agent's existing infrastructure/runtime. The receiver is the destination and may interpret activity using that agent's existing context. No project/liveabit hosted endpoint, activity queue, consent service, shared account, cloud credential, proxy, relay, third-party tunnel or independently maintained user forwarding bridge is required or allowed. Ordinary network routing does not change the application endpoint; adding an activity-forwarding service does.

This is a proposed interoperable OAP receiving interface, not an existing ChatGPT, Claude or Gemini API. M1 implements a final deterministic mock. M2 needs an actual existing personal agent implementing a compatible direct receiver; deploying a separate API coach or forwarder does not qualify. A compatible receiver may implement the interface within its existing runtime without making the project an infrastructure operator.

## H2. Destination configuration

Secure receiver setup supplies one absolute base URL, a supported profile, a scoped expiring bearer credential and its verified receiver/device/recipient binding. The device stores the canonical base URL as a fixed destination. The base MUST end in `/` and have no query, fragment or user-info. Reject ambiguous/invalid encoding, path traversal and a non-canonical origin. Each request target is derived by resolving exactly `capabilities` or `events` beneath that base, never from an event field or response-provided URL.

The client MUST reject every redirect, including same-origin redirects, and MUST NOT forward credentials to another origin or path. Endpoint or peer changes require fresh verified setup and local user approval. Never use a generic chat page or model API URL as an OAP receiver by assumption.

| Profile | Destination and peer policy |
| --- | --- |
| `direct-https-v1` | HTTPS; authenticated receiver identity; public globally reachable addresses only. Reject loopback, private, link-local, reserved, multicast, unspecified and equivalent mapped addresses before connection. Check all resolved addresses and the actual connected peer on every new connection, using a maintained IP classification implementation. |
| `direct-local-tls-v1` | HTTPS to an explicitly paired receiver inside the existing local agent runtime. The setup pins the exact LAN/loopback address set, origin/path and verified peer key/trust anchor. Private addresses are allowed only within this per-recipient allowlist. Rebinding to an unapproved address or replacing the peer key requires re-pairing. |
| `direct-loopback-test-v1` | Isolated simulator only; HTTP to the literal `127.0.0.1` or `[::1]`; bind the mock only on loopback; synthetic credentials; no real usage or personal-agent credentials. MUST NOT be selectable in a production build. |

For cloud destinations, resolve and validate before opening the socket and bind the connection to the validated peer; a second unchecked resolution is insufficient. For local pairing, obtain the trust/key fingerprint through an authenticated user-controlled setup, not by trusting an arbitrary first network response. A paired local trust anchor may replace a public certificate authority, but certificate validity and expected peer identity are still checked. The local exception MUST NOT disable global destination checks or authorize a local forwarding bridge.

## H3. Transport and authentication

Production variants MUST support TLS 1.2 and TLS 1.3, prefer TLS 1.3, verify the expected receiver certificate/identity and use a maintained TLS implementation with secure cipher configuration. SSL/TLS 1.0/1.1, insecure certificate bypass and automatic HTTP downgrade are forbidden. Do not send event requests as TLS 1.3 early data. These choices follow established TLS guidance; they do not invent a cryptographic protocol. [TLS recommendations](https://www.rfc-editor.org/rfc/rfc9325.html), [TLS 1.3](https://www.rfc-editor.org/rfc/rfc8446.html)

Required requests use `Authorization: Bearer <receiver-issued-token>`. The opaque token MUST have at least 256 bits of issuance entropy and be unique to the particular device and recipient. Its finite issued lifetime MUST be known to the device, at most 30 days; 24 hours is recommended. It is permission to reach the receiver, not device consent. The receiving implementation MUST check expiry and the server-side device/recipient binding before accepting a record. Use the standard header form, never a URL parameter or event field. [Bearer token transport](https://www.rfc-editor.org/rfc/rfc6750.html)

The reference profile has no token issuance/refresh HTTP method. The token comes from the receiver's existing authenticated setup and is rotated/reissued there. Before dispatch, that setup must provision the recipient, stream, subscription and scope-revision binding plus receiver-admitted apps/fields/expiry. The device can allocate those prospective local IDs without collecting activity; the user transfers the non-secret binding through the actual receiver setup. A new epoch needs supported re-pairing/update before further sends. This acceptance registry does not authorize device collection or delay offline revocation. Supported host-native OAuth may be specified by a separate verified profile; no OAP/liveabit OAuth server is created. Store the token through a protected local credential handle and omit it from source, diagnostics, crash output and command lines. Keep synthetic fixture tokens visibly separate.

Automatic client retries, redirects and background request replays MUST be disabled or routed through the publisher's consent and budget checks. For each request, impose a bounded timeout: at most 10 seconds to establish the connection and 30 seconds total. A timeout leaves acceptance unknown. Stream/body readers MUST stop at negotiated limits without allocating an unbounded body. Responses MUST NOT become instructions, new destinations or authority grants.

## H4. Capability discovery

`GET {base}capabilities` authenticates the paired credential and returns `200 OK`, `Content-Type: application/json`, `Cache-Control: no-store` and the core receiver-capability record. Its `role` is `receiver`; it declares `supported_versions`, `event_names`, `metrics`, `application_namespaces`, `allowed_fields`, `delivery_profiles`, bounded `limits` and `device_actions_enabled: false`. The client MUST request JSON and accept only an authenticated, schema-valid response of at most 16,384 UTF-8 bytes. No unauthenticated probe authorizes activity export.

Before activation, intersect the exact supported OAP versions, event families, metrics, namespaces, fields, profile and limits with local consent. The selected version is `0.1.0`. An incompatible required capability, weaker receipt semantics, missing family or insufficient negotiated byte/page/rate capacity makes this profile unavailable for the requested scope; do not silently drop approved apps or bypass local limits. Each selected direct profile promises the valid-consumption semantics below; merely returning a generic HTTP success is insufficient. Refreshing capabilities may narrow what is available, but does not widen user approval. A failed discovery does not fall back to a relay or alternate endpoint.

Capabilities describe receiver support. The publisher's recipient filter, subscription, expiry and lifecycle are device-local records under [authorization](../authorization.md). This profile defines no remote `subscribe`, `renew`, read-history or replay-cursor route. Repeated local subscription configuration/renewal uses the core idempotency rules; the host is never asked to approve device consent.

## H5. Event publication and receipts

`POST {base}events` sends exactly one immutable serialized OAP event, with `Content-Type: application/json`, `Accept: application/json` and the authenticated bearer header. Request compression, multipart uploads and wire batches are absent in this profile. The client MUST enforce the negotiated event limit and the 16,384-byte absolute maximum before dispatch. JSON must be UTF-8, schema-valid and semantically valid; duplicate object names, malformed numeric values and unknown forbidden fields are rejected.

The receiver authenticates, checks the bounded body, validates the core event, verifies binding/expiry, and commits its valid-consumption ledger before acknowledgement. `200 OK` with a schema-valid receipt means `accepted` or `duplicate` at the declared valid-consumption level. For a duplicate, the ledger must confirm the same recipient/event identity and unchanged semantic body. A conflicting body under an existing identity is rejected rather than silently replacing the earlier record. A page can be validly consumed while the complete paginated window remains incomplete; no missing page is interpreted as zero activity.

Durably consume the page and its deduplication state atomically. Retain the deduplication entry for at least 24 hours after first valid receipt and through the original event expiry plus five minutes, whichever is later. Receiver admission/storage quotas are finite; if a compliant ledger entry cannot be kept for that horizon, reject the new record as temporarily unavailable before acknowledging it. Do not evict still-required deduplication entries and then claim valid duplicate-safe acceptance.

Receipts/errors MUST be JSON of at most 4,096 UTF-8 bytes and use `Cache-Control: no-store`. A valid receipt carries `protocol_version`, `event_id`, `recipient_id`, `stream_id`, `sequence`, `received_at`, `disposition` (`accepted` or `duplicate`) and `validation` (`valid`). Match the version, event, recipient, stream and sequence to the submitted record before recording success. A generic `202`, `204`, malformed body, mismatched receipt or invalid content type does not establish valid consumption; preserve the original pending event and bounded ambiguous-delivery state. A lost response may follow successful consumption, so retries reuse the unchanged ID/body.

The receipt is evidence of validation and durable receiver consumption, not evidence of host evaluation, user notification or behavior change. A conforming final mock demonstrates only M1. The actual agent may choose no response under its own context/preferences. Core order, stale-window and page-completeness rules still apply.

## H6. Errors and retry classification

Error bodies use the core bounded safe error record. Authentication failures MUST NOT echo tokens or disclose another recipient's existence. Error detail cannot include activity payloads, labels or hidden app identities. HTTP semantics follow [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html); the OAP retry choices below are profile requirements.

| HTTP outcome | Publisher response |
| --- | --- |
| `400` | `invalid_request` or `invalid_event`: stop retrying this immutable record; record a safe gap/error and require producer correction for future records. |
| `401` | `unauthorized`: stop affected attempts; show authentication needs attention; reissue through actual receiver setup. |
| `403` | `unauthorized` or `scope_mismatch`: stop affected attempts; fail closed; no scope widening or alternate-destination retry. |
| `404`, `405` | `endpoint_unsupported`: stop automatic attempts and mark pairing incompatible. |
| `409` | `conflicting_duplicate`: stop this record, retain only safe diagnostic metadata, investigate producer/receiver inconsistency. |
| `410` | `endpoint_unsupported` by default: mark the destination unavailable and stop automatic attempts. Only a verified response explicitly establishing `expired` removes the affected immutable event and preserves safe gap status. Local consent revocation remains a separate local action. |
| `413` | `payload_too_large`: stop this record; re-negotiate capacity for future windows. Do not mutate/re-ID a finalized window. |
| `415` | `media_type_unsupported`: stop this request/profile. |
| `422` | `invalid_event`, `incompatible_version` or `unsupported_capability`: stop this record/profile as applicable. |
| `408`, `425`, `429`, `500`, `502`, `503`, `504`, transport timeout/reset | Retry-eligible only under the core bounded cycle, consent, retention and backpressure rules. `429` uses `rate_limited`; temporary server/storage failure uses `temporary_unavailable` or `storage_unavailable`. |
| Any redirect | Destination failure: reject without following it. |
| Other status or invalid/missing receipt | Unknown/ambiguous outcome: retain bounded pending state; no success claim; stop for user attention after the permitted cycle. |

Honor a valid `Retry-After` on `429`/`503` as a lower bound, subject to event/grant/credential expiry. Parse either HTTP date or nonnegative delay seconds; malformed values use the core backoff. If the valid delay exceeds one hour, stop the current cycle and retain a bounded receiver-backpressure deadline: no affected dispatch may occur before the hint expires, and no automatic cycle starts merely because a timer expires. A hint that extends past expiry does not extend retention. Network/foreground opportunity changes may open a later bounded cycle only under the core reset/rate rules and after that deadline; the HTTP library must not bypass them. Do not rapidly rediscover capabilities for every retry.

## H7. Catch-up, subscriptions and conformance

The 65,536-byte catch-up limit bounds device-local selection, not a batch endpoint. Selected records are dispatched individually in core sequence order where practical; fresh-event and retry-attempt limits still apply. Catch-up does not coalesce finalized event bodies, extend expiry or guarantee eventual delivery. Pages retain common window identity and the declared count; approved apps are partitioned deterministically without silent omission. Gaps remain explicit in subsequent supported coverage/status, even when no deliverable event survives.

Test the complete local pairing/discovery/subscription/renew/publish/receipt/disconnect lifecycle; wrong bindings and expired credentials; TLS and destination policy; rebinding and every redirect; duplicate consumption after restart; identity conflicts; oversized/invalid records; unknown receipts and lost acknowledgements; `Retry-After`; local offline revocation races; rate/retention/capacity expiry; and absence of intermediary destinations. Local mock execution needs no production TLS or model credentials, but cannot claim production transport conformance from that exception. See [acceptance criteria](../../acceptance-criteria.md), particularly AC-08 through AC-19, AC-27 and AC-29.
