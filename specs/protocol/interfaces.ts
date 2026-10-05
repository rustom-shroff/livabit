/**
 * Open Activity Protocol (OAP) 0.1.0 — normative shape interfaces.
 *
 * These declarations allocate no credentials, publish no server, and enforce no
 * authorization by themselves. Implementations MUST also validate JSON Schema,
 * the protocol's semantic rules, live local consent and their selected profile.
 * All identifiers below are lowercase UUIDv4; all times are UTC milliseconds.
 * "Local" records MUST remain on the publishing device.
 */

export type ProtocolVersion = "0.1.0";
export type OapId = string;
export type UtcTimestamp = string;
export type ApplicationNamespace = string;
export type ApplicationId = string;
export type DeliveryProfileId =
  | "direct-https-v1"
  | "direct-local-tls-v1"
  | "direct-loopback-test-v1";
export type AllowedField = "foreground_duration_ms" | "label";
export type EventName = "activity.summary";
export type AggregationIntervalMs = 900000 | 1800000 | 2700000 | 3600000;

export interface ApplicationKey {
  readonly namespace: ApplicationNamespace;
  readonly id: ApplicationId;
}

export interface ApplicationWithLabel extends ApplicationKey {
  /** Untrusted data. Include only with explicit field consent. */
  readonly label?: string;
}

export interface ObservationInterval {
  readonly start: UtcTimestamp;
  readonly end: UtcTimestamp;
}

export interface Coverage {
  readonly status: "complete" | "partial";
  readonly observed_intervals: ReadonlyArray<ObservationInterval>;
  readonly reasons: ReadonlyArray<
    | "permission_missing"
    | "source_unavailable"
    | "clock_discontinuity"
    | "consent_boundary"
  >;
}

export interface SummaryWindow extends ObservationInterval {
  /** One immutable recipient/stream-scoped window identity across all pages. */
  readonly window_id: OapId;
}

export interface ApplicationDuration {
  readonly application: ApplicationWithLabel;
  /** Positive, integral milliseconds; never exceed observed coverage per app. */
  readonly foreground_duration_ms: number;
}

export interface ActivitySummary {
  readonly protocol_version: ProtocolVersion;
  readonly event_name: EventName;
  readonly event_id: OapId;
  readonly recipient_id: OapId;
  readonly stream_id: OapId;
  readonly subscription_id: OapId;
  readonly scope_revision: number;
  readonly sequence: number;
  readonly emitted_at: UtcTimestamp;
  readonly expires_at: UtcTimestamp;
  readonly window: SummaryWindow;
  readonly summary: {
    readonly metric: "foreground_duration";
    readonly unit: "millisecond";
    readonly aggregation_interval_ms: AggregationIntervalMs;
    readonly page_index: number;
    readonly page_count: number;
    readonly coverage: Coverage;
    readonly apps: ReadonlyArray<ApplicationDuration>;
  };
  /** At most eight x.<reverse-DNS> string hints; never required for core use. */
  readonly extensions?: Readonly<Record<string, string>>;
}

export interface EffectiveScope {
  readonly applications: ReadonlyArray<ApplicationKey>;
  readonly allowed_fields: ReadonlyArray<AllowedField>;
  readonly event_names: ReadonlyArray<EventName>;
  readonly aggregation_interval_ms: AggregationIntervalMs;
  readonly history_max_age_ms: number;
  readonly history_max_bytes: number;
  /** Absence prohibits extensions; selected keys require local user approval. */
  readonly extension_keys?: ReadonlyArray<string>;
}

export interface LocalMonitoringGrant {
  readonly protocol_version: ProtocolVersion;
  readonly grant_id: OapId;
  readonly recipient_id: OapId;
  readonly device_binding_id: OapId;
  readonly user_binding_id: OapId;
  readonly scope_revision: number;
  readonly state: "active" | "paused" | "revoked";
  readonly created_at: UtcTimestamp;
  readonly approved_at: UtcTimestamp;
  readonly expires_at: UtcTimestamp;
  readonly scope: EffectiveScope;
}

export interface LocalSubscription {
  readonly protocol_version: ProtocolVersion;
  readonly subscription_id: OapId;
  readonly grant_id: OapId;
  readonly recipient_id: OapId;
  readonly stream_id: OapId;
  readonly scope_revision: number;
  readonly state: "active" | "paused" | "revoked" | "expired";
  readonly created_at: UtcTimestamp;
  readonly expires_at: UtcTimestamp;
  readonly idempotency_key: OapId;
  readonly scope: EffectiveScope;
}

export interface Capabilities {
  readonly protocol_version: ProtocolVersion;
  readonly role: "publisher" | "receiver";
  readonly supported_versions: ReadonlyArray<ProtocolVersion>;
  readonly event_names: ReadonlyArray<EventName>;
  readonly metrics: ReadonlyArray<"foreground_duration">;
  readonly application_namespaces: ReadonlyArray<ApplicationNamespace>;
  readonly allowed_fields: ReadonlyArray<AllowedField>;
  readonly delivery_profiles: ReadonlyArray<DeliveryProfileId>;
  readonly limits: {
    readonly max_event_bytes: number;
    readonly max_batch_bytes: number;
    readonly max_apps_per_page: 32;
    readonly max_pages: number;
    readonly max_fresh_events_per_hour: number;
    readonly max_history_age_ms: number;
    readonly max_history_bytes: number;
    readonly max_attempts_per_cycle: number;
  };
  readonly device_actions_enabled: false;
}

export interface ValidConsumptionReceipt {
  readonly protocol_version: ProtocolVersion;
  readonly event_id: OapId;
  readonly recipient_id: OapId;
  readonly stream_id: OapId;
  readonly sequence: number;
  readonly received_at: UtcTimestamp;
  readonly disposition: "accepted" | "duplicate";
  readonly validation: "valid";
}

export type ErrorCode =
  | "invalid_event"
  | "incompatible_version"
  | "unsupported_capability"
  | "unauthorized"
  | "scope_mismatch"
  | "consent_inactive"
  | "expired"
  | "payload_too_large"
  | "rate_limited"
  | "destination_rejected"
  | "temporary_unavailable"
  | "cursor_invalid"
  | "history_unavailable"
  | "conflicting_duplicate"
  | "invalid_request"
  | "scope_unsupported"
  | "storage_unavailable"
  | "clock_untrusted"
  | "cursor_stale"
  | "endpoint_unsupported"
  | "media_type_unsupported";

export interface SafeError {
  readonly protocol_version: ProtocolVersion;
  readonly code: ErrorCode;
  /** Safe fixed/operator text; never event contents, credentials or goals. */
  readonly message: string;
  readonly retryable: boolean;
  readonly retry_after_ms?: number;
}

export interface HistoryGap {
  readonly from_sequence: number;
  readonly to_sequence: number;
  readonly reason: "eviction" | "expired" | "explicit_delete";
}

export interface LocalReplayBatch {
  readonly protocol_version: ProtocolVersion;
  readonly recipient_id: OapId;
  readonly stream_id: OapId;
  readonly scope_revision: number;
  readonly events: ReadonlyArray<ActivitySummary>;
  readonly gaps: ReadonlyArray<HistoryGap>;
  readonly has_more: boolean;
  readonly next_cursor?: string;
}

export interface LocalStatus {
  readonly protocol_version: ProtocolVersion;
  readonly recipient_id: OapId;
  readonly subscription_id: OapId;
  readonly stream_id: OapId;
  readonly scope_revision: number;
  readonly consent_state: "active" | "paused" | "revoked" | "expired" | "unknown";
  readonly collection_permission: "granted" | "denied" | "unknown" | "unavailable";
  readonly delivery_state:
    | "idle"
    | "pending"
    | "delivering"
    | "exhausted"
    | "blocked"
    | "offline"
    | "backoff"
    | "paused"
    | "revoked"
    | "expired"
    | "credential_unusable"
    | "permanent_error"
    | "unsupported";
  /** Omitted exactly when consent is unknown; never fabricate an expiry. */
  readonly grant_expires_at?: UtcTimestamp;
  readonly retention: {
    readonly max_age_ms: number;
    readonly max_bytes: number;
    readonly queued_events: number;
    readonly retained_bytes: number;
  };
  readonly last_receipt_at?: UtcTimestamp;
  readonly last_valid_consumption_at?: UtcTimestamp;
  readonly gap_count: number;
}

/** Local-only companion references, resolved from a protected credential store. */
export interface LocalDestinationBinding {
  readonly recipient_id: OapId;
  readonly profile_id: DeliveryProfileId;
  readonly endpoint_ref: OapId;
  readonly credential_ref: OapId;
}

export interface ConfigureSubscriptionRequest {
  readonly grant_id: OapId;
  readonly idempotency_key: OapId;
  readonly requested_scope: EffectiveScope;
  readonly requested_expires_at: UtcTimestamp;
}

export interface RenewSubscriptionRequest {
  readonly subscription_id: OapId;
  readonly idempotency_key: OapId;
  readonly requested_expires_at: UtcTimestamp;
}

export interface SelectReplayRequest {
  readonly subscription_id: OapId;
  readonly cursor?: string;
  readonly max_bytes: number;
}

/** Local, redacted observation candidate; no event identity allocated yet. */
export interface LocalSummaryCandidate {
  readonly start: UtcTimestamp;
  readonly end: UtcTimestamp;
  readonly coverage: Coverage;
  readonly apps: ReadonlyArray<ApplicationDuration>;
}

/**
 * Device-side interface. Every operation rechecks live grant/subscription state.
 * Collection, event allocation, durable consent fencing, budgets and retries
 * belong to the publisher implementation; declarations are not security guards.
 */
export interface DevicePublisher {
  getCapabilities(): Promise<Capabilities>;
  configureSubscription(request: ConfigureSubscriptionRequest): Promise<LocalSubscription>;
  renewSubscription(request: RenewSubscriptionRequest): Promise<LocalSubscription>;
  pause(recipientId: OapId): Promise<LocalStatus>;
  resume(recipientId: OapId): Promise<LocalStatus>;
  revoke(recipientId: OapId): Promise<LocalStatus>;
  narrowScope(recipientId: OapId, requestedScope: EffectiveScope): Promise<LocalSubscription>;
  /** Checks live authority and atomically suppresses or freezes all window pages. */
  finalizeWindow(subscriptionId: OapId, candidate: LocalSummaryCandidate): Promise<ReadonlyArray<ActivitySummary>>;
  selectReplay(request: SelectReplayRequest): Promise<LocalReplayBatch>;
  /** Owns consent fencing, persistent budgets and attempts around the adapter. */
  dispatchNext(subscriptionId: OapId, adapter: DirectDeliveryAdapter): Promise<LocalStatus>;
  recordReceipt(receipt: ValidConsumptionReceipt): Promise<void>;
  getLocalStatus(recipientId: OapId): Promise<LocalStatus>;
}

/** A transport authenticates a peer using the selected vetted profile. */
export interface VerifiedTransportPeer {
  readonly profile_id: DeliveryProfileId;
  readonly recipient_id: OapId;
  readonly verified_at: UtcTimestamp;
  readonly authorization_expires_at: UtcTimestamp;
}

/** Direct receiver-side binding; excludes publisher-local user/device identities. */
export interface ReceiverAuthorization {
  readonly recipient_id: OapId;
  readonly stream_id: OapId;
  readonly subscription_id: OapId;
  readonly scope_revision: number;
  readonly expires_at: UtcTimestamp;
  readonly scope: EffectiveScope;
}

/** Sends one previously finalized immutable event directly to the agent receiver. */
export interface DirectDeliveryAdapter {
  deliver(
    event: ActivitySummary,
    binding: LocalDestinationBinding
  ): Promise<ValidConsumptionReceipt>;
}

/**
 * Final receiver interface. It validates before durable deduplicated consumption.
 * Failures reject with SafeError through the selected transport. Missing pages
 * remain incomplete; acceptance never attests to evaluation or notification.
 */
export interface ActivityConsumer {
  getCapabilities(): Promise<Capabilities>;
  consume(
    event: ActivitySummary,
    peer: VerifiedTransportPeer,
    authorization: ReceiverAuthorization
  ): Promise<ValidConsumptionReceipt>;
}
