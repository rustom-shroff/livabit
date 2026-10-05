// Disposable synthetic final destination for the two-process demo. No forwarding.
import { Receiver, createReceiverState } from './receiver.mjs';
import { JsonStore } from './storage.mjs';
import { ManualClock } from './clock.mjs';

let receiver, clock, server, store;
let accepted = 0, duplicates = 0;
let queue = Promise.resolve();
process.on('message', message => {
  queue = queue.then(async () => {
    const { id, operation, value } = message;
    try {
      let result;
      if (operation === 'setup' && !receiver && value.synthetic_only === true) {
        clock = new ManualClock(value.clock_now);
        store = new JsonStore(value.state_path, createReceiverState());
        receiver = new Receiver({ store, clock });
        await receiver.configure(value.credential);
        const consume = receiver.consume.bind(receiver);
        receiver.consume = async (...args) => {
          const receipt = await consume(...args);
          if (receipt.disposition === 'accepted') accepted++;
          else duplicates++;
          return receipt;
        };
        server = await receiver.startServer({ port: value.port ?? 0 });
        result = { base_url: server.baseUrl };
      } else if (operation === 'advance' && receiver && Number.isSafeInteger(value) && value >= 0) {
        clock.advance(value); result = { clock_now: clock.now() };
      } else if (operation === 'counts' && receiver) {
        const state = await receiver.snapshot();
        result = { accepted, duplicates, retained_pages: Object.keys(state.ledger).length,
          complete_windows: Object.values(state.groups).filter(group => group.complete).length };
      } else if (operation === 'close' && receiver) {
        await server.close(); await store.close(); result = { closed: true };
      } else throw new Error('Invalid synthetic worker operation.');
      process.send({ id, result });
      if (operation === 'close') process.disconnect();
    } catch (error) {
      process.send({ id, error: { code: error?.code ?? 'temporary_unavailable' } });
    }
  });
});
process.on('disconnect', () => { server?.close().finally(() => process.exit(0)); });
