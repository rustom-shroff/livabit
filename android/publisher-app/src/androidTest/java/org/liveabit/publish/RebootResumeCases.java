package org.liveabit.publish;

import android.app.job.JobScheduler;
import android.content.Context;
import org.json.JSONObject;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.TimeUnit;

/** Prepares native state around actual device reboots performed by the owned emulator harness. */
final class RebootResumeCases {
    private static final String BACKUP = "reboot-test-original.json";
    private static final String APP = "org.liveabit.fixture";
    private static void check(boolean value, String message) { if (!value) throw new AssertionError(message); }
    private static void idle(Context context) throws Exception {
        ((PublisherApplication) context.getApplicationContext()).worker.submit(() -> {}).get(30, TimeUnit.SECONDS);
    }
    static void prepareOn(Context context, DeliveryEngine engine, String endpoint, String token, List<String> passed) throws Exception {
        idle(context);
        try (var output = context.openFileOutput(BACKUP, Context.MODE_PRIVATE)) {
            output.write(engine.snapshot().toString().getBytes(StandardCharsets.UTF_8));
        }
        engine.stop();
        engine.updateTiming(3, 17, 73);
        engine.configure(endpoint, token, APP, 73);
        ((PublisherApplication) context.getApplicationContext()).worker.submit(() -> engine.cycle(true)).get(30, TimeUnit.SECONDS);
        JSONObject state = engine.snapshot();
        check(state.getBoolean("enabled") && state.getJSONArray("pending").length() > 0 && state.getLong("failure_since") > 0,
            "Reboot fixture did not retain a real unacknowledged observation");
        for (int i = 0; i < state.getJSONArray("pending").length(); i++) {
            JSONObject item = state.getJSONArray("pending").getJSONObject(i);
            check(DeliveryEngine.hasActivity(new JSONObject(item.getString("body"))), "Reboot fixture contained no meaningful use");
        }
        check(endpoint.equals(state.getString("url")) && token.equals(LocalSecret.open(state.getString("key")))
            && state.getJSONArray("packages").length() == 1 && APP.equals(state.getJSONArray("packages").getString(0))
            && state.getInt("send_minutes") == 3 && state.getInt("screen_off_minutes") == 17 && state.getInt("alert_minutes") == 73,
            "Reboot fixture configuration was not saved");
        passed.add("native_reboot_fixture_saves_meaningful_pending_activity_and_custom_configuration");
        // Remove even the persisted jobs. A schedule appearing after reboot must come from startup restoration.
        JobScheduler jobs = context.getSystemService(JobScheduler.class);
        jobs.cancelAll();
        check(jobs.getAllPendingJobs().isEmpty(), "Owned jobs were not removed before the real reboot");
        passed.add("native_reboot_fixture_cancels_all_publisher_jobs_to_isolate_startup_restoration");
    }
    static void prepareOff(Context context, DeliveryEngine engine, String endpoint, String token, List<String> passed) throws Exception {
        idle(context);
        JSONObject before = engine.snapshot();
        check(before.getBoolean("enabled") && endpoint.equals(before.getString("url"))
            && token.equals(LocalSecret.open(before.getString("key"))) && before.getLong("last_ack") > 0
            && before.getJSONArray("pending").length() == 0, "Post-reboot delivery did not recover the saved encrypted connection");
        engine.stop();
        JSONObject state = engine.snapshot();
        for (String name : new String[] {"url", "key", "agent_id", "packages", "send_minutes", "screen_off_minutes", "alert_minutes", "stream_id"}) {
            check(before.get(name).toString().equals(state.get(name).toString()), "Stop changed saved setup: " + name);
        }
        check(!state.getBoolean("enabled") && state.getJSONArray("pending").length() == 0
            && context.getSystemService(JobScheduler.class).getAllPendingJobs().isEmpty(), "Stop left sharing or publisher jobs active");
        passed.add("native_stop_preserves_setup_and_cancels_jobs_before_stopped_reboot");
    }
    static void restoreOriginal(Context context, DeliveryEngine engine) throws Exception {
        idle(context);
        File backup = new File(context.getFilesDir(), BACKUP);
        JSONObject original;
        try (var input = context.openFileInput(BACKUP)) {
            byte[] bytes = input.readNBytes(1_048_577);
            check(bytes.length <= 1_048_576, "Private reboot fixture backup was too large");
            original = new JSONObject(new String(bytes, StandardCharsets.UTF_8));
        }
        engine.stop();
        new PublisherStore(context).write(original);
        engine.restoreScheduling();
        check(backup.delete(), "Private reboot fixture backup was not removed");
    }
}
