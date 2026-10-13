# Privacy and security

Version: baseline 0.2 with agreed OAP 0.1.0 refinements. Date: 2026-10-03; G1 agreement: 2026-10-04. The [contract](protocol/oap.md) governs the reference; the [Phase 4 review](../docs/review/phase-4.md) records tested synthetic behavior and outstanding production, host and Android evidence.

**Current companion POC, 2026-10-13:** [ADR-0023](../docs/decisions/0023-openclaw-companion-reminders.md) binds gentle reminders to a paired Android phone selected from trusted gateway node status. Activity/task text cannot choose a destination or authorize device actions. The agent instructions permit destination checks and passive `system.notify` notifications; other broad nodes actions remain outside Skill authority, though setup does not provide independent action-level enforcement. Private delivery timing/state remain in the chosen host, owned old WhatsApp reminder policies are disabled, and no hosted intermediary or offline delivery guarantee is added.

## Trust boundaries and data inventory

Usage metadata can reveal sensitive habits even without content. The authoritative consent store and all provider activity state live on the user's device. Treat devices, consumers, receiving endpoints, payload text, and network input as potentially hostile. Only the device and the user's chosen agent infrastructure participate in delivery. The chosen agent host receives permitted aggregates in plaintext at processing time; TLS does not hide them from that recipient.

OAP-NFR-009 prohibits a liveabit/project-operated intermediary, a free-tier service, a separately user-hosted bridge, a remote consent authority, a hidden tunnel or relay, and centralized activity logging. A local receiver must belong to the chosen agent runtime, not forward from an independently maintained service. Provider-managed connectivity can qualify only when it is part of the chosen agent infrastructure and the actual direct delivery/profile lifecycle is verified; its existence alone establishes neither support nor onboarding.

| Data | Location and allowed use | Proposed retention |
| --- | --- | --- |
| Raw permitted usage observations | Device-only input to aggregation; incidental denied OS fields/packages immediately discarded before state; no content query | Discard after aggregation/checkpoint; maximum 24 hours and any shorter applicable grant limit |
| App-duration windows and coverage | On-device recipient-scoped outbox/replay; send directly to chosen agent endpoint only fields allowed by the current grant | 24 hours or 4 MiB/recipient, whichever first |
| Application labels | Optional, approved descriptive data; identities work without a resolvable display label | Same as event |
| Consent and subscription records | Authoritative on-device user/device/recipient binding, allowlist, fields, cadence, expiry, revocation revision | Active lifetime; purge credentials on termination; retain minimal revocation marker until old credentials expire |
| Credentials and signing keys | On-device OS/vetted secure storage; limited to selected direct profile | Token/key lifetime; revoke/rotate through supported host mechanisms, never activity history |
| Diagnostic/audit metadata | On-device counts, timestamps, grant revisions, error categories; no payloads or app names by default; no centralized upload | Proposed 7 days and 1 MiB/device, whichever first |
| Goals, standing instructions, assistant memories, coaching responses | Chosen agent host only; no provider field or API accepting them | Host policy, disclosed separately |

Apply quotas to all durable state, including gap/audit markers and underlying local aggregates/checkpoints. Deadlines derive from original observations/window ends; retry, replay, renewal, projection, and republishing never reset them. A record may remain for another independently authorized recipient, without remaining accessible to the deleted recipient. A malicious producer cannot bypass a quota through identifiers or repeated errors. User deletion removes provider-controlled activity/outbox state and disconnects recipients; it does not delete the OS's historical usage database or guarantee deletion in a third-party host.

## Consent and control model

OAP-FR-002/003/010/016 and OAP-PR-007/008 require four independent decisions: OS monitoring permission, recipient sharing grant, agent standing instructions/notification preferences, and any future device-modifying permission. Installing a plugin or asking for attention coaching does not silently grant all four.

A grant binds the device's verified user, publisher/device, and authenticated chosen recipient. The device stores its effective scope as the intersection of user-selected fields/apps/event families and requested capabilities. Defaults are deny and no historical export before consent. A newly connected recipient receives only observations from after its approved grant begins. Clip to authorized segments, or drop an inseparable mixed window and disclose a gap; never estimate authorized usage by prorating a full-window total. Test all mid-window consent changes. Scope increases require a fresh on-device consent revision. Renewal can extend lifetime only within approved policy and cannot widen scope. Local OAP grants and host authentication/subscription credentials are distinct; the adapter cannot invent a host renewal, bootstrap or revocation API.

Pause denies new device-side reads, sends, and retries, including previously retained records, and stops new recipient outbox entries while retaining only previously authorized history to its existing TTL. Resume never backfills the paused interval. Global monitoring off stops OAP collection; the OS may still maintain its own usage statistics. Revocation invalidates device reads/replays and clears affected queued payloads and endpoint credentials. Persist these changes before reporting success and preserve them across restart/reboot, including offline. A host-supported credential revocation may supplement local disconnection, but local stopping does not wait for a network request or host confirmation.

There is no remote consent authority, remote lease, or pending remote grant synchronization. On unknown/corrupt local consent state, grant expiry, unusable endpoint credentials, or denied OS access, stop data operations and require valid authorization before resuming. Immediately before starting each send or read, check the current device consent revision and scope. Test concurrency using the local revocation commit as the boundary. New operations cannot begin after that commit; an already dispatched request may still arrive, and already received data cannot be recalled.

## Threats and controls

| Threat | Required controls | Evidence |
| --- | --- | --- |
| Unauthorized or cross-recipient access | Vetted profile authentication and applicable issuer/audience/expiry/scope validation; publisher/endpoint binding; on-device recipient grant checks; no trusting caller-supplied owner IDs | AC-02, AC-03, AC-15 |
| Revoked data escaping from outbox/replay | Transactional durable on-device consent revision; check immediately before send/read; purge affected immutable envelopes; offline/reboot revocation persists | AC-04, AC-05 |
| Destination SSRF / DNS rebinding | Cloud profile: public HTTPS only, private/local/reserved destinations rejected at connection time. Local-agent profile: explicitly approved authenticated TLS endpoint and narrowly pinned LAN address/identity, never an arbitrary URL forwarding service. Validate resolved destination and TLS identity on every connection; no redirects; same controls for supported verification | AC-16 |
| Spoofed or replayed delivery | Profile-supported vetted integrity/signing/verifying; for a selected webhook profile, exact-body integrity, timestamp tolerance and constant-time comparison; stable event identity deduplication; no invented host challenge mechanism | AC-17, AC-28 |
| Misuse of usage labels or hostile payloads | Formal schema/field allowlist; labels are data; no payload instructions; no interpretation as consent; skill ignores embedded commands | AC-06, AC-07, AC-23 |
| Secret leakage | Secure storage, rotation, redacted logs, synthetic fixtures, no tokens in URLs or payloads; least-privilege component access | AC-18 |
| Correlating recipients or inferring hidden apps | Recipient-scoped pseudonymous IDs; exclude denied apps entirely, including names, counters, totals, and labels derived from them | AC-03, AC-07 |
| Resource exhaustion / expensive agent wakes | Bounded parsing, sizes, rate, retry cycles, subscription counts, retention and diagnostics; coalesce catch-up; never emit raw lifecycle events by default | AC-11, AC-12 |
| Overcollection to fill Android gaps | Do not add content inspection, accessibility, notifications, or broad package inventory; publish coverage uncertainty | AC-07, AC-25 |
| Retention/deletion overclaim | Purge expired provider data and secrets; expose gaps; tell users which copies live in their agent host | AC-19 |
| Hidden intermediary or operational dependency | Review source, configuration, onboarding and actual destinations; reject independently operated relay/tunnel/backend defaults, intermediate upload endpoints, project service accounts and central logging; the chosen agent receiver/callback and verified provider-owned ingress are the destination | AC-27, AC-29 |

Use vetted auth libraries and the selected agent's supported pairing or OAuth mechanisms when available. OAuth discovery, authorization-code/PKCE, renewal and revocation apply only where the chosen host profile supports them and must be verified through that direct profile. Do not add a liveabit OAuth/identity server or presume that a callback URL, refresh endpoint, subscription API or agent event receiver exists. Mock credentials prove only simulator controls. No API keys for consumer AI providers are required by the OAP core.

## Release controls and user-visible states

Show the user the recipient and direct endpoint/profile, effective data scope, expiry, last observed window, last transport receipt, retained-data limits, and whether host evaluation is verified or unknown. Use distinct states for monitoring denied, sharing paused, active, expired, revoked/disconnected locally, credentials needing attention, stale observations, delivery timeout, and delivery gap. State clearly that direct delivery is best effort. The initial CLI/reference controls may demonstrate these states; Android provides the later user interface.

The agent may recommend a restriction, but the initial provider has no restriction capability. A future enforcer needs explicit action scope, affected app, duration, safe override, revocation, and independent policy review. OAP activity cannot itself authorize an action. The initial release makes no medical or behavioral-improvement claim.

## Residual risk and reviews

Usage summaries reveal selected habits to the chosen recipient. Grant revocation cannot recall data already received or guarantee cancellation of an in-flight request. Device/root compromise, compromised assistant accounts, and notification previews on a lock screen remain external risks; the agent host must respect its user's channel/privacy settings. Network loss, host limits and Android scheduling can exhaust bounded recovery; gaps must be disclosed rather than hidden behind a delivery guarantee.

Before M2, verify the chosen agent's actual direct onboarding and receiving path, access eligibility, third-party retention, profile permissions, costs and real notification behavior. Reject a host requiring intermediary infrastructure. Before M3, review Android permissions, sensitive package visibility, Play disclosures/data-safety requirements, and measurement results. The distribution license remains an open decision. There is no liveabit delivery-service operator to provision.
