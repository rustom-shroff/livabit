// Offline candidate semantics only. No HTTP, credentials, publisher or account access.
const FIELDS = ['connectionFailed', 'localConsentActive', 'requestBodyWritten', 'responseStatus'];
const reject = () => { throw new TypeError('Invalid offline webhook attempt.'); };
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));

/** Classify hypothetical observations; never supply a ValidConsumptionReceipt. */
export function classifyGrokWebhookAttempt(input) {
  if (!plain(input) || Reflect.ownKeys(input).some(key => typeof key !== 'string')
    || Reflect.ownKeys(input).sort().join(',') !== FIELDS.join(',')) reject();
  // Reject accessors: supplied data must not execute code during classification.
  for (const field of FIELDS) {
    const descriptor = Object.getOwnPropertyDescriptor(input, field);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) reject();
  }
  const { connectionFailed, localConsentActive, requestBodyWritten, responseStatus } = input;
  if (![connectionFailed, localConsentActive, requestBodyWritten].every(value => typeof value === 'boolean')
    || responseStatus !== null && (!Number.isInteger(responseStatus) || responseStatus < 200 || responseStatus > 599)
    || responseStatus === 200 && !requestBodyWritten) reject();

  let outcome, attention = null;
  if (responseStatus === 200) outcome = 'accepted_run_start_report';
  else if (responseStatus !== null) {
    outcome = 'not_accepted_report';
    if (responseStatus >= 300 && responseStatus < 400) attention = 'destination_rejected';
    else if (responseStatus === 401 || responseStatus === 403) attention = 'credential_attention';
    else if ([404, 405, 410].includes(responseStatus)) attention = 'endpoint_attention';
    else if (responseStatus === 413) attention = 'payload_attention';
    else if (responseStatus === 429) attention = 'backpressure_attention';
    else attention = 'unverified_native_response';
  } else if (requestBodyWritten) {
    outcome = 'ambiguous_after_body_write';
    attention = 'delivery_reconciliation';
  } else {
    outcome = 'body_not_submitted';
    attention = !localConsentActive ? 'local_consent_denied'
      : connectionFailed ? 'connection_attention' : 'attempt_not_completed';
  }

  return Object.freeze({
    evidence_kind: 'offline_grok_webhook_outcome_model', outcome, attention,
    local_consent_active: localConsentActive,
    remote_side_effect_possible: requestBodyWritten,
    documented_acceptance_report: outcome === 'accepted_run_start_report',
    automatic_retry_allowed: false,
    retry_decision: !localConsentActive ? 'stop_local_denial'
      : outcome === 'accepted_run_start_report' ? 'stop_accepted'
      : outcome === 'ambiguous_after_body_write' ? 'reconcile_before_any_resend'
      : 'requires_reviewed_retry_policy_and_live_guards',
    redirect_allowed: false, actual_host_observed: false, network_accessed: false,
    valid_consumption_proven: false, completion_proven: false, agent_evaluation_observed: false,
    user_visible_output_observed: false, remote_cancellation_proven: false,
    consent_established: false, native_profile_enabled: false, m2_gate_satisfied: false
  });
}
