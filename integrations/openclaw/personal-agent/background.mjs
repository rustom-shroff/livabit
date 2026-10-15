import { readSettings } from './runtime.mjs';
import { runAnalysisTick } from './analysis.mjs';
import { drainNotifications } from './notification.mjs';

export function createBackgroundService({ runtime, logger, getSettings = readSettings,
  reviewTick = runAnalysisTick, deliveryTick = drainNotifications,
  schedule = setInterval, cancel = clearInterval } = {}) {
  let generation = 0, timer, abortCurrent;
  return {
    id: 'liveabit-background-work',
    start() {
      if (timer !== undefined) cancel(timer);
      abortCurrent?.();
      const owner = ++generation, controller = new AbortController();
      let reviewWorking = false, deliveryWorking = false;
      const guard = () => {
        if (generation !== owner || controller.signal.aborted) throw new Error('invocation_unavailable');
      };
      const review = async () => {
        if (reviewWorking || generation !== owner) return;
        reviewWorking = true;
        try { await reviewTick({ runtime, getSettings, guard }); }
        catch { if (generation === owner) logger.warn('liveabit analysis unavailable; durable review deadlines remain in force.'); }
        finally { reviewWorking = false; }
      };
      const deliver = async () => {
        if (deliveryWorking || generation !== owner) return;
        deliveryWorking = true;
        try { await deliveryTick({ settings: getSettings(), nodes: runtime.nodes, guard,
          signal: controller.signal, getSettings }); }
        catch { if (generation === owner) logger.warn('liveabit delivery unavailable; durable delivery deadlines remain in force.'); }
        finally { deliveryWorking = false; }
      };
      const tick = () => { void review(); void deliver(); };
      tick(); timer = schedule(tick, 30000); timer.unref?.();
      // A stop/start owns fresh flags and closures; old async work cannot be
      // revived by the next start or clear its new owner's in-flight flags.
      abortCurrent = () => controller.abort();
    },
    stop() {
      generation++; cancel(timer); abortCurrent?.(); abortCurrent = undefined; timer = undefined;
    }
  };
}
