# OAP 0.1.0 errors and recovery

Status: OAP 0.1.0 agreed at G1 on 2026-10-04. Error records use [error.schema.json](../../schemas/oap/0.1.0/error.schema.json); this catalogue supplements structural validation with retry semantics. HTTP behavior applies only to the [direct receiver profiles](profiles/direct-https.md). Other selected profiles MUST map their actual documented outcomes to this catalogue without inventing a host error API.

## E1. Safe error record

An error contains `protocol_version`, `code`, a bounded safe `message`, and `retryable`. A retry-eligible error MAY include `retry_after_ms` from zero through 3600000. A nonretryable error MUST NOT contain a retry hint. A direct-profile receipt/error response is bounded to 4096 UTF-8 bytes and is not activity data or a control instruction.

Messages MUST describe only the affected authorized operation. They MUST NOT echo credentials, request bodies, labels, application names/durations, private memories, goals, another recipient's identity/state, or internal exception/stack output. Use a fixed safe message or a vetted bounded template. Do not make an authentication error distinguish an unknown recipient from a known recipient with an invalid credential.

`retryable` describes whether the same operation may be attempted within the current authorized bounded recovery policy. It does not promise eventual recovery, authorize an attempt, reset a cycle, renew consent, extend retention, or permit another destination. A false value may require local repair before later operations; it does not necessarily mean a human can never reconnect.

## E2. Machine-code catalogue

The three explicitly marked codes MUST have `retryable: true`; every other known code MUST have `retryable: false`. Implementations MUST reject contradictory error records before using their hint. Actual attempts still require the independent authority, deadline and cycle checks. Unknown codes are invalid for 0.1.0 and never enable unbounded retry.

| Code | retryable | Meaning and permitted recovery |
| --- | --- | --- |
| `invalid_event` | false | Event structure, representation, chronology, coverage, metric or other semantics are invalid. Stop this immutable event; correct the producer for future windows. Do not mutate or re-ID a finalized window. |
| `incompatible_version` | false | The exact OAP version is not supported. Stop activation/delivery and select a mutually supported published version through supported setup. |
| `unsupported_capability` | false | Required family, metric, namespace, field, profile behavior or other capability is absent. Negotiate a supported scope with local approval or leave the destination unavailable. |
| `unauthorized` | false | Authentication is missing, expired or invalid, or the operation is not authorized for the authenticated principal. Stop affected attempts; repair credentials through the chosen receiver's supported setup. |
| `scope_mismatch` | false | Body/control identifiers or fields do not match the authenticated device/recipient/grant/subscription/epoch or admitted scope. Fail closed; do not widen scope or try a different endpoint. |
| `consent_inactive` | false | Local monitoring/sharing state is absent, paused, revoked, expired, unknown or otherwise denying the operation. No read/collection/send/retry begins. Resume or new consent requires the appropriate local user action. |
| `expired` | false | The event or applicable finite authority has reached its deadline. Remove controlled expired activity under retention policy; no arrival grace or renewal of its original age. |
| `payload_too_large` | false | Actual representation exceeds the negotiated/absolute cap. Reject before dispatch/consumption. Suppress the affected whole immutable group and show a local failure; negotiate future scope/capacity rather than silently discard an app or repartition a finalized window. |
| `rate_limited` | true | The relevant independent publication/read/receiver admission budget has no capacity. Wait within the original deadline and permitted cycle; a hint cannot reset budgets or bypass consent. |
| `destination_rejected` | false | TLS identity, destination classification, pinned local identity/address, redirect policy or another destination safeguard failed. Stop and require explicit verified local setup/repair. |
| `temporary_unavailable` | true | A retry-eligible network/receiver failure or unknown transport outcome occurred. Retain bounded eligible state and retry the same identity/body under the delivery policy; acceptance may already have occurred. |
| `cursor_invalid` | false | A cursor is unknown, malformed, foreign, or otherwise invalid for the current authorized local caller/scope. Deny without leaking its owner; begin a new authorized selection. |
| `history_unavailable` | false | Requested observation history is not retained or cannot be safely supplied. Report an authorized gap/unavailable result and resync within present scope; never reconstruct expired activity or infer usage. |
| `conflicting_duplicate` | false | An event identity, stream sequence, window/group/page identity, or idempotency key conflicts with a previously bound immutable value. Reject instead of replacing it; investigate using safe metadata. |
| `invalid_request` | false | A local/interface request is malformed or internally inconsistent, including invalid time/scope/retention relationships. Reject before changing authority or state. |
| `scope_unsupported` | false | The requested application count, cadence, approved fields or representation cannot fit this profile's limits. Show the incompatibility before activation; require an explicit compatible selection rather than silently narrowing applications/fields or changing cadence. |
| `storage_unavailable` | true | Safe bounded device state or receiver admission/deduplication storage cannot be persisted. Reject before claiming success/consumption; resume only after storage and authority/accounting are safe. No hosted queue or unbounded memory fallback is permitted. |
| `clock_untrusted` | false | Trusted time/cadence/expiry cannot be established after a discontinuity or uncertain restart. Stop affected operations; reconcile the local clock without extending deadlines or restoring expired consent/budgets. |
| `cursor_stale` | false | A formerly valid authorized local cursor refers to expired/deleted/evicted history or an obsolete active-scope position. Return safe present-scope gap/resync information only after authorization; old-scope details remain inaccessible. |
| `endpoint_unsupported` | false | The configured destination/route/profile or connection no longer provides the required compatible receiver behavior. Stop automatic attempts; verify supported pairing or leave the integration unavailable. |
| `media_type_unsupported` | false | Content type or encoding is unsupported. Reject the current representation; future requests must use the selected profile's supported bounded UTF-8 JSON. |

An exact unchanged duplicate is a successful `duplicate` consumption receipt, not an error. A gap is an observation-history limitation, not proof that a user used or did not use an application. A denied permission is not a zero-usage summary.

## E3. Direct HTTP mapping and precedence

This mapping specifies the bespoke compatible OAP receiver interface. It makes no claim that an existing commercial host returns these statuses or codes. Local-only codes may be shown in local status without any network response.

| Outcome | Safe classification | Automatic recovery |
| --- | --- | --- |
| `400` | `invalid_event` for event validation; `invalid_request` for malformed control/configuration | Stop current invalid operation. |
| `401` | `unauthorized` | Stop affected dispatch; credentials need supported repair. |
| `403` | `unauthorized` or `scope_mismatch` | Stop affected dispatch; no scope/destination fallback. |
| `404`, `405`, `410` | `endpoint_unsupported`; `expired` only when the supported response specifically establishes event expiry | Stop automatic attempts; retain/remove eligible local data according to its existing authority/deadline, never infer remote consent revocation. |
| `409` | `conflicting_duplicate` | Stop the conflicting record/operation. |
| `413` | `payload_too_large` | Stop current immutable group; repair future scope/capacity visibly. |
| `415` | `media_type_unsupported` | Stop current representation/profile as applicable. |
| `422` | Valid nonretryable semantic/capability/version code from E2 | Stop current record/profile as applicable. |
| `429` | `rate_limited` | Bounded retry, honoring a valid applicable hint. |
| `408`, `425`, `500`, `502`, `503`, `504` | `temporary_unavailable`, or a valid `storage_unavailable` where supported | Bounded retry while authority/retention allow. |
| DNS/connect/reset/timeout/response loss | `temporary_unavailable` | Unknown acceptance; retry identical identity/body within bounds. |
| Any redirect or failed destination/TLS verification | `destination_rejected` | Do not follow, resend to another destination, or forward credentials. |
| Generic `202`/`204`, malformed/mismatched receipt, unexpected content type, or other ambiguous status | `temporary_unavailable` locally | No valid-consumption claim; bounded ambiguous-delivery recovery and then visible exhausted state. |

Permanent authentication, destination, media and integrity failures take precedence over a response's optimistic retry flag. A contradictory error/status or an untrusted response cannot authorize retry outside the profile policy. Keep the original event pending only while its original authority/deadline permits; a transport timeout cannot prove rejection or successful consumption.

A valid `Retry-After` on supported `429`/`503` is a lower bound on the next wait. Parse its HTTP date or nonnegative seconds safely. Malformed hints use core backoff; past-date hints do not make a negative wait. The error body's `retry_after_ms` is capped at one hour; a larger valid HTTP hint stops the current cycle and establishes bounded receiver backpressure rather than being clamped to an earlier retry. No affected dispatch begins before that deadline, and elapsed time alone does not start a new cycle. The earliest event/grant/subscription/credential expiry still wins. A hint beyond the permitted remaining lifetime causes expiry, never an extended lifetime. [Delivery D3](delivery.md#d3-publication-budget-batching-and-retries) controls attempts, jitter, cycle triggers and concurrency; an HTTP library MUST NOT bypass it.

## E4. Evidence and user status

Conformance checks [S21, CT-20 and CT-22](conformance.md) validate code/retry consistency, permanent classifications, unknown acceptance, hints, consent cancellation, exhausted cycles and stage separation. [CT-23 through CT-27](conformance.md) cover endpoint/authentication/storage/retention/privacy behavior. Use synthetic bodies and safe messages.

Errors, gaps, last transport receipt, valid consumption and actual host response MUST remain separately visible. A local payload/permission/clock/storage problem is not silently reported as a healthy empty window; no notification is not evidence of transport failure. Every actual test result belongs to its evidence gate. Static error fixtures do not establish a network retry implementation, supported agent behavior or successful Android delivery.
