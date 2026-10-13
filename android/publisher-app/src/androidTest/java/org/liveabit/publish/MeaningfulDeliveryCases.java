package org.liveabit.publish;

import android.content.Context;
import android.os.SystemClock;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.List;
import java.util.concurrent.TimeUnit;

/** Native sender traffic and persisted retry checks; no external agent run is needed. */
final class MeaningfulDeliveryCases {
    private static void check(boolean value, String message) { if (!value) throw new AssertionError(message); }
    private static JSONObject app(String packageName, Object duration, long transitions) throws Exception {
        return new JSONObject().put("application", new JSONObject().put("namespace", "android").put("id", packageName))
            .put("foreground_duration_ms", duration)
            .put("transition_count", transitions);
    }
    private static JSONObject event(JSONObject state, JSONArray apps) throws Exception {
        long now = System.currentTimeMillis();
        return OapObservation.create(state, now - 2000, now - 1000, now, apps);
    }
    private static JSONObject pending(JSONObject event) throws Exception {
        return new JSONObject().put("event_id", event.getString("event_id"))
            .put("expires_at", event.getString("expires_at"))
            .put("body", OpenClawWebhook.wrap(OapObservation.encode(event), "liveabit"));
    }
    private static void cycle(Context context, DeliveryEngine engine, boolean collect) throws Exception {
        ((PublisherApplication) context.getApplicationContext()).worker.submit(() -> engine.cycle(collect)).get(30, TimeUnit.SECONDS);
    }
    static void run(Context context, DeliveryEngine engine, List<String> passed) throws Exception {
        JSONObject state = PublisherStore.empty();
        JSONArray emptyApps = new JSONArray().put(app("org.liveabit.a", 0L, 8))
            .put(app("org.liveabit.b", JSONObject.NULL, 7));
        check(!DeliveryEngine.hasActivity(event(state, emptyApps)), "Zero or unknown duration triggered an agent packet");
        check(DeliveryEngine.hasActivity(event(state, new JSONArray().put(app("org.liveabit.a", 1L, 0))))
            && DeliveryEngine.hasActivity(event(state, new JSONArray().put(app("org.liveabit.a", JSONObject.NULL, 3))
                .put(app("org.liveabit.b", 12L, 0)))), "Positive use without a transition was skipped");
        passed.add("native_meaningful_gate_requires_positive_duration_not_transition_counts");

        engine.stop();
        try (var fixture = new OpenClawContractCases.HookFixture()) {
            engine.configure(fixture.endpoint(), "q".repeat(43), "org.liveabit.noevents", 60, "liveabit");
            long cursor = engine.snapshot().getLong("cursor"); Thread.sleep(100);
            cycle(context, engine, true);
            JSONObject empty = engine.snapshot();
            check(fixture.count() == 0 && empty.getJSONArray("pending").length() == 0
                && empty.getLong("sequence") == 0 && empty.getLong("cursor") > cursor
                && empty.getLong("failure_since") == 0 && empty.getString("status").contains("nothing sent")
                && empty.getJSONObject("foreground_context").getLong("wall") == empty.getLong("cursor"),
                "Manual send created empty traffic, false outage or failed to advance collection context");
            passed.add("native_manual_openclaw_send_skips_empty_and_advances_cursor_without_false_outage");

            PublisherStore store = new PublisherStore(context);
            JSONObject legacy = engine.snapshot();
            JSONObject zero = event(legacy, new JSONArray().put(app("org.liveabit.noevents", 0L, 9)));
            legacy.put("sequence", zero.getLong("sequence"));
            JSONObject unknown = event(legacy, new JSONArray().put(app("org.liveabit.noevents", JSONObject.NULL, 12)));
            legacy.put("pending", new JSONArray().put(pending(zero)).put(pending(unknown)))
                .put("sequence", unknown.getLong("sequence"))
                .put("failure_since", System.currentTimeMillis() - 1000)
                .put("failure_elapsed", SystemClock.elapsedRealtime() - 1000).put("outage_notified", true);
            store.write(legacy);
            cycle(context, engine, false);
            JSONObject migrated = engine.snapshot();
            check(fixture.count() == 0 && migrated.getJSONArray("pending").length() == 0
                && migrated.getLong("sequence") == unknown.getLong("sequence")
                && migrated.getLong("failure_since") == 0 && !migrated.getBoolean("outage_notified"),
                "Legacy empty requests reached OpenClaw or retained a false outage");
            passed.add("native_legacy_zero_unknown_queue_is_removed_without_model_run_or_sequence_rewrite");

            JSONObject retry = engine.snapshot();
            JSONObject meaningful = event(retry, new JSONArray().put(app("org.liveabit.noevents", 600L, 0)));
            JSONObject retained = pending(meaningful); String body = retained.getString("body");
            retry.put("sequence", meaningful.getLong("sequence"));
            JSONObject extraEmpty = event(retry, new JSONArray().put(app("org.liveabit.noevents", 0L, 2)));
            long failure = System.currentTimeMillis() - 1000;
            retry.put("pending", new JSONArray().put(pending(extraEmpty)).put(retained))
                .put("sequence", extraEmpty.getLong("sequence"))
                .put("failure_since", failure).put("failure_elapsed", SystemClock.elapsedRealtime() - 1000);
            store.write(retry); cycle(context, engine, true);
            JSONObject failed = engine.snapshot();
            check(fixture.count() == 1 && fixture.request(0).body.equals(body)
                && failed.getJSONArray("pending").length() == 1
                && failed.getJSONArray("pending").getJSONObject(0).getString("event_id").equals(meaningful.getString("event_id"))
                && failed.getJSONArray("pending").getJSONObject(0).getString("body").equals(body)
                && failed.getLong("failure_since") == failure,
                "Quiet collection changed a meaningful queued retry or its outage timer");
            passed.add("native_meaningful_pending_retry_preserves_identity_bytes_and_outage_while_collection_is_quiet");

            fixture.respond(200, "{\"ok\":true,\"runId\":\"meaningful-native-retry\"}");
            cycle(context, engine, true); JSONObject recovered = engine.snapshot();
            check(fixture.count() == 2 && fixture.request(1).body.equals(body)
                && recovered.getJSONArray("pending").length() == 0 && recovered.getLong("last_ack") > 0
                && recovered.getLong("sequence") == extraEmpty.getLong("sequence")
                && recovered.getLong("failure_since") == 0, "Meaningful retry did not recover unchanged");
            fixture.assertHealthy();
            passed.add("native_quiet_period_still_retries_prior_meaningful_packet_and_clears_outage");
        } finally { engine.stop(); }
    }
}
