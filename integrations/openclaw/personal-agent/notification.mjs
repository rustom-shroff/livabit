import { readFileSync } from 'node:fs';
import { withStore } from './runtime.mjs';
import { enqueueDelivery, claimDelivery, currentDelivery, finishDelivery, deferDelivery,
  cancelDeliveries, deliveryPolicyHash, deliveryStatus } from './delivery-store.mjs';

const preparationReason = error => ['delivery_unavailable', 'delivery_policy_changed', 'delivery_cancelled',
  'invalid_delivery_policy', 'invalid_personal_agent_settings'].includes(error?.message) ? error.message : 'delivery_unavailable';

async function boundedInventory(nodes) {
  let timer;
  try {
    // Inventory has no notification side effect. A stuck read must not prevent
    // all later analysis/delivery service ticks indefinitely.
    return await Promise.race([nodes.list(), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('inventory_timeout')), 15000);
      timer.unref?.();
    })]);
  } finally { clearTimeout(timer); }
}

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
  const { policy } = readDelivery(settings);
  const queued = withStore(settings, store => enqueueDelivery(store, { decisionId, ...context, policy }));
  if (queued.status === 'settled') return { notification_attempted: false, delivery_queued: false, reason: queued.reason };
  const job = withStore(settings, store => claimDelivery(store, { ...context, decisionId }));
  if (!job) return { notification_attempted: false, delivery_queued: true, reason: 'delivery_pending' };
  return dispatchDelivery({ settings, context, job, nodes, guard, signal, getSettings, cancelOnRevocation: true });
}

// Called by the host service after restart and periodically while the plugin is
// enabled. Retries only inventory/pre-dispatch preparation, never an uncertain
// native invocation. No model run, email, alternate channel or wake command.
export async function drainNotifications({ settings, nodes, guard = () => {}, signal, getSettings = () => settings }) {
  guard();
  const context = { agentId: settings.agentId, sessionKey: settings.sessionKey };
  try { readDelivery(settings); }
  catch {
    withStore(settings, store => cancelDeliveries(store, context, 'delivery_unavailable'));
    return { notification_attempted: false, delivery_queued: false, reason: 'delivery_unavailable' };
  }
  const job = withStore(settings, store => claimDelivery(store, context));
  if (!job) return { notification_attempted: false, reason: 'no_due_delivery' };
  return dispatchDelivery({ settings, context, job, nodes, guard, signal, getSettings });
}

async function dispatchDelivery({ settings, context, job, nodes, guard, signal, getSettings, cancelOnRevocation = false }) {
  const use = work => withStore(settings, work);
  const preparationGuard = () => {
    try { guard(); }
    catch (error) {
      // Host-owned cancellation bookkeeping closes an intent already admitted
      // by this still-pending tool call; it grants no send authority. A service
      // stopping keeps its unreserved work durable for its next startup.
      if (cancelOnRevocation) use(store => finishDelivery(store, job, 'cancelled_before_invocation'));
      throw error;
    }
  };
  const check = () => {
    signal?.throwIfAborted();
    const current = getSettings();
    if (current.agentId !== settings.agentId || current.sessionKey !== settings.sessionKey
      || current.databasePath !== settings.databasePath) throw new Error('delivery_unavailable');
    const delivery = readDelivery(current);
    if (deliveryPolicyHash(delivery.policy) !== job.policy_hash || delivery.policy.node_id !== job.node_id)
      throw new Error('delivery_policy_changed');
    use(store => currentDelivery(store, job));
    return delivery;
  };
  let latest;
  try { latest = check(); }
  catch (error) {
    const reason = signal?.aborted ? 'cancelled_before_invocation' : preparationReason(error);
    use(store => finishDelivery(store, job, reason));
    return { notification_attempted: false, delivery_queued: false, reason };
  }
  let inventory;
  try { inventory = await boundedInventory(nodes); }
  catch {
    preparationGuard();
    try { check(); }
    catch (error) {
      const reason = signal?.aborted ? 'cancelled_before_invocation' : preparationReason(error);
      use(store => finishDelivery(store, job, reason));
      return { notification_attempted: false, delivery_queued: false, reason };
    }
    return { notification_attempted: false, ...use(store => deferDelivery(store, job, 'inventory_unavailable')) };
  }
  // Explicit cancellation of an unfinished tool call must not later become a
  // surprise service delivery after the revoked invocation has gone away.
  preparationGuard();
  try { latest = check(); }
  catch (error) {
    use(store => finishDelivery(store, job, preparationReason(error)));
    throw error;
  }
  const { policy } = latest;
  if (!Array.isArray(inventory?.nodes))
    return { notification_attempted: false, ...use(store => deferDelivery(store, job, 'inventory_unavailable')) };
  const selected = inventory.nodes.filter(node => node?.nodeId === policy.node_id);
  // No absent identity, missing permission, or ambiguous node can authorize a
  // delayed send. Only a known authorized but disconnected node is retryable.
  if (selected.length !== 1 || selected[0].paired !== true || typeof selected[0].connected !== 'boolean' || selected[0].platform !== 'android'
    || !selected[0].commands?.includes('system.notify') || selected[0].permissions?.notifications !== true) {
    use(store => finishDelivery(store, job, 'companion_unavailable'));
    return { notification_attempted: false, delivery_queued: false, reason: 'companion_unavailable' };
  }
  if (!selected[0].connected) {
    const deferred = use(store => deferDelivery(store, job, 'companion_offline'));
    return { notification_attempted: false, ...deferred,
      ...(deferred.delivery_queued ? { reason: 'companion_unavailable' } : {}) };
  }
  const reservation = use(store => {
    preparationGuard(); currentDelivery(store, job);
    return store.reserveNotification({ decisionId: job.decision_id, ...context,
      policy, legacyLastSentAt: latest.state.last_sent_at });
  });
  if (!reservation.reserved) {
    use(store => finishDelivery(store, job, reservation.reason));
    return { notification_attempted: false, delivery_queued: false, reason: reservation.reason };
  }
  let outcome = 'uncertain', invoked = false, reason = null;
  try {
    guard();
    const finalDelivery = check();
    if (finalDelivery.state.last_sent_at !== latest.state.last_sent_at) throw new Error('delivery_state_changed');
    // Crossing the native invocation boundary can have an effect even when
    // its call throws or its response is lost. Preparation failures cannot.
    invoked = true;
    const acknowledgement = await nodes.invoke({ nodeId: policy.node_id, command: 'system.notify',
      params: { title: 'liveabit', body: reservation.decision.prompt, priority: 'passive', delivery: 'system' },
      timeoutMs: 15000, idempotencyKey: 'liveabit-' + job.decision_id, sessionKey: context.sessionKey, signal });
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
  const settled = use(store => store.settleNotification(job.decision_id, outcome, reason));
  use(store => finishDelivery(store, job, reason ?? outcome));
  return { notification_attempted: invoked, delivery_queued: false, native_invocation_confirmed: outcome === 'confirmed', ...settled };
}

export { deliveryStatus };
