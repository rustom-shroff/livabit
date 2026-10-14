import { readFileSync } from 'node:fs';
import { withStore } from './runtime.mjs';

export function readDelivery(settings) {
  const read = filename => {
    if (typeof filename !== 'string') throw new Error('delivery_unavailable');
    const bytes = readFileSync(filename);
    if (bytes.length > 32768) throw new Error('invalid_delivery_policy');
    return JSON.parse(bytes);
  };
  const policy = read(settings.deliveryPolicyPath), state = read(settings.deliveryStatePath);
  if (policy.format !== 'liveabit.openclaw.companion-delivery.v1' || policy.enabled !== true
    || policy.agent_id !== settings.agentId || policy.channel !== 'companion'
    || policy.identity_source !== 'openclaw.nodes.status' || policy.command !== 'system.notify'
    || typeof policy.node_id !== 'string' || !/^[a-fA-F0-9]{64}$/.test(policy.node_id)
    || !Number.isInteger(policy.cooldown_minutes) || policy.cooldown_minutes < 1 || policy.cooldown_minutes > 1440
    || !Number.isInteger(policy.quiet_start_hour) || policy.quiet_start_hour < 0 || policy.quiet_start_hour > 23
    || !Number.isInteger(policy.quiet_end_hour) || policy.quiet_end_hour < 0 || policy.quiet_end_hour > 23
    || typeof policy.time_zone !== 'string' || !policy.time_zone.trim()
    || state.format !== 'liveabit.openclaw.delivery-state.v1'
    || !Array.isArray(state.processed_event_ids) || state.processed_event_ids.length > 128
    || state.processed_event_ids.some(id => typeof id !== 'string' || !id.trim())
    || (state.last_sent_at !== null && !Number.isFinite(Date.parse(state.last_sent_at)))) throw new Error('invalid_delivery_policy');
  new Intl.DateTimeFormat('en', { timeZone: policy.time_zone }).format();
  return { policy, state };
}

export async function notifyDecision({ settings, context, decisionId, nodes, guard, signal, getSettings = () => settings }) {
  guard();
  const { policy, state } = readDelivery(settings);
  const inventory = await nodes.list();
  guard();
  const current = getSettings();
  if (current.agentId !== settings.agentId || current.sessionKey !== settings.sessionKey
    || current.databasePath !== settings.databasePath) throw new Error('delivery_unavailable');
  const latest = readDelivery(current);
  if (JSON.stringify(latest.policy) !== JSON.stringify(policy)) throw new Error('delivery_policy_changed');
  const selected = (inventory.nodes ?? []).filter(node => node.nodeId === policy.node_id);
  if (selected.length !== 1 || !selected[0].paired || !selected[0].connected || selected[0].platform !== 'android'
    || !selected[0].commands?.includes('system.notify') || selected[0].permissions?.notifications !== true)
    return { notification_attempted: false, reason: 'companion_unavailable' };
  const reservation = withStore(settings, store => {
    guard(); return store.reserveNotification({ decisionId, agentId: context.agentId, sessionKey: context.sessionKey,
      policy, legacyLastSentAt: latest.state.last_sent_at });
  });
  if (!reservation.reserved) return { notification_attempted: false, reason: reservation.reason };
  let outcome = 'uncertain', invoked = false, reason = null;
  try {
    guard(); signal?.throwIfAborted();
    const finalDelivery = readDelivery(getSettings());
    if (JSON.stringify(finalDelivery.policy) !== JSON.stringify(policy)) throw new Error('delivery_policy_changed');
    if (finalDelivery.state.last_sent_at !== latest.state.last_sent_at) throw new Error('delivery_state_changed');
    // Crossing the native invocation boundary can have an effect even when
    // its call throws or its response is lost. Preparation failures cannot.
    invoked = true;
    const acknowledgement = await nodes.invoke({ nodeId: policy.node_id, command: 'system.notify',
      params: { title: 'liveabit', body: reservation.decision.prompt, priority: 'passive', delivery: 'system' },
      timeoutMs: 15000, idempotencyKey: 'liveabit-' + decisionId, sessionKey: context.sessionKey, signal });
    guard();
    if (acknowledgement?.ok === true && acknowledgement.nodeId === policy.node_id && acknowledgement.command === 'system.notify') outcome = 'confirmed';
  } catch (error) {
    if (invoked) {
      // Lost responses cannot establish whether the notification was posted.
      outcome = 'uncertain';
    } else {
      outcome = 'suppressed';
      const knownReasons = ['delivery_unavailable', 'delivery_policy_changed',
        'delivery_state_changed', 'invalid_delivery_policy', 'invocation_unavailable'];
      reason = signal?.aborted ? 'cancelled_before_invocation'
        : knownReasons.includes(error?.message) ? error.message : 'pre_dispatch_rejected';
    }
  }
  // A pre-dispatch suppression stays recorded, preventing replay of this
  // decision, but consumes no native notification attempt or cooldown budget.
  const settled = withStore(settings, store => store.settleNotification(decisionId, outcome, reason));
  return { notification_attempted: invoked, native_invocation_confirmed: outcome === 'confirmed', ...settled };
}
