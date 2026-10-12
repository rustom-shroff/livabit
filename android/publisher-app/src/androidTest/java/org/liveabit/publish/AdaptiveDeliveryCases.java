package org.liveabit.publish;

import android.app.Instrumentation;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.Context;
import android.os.SystemClock;
import org.json.JSONObject;
import java.io.FileInputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.TimeUnit;

/** Real screen power, native HTTP and actual one-off jobs in the installed Android APK. */
final class AdaptiveDeliveryCases {
    private static void check(boolean value, String text) { if (!value) throw new AssertionError(text); }
    private static void shell(Instrumentation tests, String command) throws Exception {
        try (var descriptor = tests.getUiAutomation().executeShellCommand(command);
                var input = new FileInputStream(descriptor.getFileDescriptor())) { input.readAllBytes(); }
    }
    private static void awaitScreen(Context context, boolean awake) throws Exception {
        long deadline = SystemClock.elapsedRealtime() + 5000;
        while (ScreenActivity.interactive(context) != awake && SystemClock.elapsedRealtime() < deadline) Thread.sleep(100);
        check(ScreenActivity.interactive(context) == awake, "Real screen power did not change");
        ((PublisherApplication) context.getApplicationContext()).worker.submit(() -> {}).get(30, TimeUnit.SECONDS);
    }
    private static JSONObject forceJob(Instrumentation tests, Context context, DeliveryEngine engine) throws Exception {
        JSONObject before = engine.snapshot(); long revision = before.getLong("schedule_revision");
        shell(tests, "cmd jobscheduler run -f org.liveabit.publish " + before.getInt("next_job_id"));
        long deadline = SystemClock.elapsedRealtime() + 30_000;
        while (SystemClock.elapsedRealtime() < deadline) {
            JSONObject state = engine.snapshot();
            if (state.getLong("schedule_revision") > revision) return state;
            Thread.sleep(100);
        }
        throw new AssertionError("Actual automatic job did not finish and schedule its successor");
    }
    static void run(Instrumentation tests, Context context, DeliveryEngine engine, List<String> passed) throws Exception {
        engine.stop();
        shell(tests, "input keyevent 224"); shell(tests, "wm dismiss-keyguard"); awaitScreen(context, true);
        check(engine.snapshot().getInt("send_minutes") == 5 && engine.snapshot().getInt("screen_off_minutes") == 15,
            "Adaptive defaults must be five and fifteen minutes");
        passed.add("native_adaptive_defaults_five_minute_send_fifteen_minute_idle");
        try (var fixture = new OpenClawContractCases.HookFixture()) {
            engine.configure(fixture.endpoint(), "q".repeat(43), "org.liveabit.fixture", 60);
            ((PublisherApplication) context.getApplicationContext()).worker.submit(() -> engine.cycle(true)).get(30, TimeUnit.SECONDS);
            JSONObject original = engine.snapshot(); String body = original.getJSONArray("pending").getJSONObject(0).getString("body");
            check(fixture.count() == 1, "No retained native request for adaptive trial");
            // An older persisted sender gains defaults without rewriting its queue or outage.
            PublisherStore store = new PublisherStore(context);
            JSONObject old = engine.snapshot(); old.remove("send_minutes"); old.remove("screen_off_minutes"); store.write(old);
            JSONObject migrated = store.read();
            check(migrated.getInt("send_minutes") == 5 && migrated.getInt("screen_off_minutes") == 15
                && migrated.getString("stream_id").equals(original.getString("stream_id"))
                && migrated.getJSONArray("pending").getJSONObject(0).getString("body").equals(body)
                && migrated.getLong("failure_since") == original.getLong("failure_since"), "Timing migration changed delivery state");
            passed.add("native_adaptive_upgrade_preserves_original_queue_and_outage");
            engine.updateTiming(1, 1, 60);
            JSONObject configured = engine.snapshot();
            check(configured.getString("stream_id").equals(original.getString("stream_id"))
                && configured.getJSONArray("pending").getJSONObject(0).getString("body").equals(body)
                && configured.getLong("failure_since") == original.getLong("failure_since"), "Timing update reset queue/session/outage");
            String beforeInvalid = configured.toString(); boolean refused = false;
            try { engine.updateTiming(0, 1, 60); } catch (IllegalArgumentException expected) { refused = true; }
            check(refused && engine.snapshot().toString().equals(beforeInvalid), "Invalid timing changed saved state");
            JobInfo job = context.getSystemService(JobScheduler.class).getPendingJob(configured.getInt("next_job_id"));
            check(job != null && !job.isPeriodic() && job.isPersisted() && job.getMinLatencyMillis() == 60_000,
                "Five-minute capable native schedule is not a persisted one-off job");
            passed.add("native_configurable_one_off_job_and_atomic_timing_update");

            shell(tests, "input keyevent 223"); awaitScreen(context, false);
            // Exercise the configurable cutoff with one real minute, rather than a fifteen-minute test delay.
            long deadline = SystemClock.elapsedRealtime() + 62_000;
            while (SystemClock.elapsedRealtime() < deadline) Thread.sleep(250);
            // Recover real Android screen history when the in-process broadcast cache is absent.
            JSONObject missingScreenCache = engine.snapshot();
            missingScreenCache.remove("screen_off_elapsed"); missingScreenCache.remove("screen_off_boot"); missingScreenCache.remove("screen_interactive");
            store.write(missingScreenCache);
            JSONObject asleep = forceJob(tests, context, engine);
            check(asleep.getBoolean("automatic_paused") && fixture.count() == 1
                && asleep.getJSONArray("pending").getJSONObject(0).getString("body").equals(body)
                && asleep.getLong("failure_since") == original.getLong("failure_since"),
                "Sleeping phone sent a request or discarded retained activity");
            passed.add("real_screen_off_cutoff_blocks_network_and_retains_pending_bytes");
            check(asleep.optLong("screen_off_elapsed", -1) >= 0, "Native usage source did not recover the screen-off transition");
            passed.add("native_screen_off_history_recovers_without_broadcast_cache");
            forceJob(tests, context, engine);
            check(fixture.count() == 1, "Idle recheck retried a queued request");
            passed.add("actual_idle_job_rechecks_without_network_traffic");

            fixture.respond(200, "{\"ok\":true,\"runId\":\"adaptive-native-check\"}");
            shell(tests, "input keyevent 224"); shell(tests, "wm dismiss-keyguard"); awaitScreen(context, true);
            engine.restoreScheduling();
            JSONObject recovered = forceJob(tests, context, engine);
            check(!recovered.getBoolean("automatic_paused") && recovered.getJSONArray("pending").length() == 0
                && recovered.getLong("last_ack") > 0 && fixture.count() >= 2 && fixture.request(1).body.equals(body),
                "Wake-up did not deliver the identical retained request");
            passed.add("real_screen_on_resumes_identical_pending_request");

            engine.configure(fixture.endpoint(), "q".repeat(43), "org.liveabit.noevents", 60);
            int emptyBefore = fixture.count(); long cursor = engine.snapshot().getLong("cursor");
            JSONObject empty = forceJob(tests, context, engine);
            check(fixture.count() == emptyBefore && empty.getJSONArray("pending").length() == 0
                && empty.getLong("sequence") == 0 && empty.getLong("cursor") > cursor && empty.getLong("failure_since") == 0,
                "No selected-app activity generated traffic or a false outage");
            passed.add("actual_automatic_job_skips_empty_observations_without_outage");

            engine.configure(fixture.endpoint(), "q".repeat(43), "org.liveabit.fixture", 60);
            shell(tests, "am start -W -n org.liveabit.fixture/.MainActivity"); Thread.sleep(1100);
            shell(tests, "am start -W -n org.liveabit.publish/.MainActivity"); Thread.sleep(300);
            int activeBefore = fixture.count();
            JSONObject active = forceJob(tests, context, engine);
            check(fixture.count() > activeBefore && active.getLong("last_ack") > 0
                && active.getJSONArray("pending").length() == 0, "Fresh selected-app activity did not send through the actual job");
            fixture.assertHealthy();
            passed.add("actual_automatic_job_sends_fresh_selected_app_activity");
        } finally {
            engine.stop(); engine.updateTiming(5, 15, 60);
            shell(tests, "input keyevent 224"); shell(tests, "wm dismiss-keyguard");
        }
        JobScheduler jobs = context.getSystemService(JobScheduler.class);
        check(jobs.getPendingJob(DeliveryEngine.PERIODIC_JOB) == null && jobs.getPendingJob(DeliveryEngine.NEXT_DELIVERY_JOB) == null,
            "Stop left an automatic job scheduled");
        passed.add("stop_cancels_both_adaptive_job_slots");
    }
}
