# OAP 0.1.0 conformance

Status: OAP 0.1.0 agreed at G1 on 2026-10-04. This document specifies checks; actual runtime results are in the [Phase 4 review](../../docs/review/phase-4.md). The approved product direction forbids intermediary infrastructure. Contract agreement and implementation evidence are separate gates.

## CF-01 — Claims and validation layers

An implementation MUST name its OAP version, transport profile, supported event families, supported limits, and evidence revision. It MUST NOT claim conformance solely because a JSON document passes a schema validator.

Validation has four layers, applied in order:

1. **Representation:** bounded UTF-8 input, valid JSON, no duplicate object member names, no non-finite numbers, and the selected profile's authenticated transport envelope.
2. **Structure:** the matching published JSON Schema, including required fields, closed core objects, bounded extensions, supported versions, and field limits.
3. **Semantics:** the predicates in CF-02, including calendar validity, time ordering, coverage consistency, partition consistency, and durations.
4. **Context:** authorization, endpoint/device/recipient binding, consent state, negotiated capabilities, current time, retained history, immutable identities, ordering, deduplication, quotas, and profile security.

A receiver MUST reject invalid input before recording valid consumption or allowing a coaching side effect. A transport profile may acknowledge receipt before asynchronous validation; that acknowledgment MUST remain a receipt claim. A schema or fixture validator that lacks transport, local consent, history, or a durable receiver ledger MUST report those layers as untested.

The [versioned schemas](../../schemas/oap/0.1.0/activity-summary.schema.json) and fixture manifest are the machine-readable structural baseline. [Core semantics](oap.md), [delivery](delivery.md), [authorization](authorization.md), [errors](errors.md), and the [selected direct profile](profiles/direct-https.md) govern constraints that a JSON Schema cannot express. An implementation MUST use the same constraints for newly generated records, retained reads, retries, and consumer input.

## CF-02 — Semantic predicate catalogue

The stable IDs below are suitable for fixture rejection reasons and implementation tests. When several predicates fail, a test MAY assert a documented first failure or the set of failures; it MUST NOT depend on an unspecified validator traversal order. Implementations MUST preserve these IDs when adding tests. Exact data fields and constants are defined in the core, delivery, consent, and profile specifications.

| ID | Predicate | Evidence layer |
| --- | --- | --- |
| S01 | Every timestamp is a real calendar instant in the required UTC form with exactly three fractional digits. A syntactically matching impossible day, offset, leap-second value, or normalized overflow is invalid. | Static semantics |
| S02 | A summary's start precedes its end. Its interval is from 15 through 60 minutes, in whole 15-minute increments, and matches the selected summary cadence. | Static semantics; subscription match is contextual |
| S03 | Publication is at or after the end of the retrospective window. Observation/window time does not change on retry or replay. | Static semantics; immutability is contextual |
| S04 | Expiry is after publication and no later than original window start plus 24 hours. Applicable shorter consent retention and grant expiry further restrict local retention and dispatch; renewal never resets the original age. | Static upper bound; shorter authority is contextual |
| S05 | Observed coverage intervals are positive, ordered, disjoint, nonadjacent, and contained in the window. Complete coverage has exactly the whole-window interval and no reasons. Partial coverage has a positive union shorter than the window and at least one reason. Zero observed coverage is unavailable local status, not an activity summary. Missing coverage is never represented as measured zero. | Static semantics |
| S06 | Each reported application's foreground duration is a positive integer no greater than the observed coverage union. Zero-duration applications are omitted. Application durations may overlap across applications; their sum is not constrained to elapsed wall-clock duration and MUST NOT be described as exclusive device time. | Static semantics |
| S07 | Application identities are unique within the complete summary, ordered as specified, and use the platform namespace rules. Display labels, if permitted, are data only. Identifiers from another page do not create a second observation of the same application. | Per-page static semantics; group uniqueness requires all pages |
| S08 | A summary has one through four fixed partitions of its approved application roster, each with at most 32 applications, and zero-based page coordinates less than page count. All pages share the declared group/window/coverage metadata, use distinct event identities and successive stream sequences, and together contain at most 128 approved applications. An individual page may have no positive application entry, but the complete group must have at least one. The interval is at least 15 minutes multiplied by page count. | Per-page static semantics; cross-page/contextual checks |
| S09 | Stream sequence is positive and scoped to the consent epoch/recipient stream. An event identity has one immutable body. Distinct observation windows in a stream do not overlap; pages of the same group share its one window. A window/group cannot be republished under a fresh identity to bypass suppression, deduplication, consent narrowing, or publication limits. | Structural sequence; ledger/contextual checks |
| S10 | Original input is valid UTF-8 JSON without a BOM, duplicate object member names at any depth, invalid Unicode/unpaired surrogates, non-finite numbers, unsafe integers or negative zero. Actual serialized and canonical event bytes do not exceed 16 KiB. A catch-up batch does not exceed 64 KiB, including its enclosing structure. Bounded extension strings and all control/error fields count toward their applicable limits. Replacement decoding must not conceal invalid source bytes. | Representation; JSON Schema alone is insufficient |
| S11 | The event's applications, optional labels/fields, family, cadence, retention, device, recipient, and stream are within the effective grant and subscription intersection. Denied applications contribute no names, counts, durations, totals, or identifiers. | Context |
| S12 | Collection, retained reads, fresh publication, dispatch, and retry start only with active known local authority, valid OS collection permission where applicable, unexpired grants/subscriptions, and usable bound credentials. Pause/revoke/narrow is fenced at its durable local commit. | Context/runtime |
| S13 | An incomplete or inconsistent partition group is never interpreted as a complete window. Supplied static page sets can check shared metadata, page coordinates, successive sequence assignment, unique application identities, and a positive complete group. Every actually accepted page must additionally be individually valid and durably deduplicated; receiver group/gap state accounts for missing or expired pages without substituting zero. | Synthetic group predicates; actual receiver ledger/runtime |
| S14 | Replay cursors, retained reads, statuses, and errors are recipient scoped. Expired/evicted history produces the specified explicit gap/resync result without returning expired content or leaking another recipient's state. | Context/runtime |
| S15 | Fresh first dispatch, replay, retries, local grants/subscriptions, retained history, gap metadata, and diagnostics obey their independent limits. A finalized event without a previous dispatch still spends fresh budget. Retrying an already-attempted immutable identity is not fresh publication; assigning a new identity is not a retry. Clock adjustment does not replenish limits or extend history. Received publication times more than five minutes ahead of receiver time fail; expired data has no acceptance grace. | Context/runtime |
| S16 | Receipt, valid consumption, host evaluation, and user notification remain distinct facts. Duplicate/out-of-order/stale data cannot create a second deterministic consumption side effect or imply current use. | Receiver/host context |
| S17 | Selected-profile authentication, TLS identity, destination restrictions, integrity/replay rules, credential rotation, and required negotiation succeed before deployment delivery. A capability or schema cannot grant authorization. | Profile/runtime |
| S18 | Collection and delivery use only the device and chosen agent's verified final receiving infrastructure, apart from ordinary supported profile authentication. Configuration needing an intermediate forwarding service is rejected. An unsupported host stays unavailable. | Topology/configuration/observed traffic |
| S19 | A local grant satisfies created_at <= approved_at < expires_at; a subscription satisfies created_at < expires_at. Scope application identities are unique and sorted, the interval is at least 15 minutes times ceil(approved application count / 32), and history age exceeds the interval. Subscription expiry/scope/bindings/revision remain inside the live grant, supported receiver admission and credential authority. | Local-record static semantics; authority intersection is contextual |
| S20 | A local selection batch has strictly increasing unique event sequences, unique event identities, matching recipient/stream/scope revision on every event, and ordered disjoint positive gap ranges with from_sequence <= to_sequence. A reported gap cannot contain a returned event sequence; adjacent ranges with the same reason are merged. has_more is true exactly when next_cursor is present. Cursor identity/expiry/history position remains a contextual check. | Batch static semantics; cursor authority is contextual |
| S21 | Error code and retryability agree with the error catalogue: temporary_unavailable, rate_limited and storage_unavailable are retry eligible; every other known code is nonretryable. Only retry-eligible errors may have a bounded retry hint. A code or hint does not authorize dispatch. | Error-record static semantics; dispatch remains contextual |
| S22 | Safe local status uses finite bounded nonnegative queue/gap counts, retained_bytes <= the effective retention.max_bytes, and schema-valid retention bounds. Known grant expiry is a real timestamp; unknown authority has no fabricated expiry. State, effective counts, timestamps and expiry agree with actual local authority/accounting rather than changing it. | Status static bounds; true state/accounting is contextual |

S11–S18 cannot be proven with a standalone event fixture. S19–S22 include additional standalone checks for local/control records, but their contextual parts still need actual authority/accounting. A validator MUST identify any unavailable contextual checks instead of reporting universal validity. An implementation MUST stop safely on unknown/corrupt authority; guessing that consent was formerly active is invalid.

## CF-03 — Static and contextual test catalogue

All CT cases below are **specified**. A separate evidence report records actual results with a revision and environment. “Phase 3” means the check can run against contract artifacts. “M1”, “M2”, and “M3” mean a running reference, existing agent, or physical Android environment is required. No static pass satisfies those runtime gates.

| ID | Gate | Required observable result |
| --- | --- | --- |
| CT-01 | Phase 3 | Every schema parses, declares its dialect and stable identifier, resolves all references locally, and validates against the dialect's meta-schema. No schema fetch or project-operated service is required. |
| CT-02 | Phase 3 | Every fixture is declared in the manifest with schema and expected result; valid examples pass structure plus applicable static predicates; negative examples fail for the named rule. Include standalone scope/grant/subscription/batch/error/status S19–S22 negatives as well as event examples. Unreferenced fixtures, missing files, and unknown rejection-rule IDs fail the check. |
| CT-03 | Phase 3; M1 parser | Raw-input cases reject malformed UTF-8/JSON, duplicate members, oversize event/batch representations, prohibited content fields, unknown core members, and out-of-bound extension data. Report byte and duplicate-key checks separately from schema validation. |
| CT-04 | Phase 3 | Invalid calendar days, offsets, non-millisecond forms, reversed/oversize windows, publication before window end, expired-on-publication records, and expiry beyond original-age limits fail S01–S04. |
| CT-05 | Phase 3 | Coverage overlap/adjacency, unsorted/outside-window intervals, incorrect complete/partial states, inconsistent reasons, zero or excessive application duration, and duplicate application identity fail S05–S07. Unavailable coverage is represented only in local status. A multiwindow example with overlapping per-app durations remains valid. |
| CT-06 | Phase 3; M1 redactor | Structure rejects forbidden activity/content fields; the running redactor additionally suppresses unapproved applications, labels, hidden-app counters/totals, and incidental broad OS metadata before state/export. Zero measured usage remains distinguishable from unavailable observations. |
| CT-07 | Phase 3; M1 grouping | Invalid per-page zero-based index/count or cadence fails S08. Cross-page duplicate apps, inconsistent group/window/coverage metadata, duplicate page coordinates, nonconsecutive group sequences, or a wholly empty claimed-complete group fails S13. An empty page inside an otherwise positive group remains valid. Incomplete valid groups produce a missing-page condition, never a complete-window interpretation. Synthetic fixture grouping does not prove a durable receiver ledger. |
| CT-08 | Phase 3; M1 negotiation | Declared compatible optional extensions are safely ignored; required unsupported capabilities, unknown incompatible versions, unknown family, or incompatible profile fail before activation. OAP version and transport/host version are independently pinned. |
| CT-09 | M1; M3 collection | Absent/denied/expired/unknown/corrupt consent causes no collection, publication, retained read, or send for that authority. Mid-window grant clips known segments; inseparable observations are discarded with missing coverage, never estimated by prorating. |
| CT-10 | M1; M3 reboot | Revoke during queued delivery, retained read, retry backoff, and concurrent dispatch. After durable local commit, no new read/send/retry begins. Restart/reboot/offline recovery preserves the fence; unrelated recipient continues. The manifest records any request that began before the commit as in-flight. |
| CT-11 | M1; M3 controls | Pause blocks queued and retained reads/sends/retries. Resume does not backfill paused time. Narrowing invalidates affected immutable window groups instead of editing published bodies or republishing a replacement; widening requires new local consent. |
| CT-12 | M1 | Two recipients receive only their independent app/field/family/cadence/retention intersection and isolated pseudonyms/state. Endpoint, device, grant, subscription, cursor, and identity substitution fail without cross-recipient diagnostics. |
| CT-13 | M1; M2 profile | Identical local creation/renewal/disconnect operations are idempotent; renewal stays finite and inside the grant, changes no body identity, and cannot widen scope. Expired or revoked authority cannot be revived by delayed control, reconnect, or a stale stored operation. |
| CT-14 | M1; M2 profile | Capability discovery, selection, local subscription, publish, receipt, consumption, renewal, and disconnect follow only the selected supported interface. No device-modifying capability is exposed. A simulated profile is labeled simulated; invented real-host control APIs fail review. |
| CT-15 | M1; M2 profile | Grant/subscription/credential expiry and clock adjustment fail closed. Unusable credentials stop dispatch. Future publication beyond five minutes is rejected; expired input has no grace. A clock rollback cannot retain old activity longer, reset retry/publication budgets, or make an expired authority active again. |
| CT-16 | M1 | Duplicate event before/after receiver restart changes the durable consumption ledger once within the specified horizon. Altered body under the same identity is rejected. Signature/transport refresh does not create another event or coaching side effect. |
| CT-17 | M1 | Reverse delivery, delayed windows, missing sequence, and distinct streams preserve per-stream order metadata without inventing global order. Overlapping distinct window groups within one stream are rejected even when they arrive out of order; pages of one group are not separate windows. Late data keeps original times and cannot be treated as current foreground use. |
| CT-18 | M1 | Four-hour network loss plus publisher/receiver restart recovers retained authorized data within limits, exposes unresolved failures, and respects expiry. Gap reporting covers overflow/expiry without unlimited storage or an eventual-delivery claim. |
| CT-19 | M1 | Accelerated 24-hour burst honors the independent fresh-event budget including partition pages, 16 KiB events/64 KiB batches, subscription/grant caps, 4 MiB recipient history, bounded gaps/diagnostics, and suppression rules. Delayed catch-up cannot evade limits by relabeling new identities replay. |
| CT-20 | M1; M2 applicable profile | Each cycle has at most six attempts; deterministic injected jitter/backoff, transient/permanent classifications, retry hints, reconnect-cycle gating, cancellation, expiry, and backpressure match the delivery specification. A recurring timer cannot create unlimited cycles. |
| CT-21 | M1 | Wrong-recipient, stale, unknown, expired, or evicted cursors fail or return the specified gap/resync response. Catch-up is bounded/rate-limited, pagination terminates, and a read cannot bypass pause/revoke/narrow or disclose an unauthorized partition. |
| CT-22 | M1; M2 | Record receipt independently from valid consumption. A transport success containing invalid data produces no consumption; asynchronous host evaluation/notification is recorded only if observed. A successful mock endpoint is not real-agent evidence. |
| CT-23 | M1; M2 | Cloud destinations reject HTTP, invalid certificates/identity, redirect, private/reserved addresses, and DNS rebinding on verification and each connection. Local-agent private TLS endpoints require explicit narrow address/identity approval; all other private/reserved destinations remain blocked. Insecure localhost is limited to the isolated development profile. |
| CT-24 | M1; M2 | Missing/expired/wrong credentials, applicable wrong issuer/audience/scope, wrong endpoint/device/recipient identity, and another grant's control/cursor fail. Profile pairing uses documented vetted supported mechanisms; no liveabit auth server is required. |
| CT-25 | M1; M2 applicable profile | Selected-profile tamper, wrong key, rotation, replay, and applicable signing-age tests fail safely. Where signing exists, retries use fresh transport signing time and immutable activity identity. Challenge tests apply only when the actual selected profile supports a challenge. |
| CT-26 | M1; M2; M3 | Inspect events, local state, logs, fixtures, source, diagnostics, and failure reports for secrets/private content. Protected credential persistence/rotation and safe ownership/status errors meet the profile; no centralized activity logging appears. |
| CT-27 | M1; M3 | Fake-clock/size eviction obeys original observation deadlines and shorter applicable limits for events, aggregates, and checkpoints. Delete/disconnect removes controlled data/credentials and bounds revocation markers through old credential expiry; report other recipients, OS copies, and already-received/in-flight residual limits accurately. |
| CT-28 | Windows M1; Linux deferred | Reproducible Windows setup runs lifecycle/fault cases with pinned dependencies and saved results, no physical Android device/model key, and only publisher plus final deterministic receiver processes with embedded state. Per accepted ADR-0008, Linux extensibility is deferred and untested; actual Linux evidence is required before offering Linux support, not before current progression. |
| CT-29 | M1 | Measure publication-to-valid-consumption p95 <=2 seconds across 100 accepted summaries in a healthy local reference setup. Save environment, timing definition, raw samples, acceleration, and exclusions; do not count aggregation time or imply a production SLA. |
| CT-30 | M1; M2; M3 topology | Audit source, dependencies, onboarding, accounts, configuration and observed outbound destinations. Only device-to-chosen-agent final receiver plus ordinary supported authentication is allowed. Reject operator/free-tier relay, separate user bridge, proxy/broker/tunnel, consent service, intermediate upload, or centralized activity logging. |
| CT-31 | M1 conditional; M2 required if selected | A host-specific MCP profile pins current actual host/MCP behavior and proves direct onboarding, endpoint/credential acquisition, supported discovery/result shapes, control refresh/expiry, verification and delivery. If no direct supported full lifecycle exists, record unavailable/N/A; no intermediary is introduced to pass. |
| CT-32 | M2 | An existing eligible personal agent receives an actual permitted event through the verified direct path, uses its standing instructions/context, and has observed receipt/evaluation/user output as available. Repeat applicable renewal and local disconnect. A separate API coach or forwarding backend does not satisfy this case. |
| CT-33 | M2 | Real-host rubric: intentional leisure permits silence, explicit focus yields an appropriate allowed alternative, missing context/stale/duplicate activity produces uncertainty or silence, hostile labels remain data, and device-restriction requests cause no enforcement. Record every privacy/control violation as failure. |
| CT-34 | M2 | Real-host quiet periods, opt-out, interruption budget and approved channel are honored. No provider goal/private-memory store/import is needed; unavailable host context/channel is reported safely. |
| CT-35 | M3 | Real Android manifest and explicit Settings permission, loss/regrant/unlock/unavailable states, app/field controls, offline reboot revocation, actual aggregate correctness and relevant M1 direct security cases pass. No extra enforcement/collection permission is used. |
| CT-36 | M3 | Run reproducible sessions, multiwindow/PiP, lock/reboot/midnight/clock trials; battery/network/CPU and freshness trials; OS/OEM/profile and policy review. Measured release thresholds receive approval before M3 completion; measurement alone is not a quality pass. |
| CT-37 | Phase 3; all gates | All 33 requirements and 29 AC cases map to current contract sections/artifacts/tasks and evidence. Local links, stable IDs, schema/fixture references and version declarations are consistent. Retired IDs are not reused and conditional tests have explicit applicability. |

## CF-04 — Acceptance-case coverage

The acceptance cases remain in [acceptance criteria](../acceptance-criteria.md). This table maps all cases to stable conformance checks; multiple gates may be required for one case. The mapping does not mark any case passed.

| Acceptance | Conformance checks | Earliest complete evidence |
| --- | --- | --- |
| AC-01 | CT-01, CT-02, CT-08, CT-14, CT-28 | M1 after contract review |
| AC-02 | CT-09, CT-15 | M1; collection repeated at M3 |
| AC-03 | CT-06, CT-12, CT-24 | M1 |
| AC-04 | CT-10, CT-15, CT-27 | M1; reboot repeated at M3 |
| AC-05 | CT-07, CT-09, CT-11, CT-13, CT-16 | M1 |
| AC-06 | CT-02, CT-03, CT-04, CT-05, CT-07 | M1 validates running rejection path |
| AC-07 | CT-05, CT-06, CT-26 | M1; OS metadata repeated at M3 |
| AC-08 | CT-13, CT-14, CT-22 | M1; actual host profile at M2 |
| AC-09 | CT-16, CT-17 | M1 |
| AC-10 | CT-04, CT-15, CT-17 | M1 |
| AC-11 | CT-18, CT-20, CT-21, CT-27 | M1 |
| AC-12 | CT-03, CT-07, CT-19, CT-20, CT-21 | M1 |
| AC-13 | CT-29 | M1 |
| AC-14 | CT-08, CT-14, CT-31 where applicable | M1 |
| AC-15 | CT-12, CT-15, CT-24 | M1; real profile at M2 |
| AC-16 | CT-23, CT-24 | M1; real destination at M2 |
| AC-17 | CT-16, CT-25 | M1; real selected profile at M2 |
| AC-18 | CT-12, CT-26 | M1; repeat for M2/M3 |
| AC-19 | CT-10, CT-11, CT-15, CT-21, CT-27 | M1; device deletion/reboot at M3 |
| AC-20 | CT-28 | M1 |
| AC-21 | CT-37 | Each evidence gate |
| AC-22 | CT-24, CT-30, CT-31 where applicable, CT-32 | M2 |
| AC-23 | CT-33 | M2 |
| AC-24 | CT-34 | M2 |
| AC-25 | CT-09, CT-10, CT-11, CT-23, CT-27, CT-30, CT-35 | M3 |
| AC-26 | CT-36 | M3 |
| AC-27 | CT-18, CT-28, CT-30 | M1 |
| AC-28 | CT-08, CT-14, CT-20, CT-22, CT-24, CT-25, CT-31 | Conditional M1; actual host at M2 |
| AC-29 | CT-30, CT-31 where applicable, CT-32 | M1 topology and actual M2 path |

## CF-05 — Evidence format and release decisions

Every run MUST save a safe manifest containing specification/schema/profile revision, implementation revision, dependency versions, OS/environment, applicable CT/AC IDs, synthetic fixture names, expected/observed result, clocks/randomness/fault configuration, and limitations. Evidence MUST omit credentials, private activity, goals and memories. A skip is neither a pass nor a failure: it MUST name the missing environment or unsupported profile and the gate it leaves unsatisfied.

Phase 3 evidence MAY establish schema/reference integrity, fixture outcomes and documentation coverage. Fixture contexts and grouped examples are supplied synthetic values: testing their predicates does not authenticate a real recipient, obtain actual consent, dispatch data, or exercise a durable ledger. Current M1 progression accepts independent Windows publisher/final deterministic receiver behavior and recorded fault/consent/retention/security limits under [ADR-0008](../../docs/decisions/0008-windows-baseline-and-android-integration-priority.md); an event-validator script is not either runtime. Linux is deferred and untested. The native Android collector and local inspection precede agent selection under [ADR-0009](../../docs/decisions/0009-android-local-inspection-first.md). M2 requires actual existing-agent direct-path evidence and host behavior. M3 still requires physical Android collection, a functioning compliant direct M2 integration and approved measurement thresholds. No gate may substitute an intermediary for an unavailable host path.

Failures involving authorization, privacy, topology, immutable identity, or an unsupported real-host claim block their applicable gate. Performance or availability failures MUST remain visible; reducing fresh cadence or reporting delivery loss is permitted only within the approved contract and user authority. Successful schema fixtures never constitute permission to collect or send data.
