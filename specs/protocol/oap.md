# Open Activity Protocol 0.1.0

Date: 2026-10-03. Status: OAP 0.1.0 contract agreed at G1 on 2026-10-04; experimental protocol, not a registered standard. MUST, MUST NOT, SHOULD and MAY describe conforming implementations. Runtime evidence and its limitations are recorded separately in the [Phase 4 review](../../docs/review/phase-4.md).

## P1 Scope and roles

OAP lets a compatible personal agent receive and interpret authorized activity signals. This version defines retrospective application foreground-duration summaries. Session starts, live session updates, content collection, judgments about excessive use and device-modifying actions are excluded. The user's existing agent owns standing instructions, goals, memories, interpretation and communication. The optional liveabit Skill supplies guidance in Phase 5; it supplies neither delivery nor authorization.

The **provider** is the device-local collector, aggregator, consent authority, publisher and direct adapter. The **receiver** is part of the chosen agent's existing infrastructure or local agent runtime. A deterministic final receiver substitutes for that agent only in M1. A **recipient** is one locally approved receiving identity. A **grant** is the user's durable local permission. A **subscription** is its effective local publication configuration. A **stream** is a recipient-specific consent-scope epoch. A **window** is one finalized retrospective observation interval; it can have several pages.

Every activity path MUST run directly from the device to that receiver. A project backend, separate user forwarding server, relay, proxy, broker, independent tunnel, remote consent service or intermediate upload is forbidden, including free hosting. Ordinary agent-provider authentication and the provider's own supported receiving ingress may qualify. This protocol does not assert that any existing commercial agent currently implements its proposed receiver interface. See [authorization](authorization.md) and [direct profile](profiles/direct-https.md).

## P2 Representation and schemas

Objects use UTF-8 JSON, no byte-order mark, duplicate object keys, invalid Unicode, non-finite numbers or integers outside the safe range 0..9007199254740991. Schema-required positive values have tighter bounds. Negative zero MUST NOT be emitted. Unknown core properties MUST be rejected; implicit type coercion, default insertion and field removal are forbidden. Labels and extension values are untrusted data, never prompts, permissions or executable content.

Formal schemas live in [schemas/oap/0.1.0](../../schemas/oap/0.1.0/activity-summary.schema.json), using [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12/json-schema-core). Register all neighboring schemas under one offline base URI before resolving relative IDs/references; identifiers do not require hosting or runtime network retrieval. Validate structure, formats, the cross-field predicates in [conformance](conformance.md), and authorization/ledger context. Schema validation alone does not establish consent, chronology or delivery correctness. Date formats need assertion rather than annotation-only handling, as distinguished by the [validation specification](https://json-schema.org/draft/2020-12/json-schema-validation).

The event identity digest is SHA-256 of the [RFC 8785 JSON Canonicalization Scheme](https://www.rfc-editor.org/rfc/rfc8785) representation of the complete OAP event. Array order matters. Providers MUST freeze the canonical event bytes before first dispatch and use those identical bytes for every retry. An adapter embedding OAP inside another envelope MUST preserve the decoded OAP object and its canonical digest. Transport signatures may change between attempts. Display fixtures are indented for readability; actual event publication uses canonical JSON. Both canonical and actual on-wire OAP bytes MUST fit the event cap. JSON interoperability follows [RFC 8259](https://www.rfc-editor.org/rfc/rfc8259).

## P3 Taxonomy and envelope

The only event name is `activity.summary`. Its metric is `foreground_duration`, with unit `millisecond`. No raw OS event is exported. Each page has the following required fields, defined precisely by [activity-summary.schema.json](../../schemas/oap/0.1.0/activity-summary.schema.json).

| Field | Meaning and invariant |
| --- | --- |
| protocol_version, event_name | Exactly `0.1.0` and `activity.summary` |
| event_id | Random lowercase UUIDv4 identifying this immutable recipient-specific page |
| recipient_id | Random pseudonym for the selected receiving identity; bound by authenticated pairing, not trusted from JSON alone |
| stream_id | Random pseudonym for this recipient and scope epoch; never shared between recipients |
| subscription_id, scope_revision | Local subscription identity and positive monotonic grant-scope revision |
| sequence | Positive, contiguous assignment within a stream at finalization; starts at 1, includes pages, never reused |
| emitted_at | Time the immutable page was finalized; does not change during delay or retry |
| expires_at | Last permitted retention/delivery time; derived from original window start and authorization, never arrival time |
| window | Recipient-specific window_id plus inclusive start and exclusive end |
| summary | Interval, metric, unit, page_index/page_count, coverage, permitted application durations |
| extensions | Optional bounded, namespaced nonessential data under explicit consent; unknown values ignored |

UUIDv4 syntax and generation follow [RFC 9562](https://www.rfc-editor.org/rfc/rfc9562); identifiers are not authentication secrets. Each recipient gets independently generated IDs, streams and sequences so a hidden recipient's activity or delivery count cannot be inferred. Device/user binding identifiers remain local and in authenticated pairing context; no global device or user identifier is required in the event.

Retransmission is the same event. A repeated event_id with a different canonical digest is `conflicting_duplicate` and MUST NOT be consumed. This release has no correction/replacement event or window revision. A finalized window MUST NOT be published again with a new ID to disguise a retry, scope change or changed observation. Narrowing purges the old stream's queued/retained windows; it does not reconstruct a replacement for an already finalized window. Future observations use the new scope and stream. Late source observations cannot revise a finalized window in this release.

## P4 Time, applications and measurement

All times are UTC strings `YYYY-MM-DDTHH:mm:ss.sssZ`, with valid Gregorian calendar dates and no leap second, offset alternative or omitted millisecond component. This is a deliberately restricted [RFC 3339](https://www.rfc-editor.org/rfc/rfc3339) profile. Intervals are half-open. A window lasts 900000..3600000 ms in a multiple of 900000 ms; its duration equals aggregation_interval_ms. Distinct window groups within one stream MUST NOT overlap; different pages of the same window share its interval. The receiver checks this against its retained group ledger even on out-of-order arrival, rejecting overlapping distinct groups as conflicting_duplicate. Fifteen minutes is the default. Slower sharing uses 30, 45 or 60-minute aggregation or explicitly skips later windows; a skipped period is not silently presented as observed.

Window end MUST be at or before emitted_at; emitted_at MUST precede expires_at. The deadline is the minimum of window.start + approved history age, grant expiry, subscription expiry and applicable credential expiry. History age cannot exceed 86400000 ms. Using window start intentionally avoids extending earlier observations through window completion. Expired records are not sent. A receiver rejects data with emitted_at more than 300000 ms ahead of its clock and rejects data at/after expires_at; future-time tolerance is not expiry grace. A clock discontinuity requires conservative coverage and local recovery, never extended TTL. See [delivery D5](delivery.md#d5-expiry-storage-and-clock-changes).

An application identity is the pair `(namespace, id)`. Namespace is lowercase ASCII `[a-z][a-z0-9._-]{0,31}`. ID is case-sensitive ASCII `[A-Za-z0-9._:-]{1,128}`. `android.package` and `org.example.reader` illustrate an Android package identity; this is an example, not a mandatory platform. Another platform uses its own documented namespace and canonical identity. Unsupported namespaces/IDs require explicit capability failure, not lossy truncation, guessed category mapping or collection of a broad installed-app inventory. A consumer matches the full pair. Namespace registration is not centrally hosted in this version.

`label` is optional, at most 64 Unicode code points, and present only when separately approved. It is display data. Application records are sorted by namespace then ID using ASCII ordinal order and contain only positive duration values. Omitted apps on a received page mean no reported positive duration for that page's approved partition; they do not disclose apps outside consent.

Foreground duration measures the collector's documented foreground observations. It is not proof of attention, intent, addiction, or exclusive screen time. Each duration is at most the duration of the observed coverage union. Different apps may overlap in split-screen or platform-specific observations, so their sum may exceed elapsed time. Receivers MUST NOT normalize that sum into a misleading exclusive total. Aggregation clips known sessions/segments at window and consent boundaries; it never prorates an inseparable OS bucket or guesses pre-consent history.

## P5 Coverage and pagination

Coverage describes observability for the approved application scope, not an inventory or total of excluded applications. `complete` has exactly one observed interval equal to the whole window and an empty reasons list. `partial` has a positive observed union shorter than the window and at least one reason: `permission_missing`, `source_unavailable`, `clock_discontinuity` or `consent_boundary`. Its intervals are ordered, nonoverlapping and nonadjacent; merge adjacent intervals before emission. There are at most 64 intervals. If coverage cannot fit that bound, conservatively remove unverifiable fragments and corresponding app duration before finalization, or suppress the window and report local health; never claim complete coverage. No observed union, or a whole group with no positive usage, is suppressed and reported through local health when appropriate. Absence is not proof of zero usage.

A subscription has at most 128 explicitly allowed applications. Sort its entire allowlist, partition into consecutive groups of at most 32, and use that fixed partition map throughout its stream. page_count is ceil(allowlist size/32), 1..4, and page_index starts at 0. Only positive app records in that partition are exported; a page may have an empty apps array. All pages of a nonempty window MUST be finalized together with the same window_id, window times, coverage, scope_revision, subscription_id and aggregation_interval_ms, distinct IDs and consecutive sequences in page order. At least one page must contain positive usage. Empty pages in such a group are necessary to distinguish a complete partition from a lost page. No silent application omission is permitted.

The aggregation interval MUST be at least 900000 * page_count ms; 33..64 apps therefore need at least 30 minutes, 65..96 need 45, and 97..128 need 60. More than 128 applications is an explicit `scope_unsupported` rejection of this initial profile, not silent filtering. The user sees the negotiated slower interval before approving the scope. Each page counts against the same fresh-event limit. Field/coverage byte limits are additionally validated; if a selected scope cannot fit negotiated caps, onboarding fails with `scope_unsupported`. Individual field maxima do not guarantee a combined byte fit. If actual permitted labels/extensions/coverage exceed the cap, suppress that whole window before finalization and expose `payload_too_large` with a local missing-window indication; do not silently drop approved apps/fields. A user may approve a smaller scope for future windows. Do not silently widen cadence, alter a finalized group or fragment an event at dispatch.

Receivers identify a group by `(recipient_id, stream_id, window_id)`. They deduplicate each page before contributing any duration. Page-level valid consumption is permitted, but whole-window conclusions require all page indexes exactly once with consistent group metadata, page_count and partition membership. Until then the group is incomplete, and absent pages/apps are unknown. A missing page never becomes zero. Expiry can leave a permanently incomplete group. A receiver can interpret observed app usage conservatively while recording that limitation; it cannot imply a complete window.

## P6 Capabilities, subscriptions and local interfaces

[capabilities.schema.json](../../schemas/oap/0.1.0/capabilities.schema.json) describes publisher or receiver roles: explicitly supported versions, event names, metrics, namespaces, fields, delivery profiles and limits. `device_actions_enabled` is false. A device discovers its own effective capabilities locally and authenticates the chosen receiver's capabilities through its selected profile before collection/publication. A profile requiring an unimplemented required capability is rejected. Negotiation takes the intersection of grant, subscription request, publisher capabilities, receiver capabilities and protocol limits; incompatible intersections fail explicitly. A lower negotiated fresh-event budget requires an explicitly approved sufficient interval: interval >= ceil(page_count * 3600000 / effective_max_fresh_events_per_hour / 900000) * 900000 ms. Reject a result above 3600000 ms in this initial profile. Independent rolling-hour accounting still applies; this average-rate condition alone does not authorize a burst.

Grants and subscriptions are device-local records, defined by [local-grant](../../schemas/oap/0.1.0/local-grant.schema.json) and [subscription](../../schemas/oap/0.1.0/subscription.schema.json). They are not published to an internet consent service and do not imply an inbound device server. The local UI/agent integration records a request, but only the user's device approval makes it active. Scope includes application pairs, allowed fields, event_names, interval and retention age/byte caps. The core duration field is required; labels and extensions require explicit approval. Empty application scope means no subscription/no collection, never all applications.

Creation has a client-generated UUID idempotency_key. Repeating the same key plus canonical approved request returns the same subscription without extending its expiry; a different request with that key is `conflicting_duplicate`. Renewal uses a new operation key, checks fresh local authority and unchanged effective scope, and is finite. Narrowing is a separate scope-change operation. Default grant/subscription lifetime is 24 hours; every subscription expires no later than its grant or usable credential. Renewal cannot resurrect revoked/expired consent or authorize wider data. Grant renewal after expiry needs fresh user approval and a new stream. Scope changes increment scope_revision and rotate stream/window/recipient-visible subscription identity; sequences restart at 1. Pairing, endpoint changes and widening always require explicit user approval. A configured history age must exceed its aggregation interval, otherwise no unexpired summary could exist and activation fails with `invalid_request`. See [A3](authorization.md#a3-begin-pause-resume-and-change-scope) and [D1](delivery.md#d1-provider-lifecycle).

[interfaces.ts](interfaces.ts) defines transport-independent, non-runtime provider and consumer contracts for local consent, negotiation, finalization, bounded selection, dispatch, consumption and health. Implementations in other languages need equivalent behavior, not TypeScript. Pairing supplies protected endpoint/credential references separately; the schema does not embed secrets. Remote subscription/list/read/control endpoints exist only if the actual host profile supports them. The direct reference profile uses local configuration and outbound delivery.

## P7 Delivery, errors and controls

Best-effort direct delivery may be delayed, duplicated, reordered, rejected, expire or stop after retry exhaustion. No eventual-delivery, agent wakeup, notification or production latency guarantee is made. [Delivery](delivery.md) specifies budgeting, six-attempt cycles, immutable replay, queue bounds, local cursors/gaps, deduplication, failure and status. [Errors](errors.md) defines safe machine codes and recovery. [Authorization](authorization.md) specifies local commit fences, fail-closed state, scope intersection, no pre-consent export and offline revocation.

The device stores no coaching goals or private memories. Normal diagnostics carry permissions, effective scope references, expiry, attempts and health without activity/credentials. A receipt is transport-specific. The direct reference receipt proves validation and a committed deterministic consumer ledger entry, never agent evaluation or user notification. A provider webhook's successful HTTP response can mean receipt only. Keep these stages separate in status and milestone evidence.

## P8 Versioning and conformance

Negotiate an exact supported protocol_version before sending; this contract supports only `0.1.0`. Unsupported major or exact version is `incompatible_version`, never a best-effort parse. The schema directory and manifest are versioned together. Major zero is experimental; no assumption of minor-version compatibility is made. Breaking core meanings/fields require a new version and schema. A future receiver can support several schemas and negotiate down to this one.

Within this version, nonessential additive metadata may use `extensions`: at most eight keys beginning `x.` followed by a reverse-domain style namespace, each string at most 256 code points. Unknown extension data is ignored for protocol behavior, scope, metric and authority. Essential behavior cannot depend on an extension. Extensions are disabled by default; scope.extension_keys records the specific keys the user approves and a protected local disclosure describes their data purpose. This preserves additive compatibility without accepting arbitrary unknown fields, contents, credentials, hidden app counts, private goals or prompts. Core semantics always win.

Static conformance includes structure, representation and documented semantic predicates. Contextual conformance also requires consent/pairing, group integrity, immutable ledger, ordering, rate, retention and expiry. M1 adds lifecycle/fault/restart/security performance evidence; M2 proves a real existing agent's complete supported direct path; M3 measures Android. [Conformance](conformance.md) maps these gates to the 29 acceptance criteria. A passing Phase 3 fixture check satisfies none of the runtime milestones.

### Contract map

| Former planned area | Concrete definition |
| --- | --- |
| PA-01 | P2–P5; activity-summary/common schemas; semantic predicates |
| PA-02 | P6; local-grant/subscription/capabilities schemas; A3 |
| PA-03 | Authorization A1–A7; local grant; direct pairing/security |
| PA-04 | Delivery D1–D4; receipt/batch; consumer ledger |
| PA-05 | P5; delivery D3/D5; bounds and fresh budget |
| PA-06 | P2/P8; conformance; offline schema resolution |
| PA-07 | Direct HTTPS profiles; conditional MCP Events gate |
| PA-08 | Delivery D6; error/status schemas and catalog |
