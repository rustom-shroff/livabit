package org.liveabit.publish;

import android.app.Instrumentation;
import android.app.NotificationManager;
import android.app.job.JobScheduler;
import android.content.Context;
import android.content.Intent;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.View;
import android.view.ViewGroup;
import android.view.accessibility.AccessibilityNodeInfo;
import android.widget.Button;
import android.widget.EditText;
import org.json.JSONArray;
import org.json.JSONObject;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.time.Instant;

/** Exercises the actual target APK, Android storage, OS usage query, network and notifications. */
public final class PublisherInstrumentation extends Instrumentation {
    private Bundle arguments;
    private final List<String> passed = new ArrayList<>();
    @Override public void onCreate(Bundle args) { super.onCreate(args); arguments = args; start(); }
    @Override public void onStart() {
        new Thread(() -> {
            Bundle result = new Bundle();
            try { runCases(); result.putString("result", "PASS"); result.putString("checks", String.join(";", passed)); finish(-1, result); }
            catch (Throwable error) { result.putString("result", "FAIL"); result.putString("failed_after", String.join(";", passed));
                result.putString("reason", error.getClass().getSimpleName() + ": " + error.getMessage()); finish(0, result); }
        }, "publisher-native-tests").start();
    }
    private static void check(boolean value, String message) { if (!value) throw new AssertionError(message); }
    private JSONObject api(String route, String mode) throws Exception {
        String base = arguments.getString("endpoint").replace("/events", "");
        HttpURLConnection connection = (HttpURLConnection) URI.create(base + route).toURL().openConnection();
        try {
            connection.setConnectTimeout(5000); connection.setReadTimeout(5000);
            connection.setRequestProperty("Authorization", "Bearer " + arguments.getString("key"));
            if (mode != null) {
                connection.setRequestMethod("POST"); connection.setDoOutput(true); connection.setRequestProperty("Content-Type", "application/json");
                try (var output = connection.getOutputStream()) { output.write(new JSONObject().put("mode", mode).toString().getBytes(StandardCharsets.UTF_8)); }
            }
            check(connection.getResponseCode() == 200, "Receiver control request failed");
            try (var input = connection.getInputStream()) { return new JSONObject(new String(input.readNBytes(1_048_576), StandardCharsets.UTF_8)); }
        } finally { connection.disconnect(); }
    }
    private int postEvent(String body) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) URI.create(arguments.getString("endpoint")).toURL().openConnection();
        try {
            connection.setConnectTimeout(5000); connection.setReadTimeout(5000);
            connection.setRequestMethod("POST"); connection.setDoOutput(true);
            connection.setRequestProperty("Authorization", "Bearer " + arguments.getString("key"));
            connection.setRequestProperty("Content-Type", "application/json");
            try (var output = connection.getOutputStream()) { output.write(body.getBytes(StandardCharsets.UTF_8)); }
            return connection.getResponseCode();
        } finally { connection.disconnect(); }
    }
    private void canonicalCases() throws Exception {
        JSONObject vector = new JSONObject().put("z", "/\n😀").put("a", new JSONArray().put(JSONObject.NULL).put(true).put(42));
        check(OapObservation.encode(vector).equals("{\"a\":[null,true,42],\"z\":\"/\\n😀\"}"), "Canonical key order, string escaping or nulls changed");
        JSONObject[] invalid = {
            new JSONObject().put("text", String.valueOf((char) 0xd800)),
            new JSONObject().put("number", 9_007_199_254_740_992L),
            new JSONObject().put("number", -1), new JSONObject().put("number", 1.5),
            new JSONObject().put("text", "x".repeat(OapObservation.MAX_BYTES))
        };
        for (JSONObject value : invalid) {
            boolean refused = false; try { OapObservation.encode(value); } catch (IllegalArgumentException expected) { refused = true; }
            check(refused, "Unsupported or oversized canonical value was encoded");
        }
        check(OapObservation.timestamp(1_000).equals("1970-01-01T00:00:01.000Z"), "OAP timestamp omitted milliseconds");
        passed.add("native_canonical_json_unicode_integer_and_byte_limits");
    }
    private void invalidObservations(JSONObject event) throws Exception {
        List<JSONObject> invalid = new ArrayList<>();
        invalid.add(new JSONObject(OapObservation.encode(event)).put("protocol_version", "0.1.0"));
        invalid.add(new JSONObject(OapObservation.encode(event)).put("unexpected", "synthetic extra field"));
        JSONObject value = new JSONObject(OapObservation.encode(event));
        value.getJSONObject("observation").put("coverage", "complete"); invalid.add(value);
        value = new JSONObject(OapObservation.encode(event));
        value.getJSONObject("observation").getJSONArray("apps").getJSONObject(0).put("foreground_duration_ms", 0); invalid.add(value);
        value = new JSONObject(OapObservation.encode(event));
        JSONArray apps = value.getJSONObject("observation").getJSONArray("apps");
        apps.put(new JSONObject(apps.getJSONObject(0).toString())); invalid.add(value);
        value = new JSONObject(OapObservation.encode(event));
        value.getJSONObject("observation").getJSONArray("apps").getJSONObject(0).put("transition_count", 4097); invalid.add(value);
        value = new JSONObject(OapObservation.encode(event));
        value.getJSONObject("window").put("end", value.getJSONObject("window").getString("start")); invalid.add(value);
        value = new JSONObject(OapObservation.encode(event));
        value.put("expires_at", OapObservation.timestamp(System.currentTimeMillis() - 1)); invalid.add(value);
        value = new JSONObject(OapObservation.encode(event));
        value.put("emitted_at", "2026-10-09T00:00:00Z"); invalid.add(value);
        value = new JSONObject(OapObservation.encode(event));
        long duration = Instant.parse(value.getJSONObject("window").getString("end")).toEpochMilli()
            - Instant.parse(value.getJSONObject("window").getString("start")).toEpochMilli();
        value.getJSONObject("observation").getJSONArray("apps").getJSONObject(0).put("foreground_duration_ms", duration + 1); invalid.add(value);
        for (JSONObject rejected : invalid) {
            rejected.put("event_id", UUID.randomUUID().toString());
            check(postEvent(OapObservation.encode(rejected)) == 400, "Receiver accepted invalid OAP metadata or measurements");
        }
        String canonical = OapObservation.encode(event);
        check(postEvent(" " + canonical) == 400, "Receiver accepted noncanonical event bytes");
        check(postEvent(canonical.substring(0, canonical.length() - 1) + ",\"sequence\":1}") == 400, "Receiver accepted duplicate JSON members");
        JSONObject oversized = new JSONObject(canonical).put("unexpected", "x".repeat(OapObservation.MAX_BYTES));
        check(postEvent(oversized.toString()) == 400, "Receiver accepted oversized OAP bytes");
        passed.add("actual_receiver_schema_and_semantic_rejections_from_android");
    }
    private void legacyMigration(Context context, DeliveryEngine engine, String endpoint, String token) throws Exception {
        PublisherStore store = new PublisherStore(context);
        JSONObject old = PublisherStore.empty(); long end = System.currentTimeMillis(), start = end - 1000;
        old.remove("recipient_id"); old.remove("subscription_id"); old.remove("scope_revision");
        JSONObject legacy = new JSONObject().put("format", "liveabit.test.activity.v1")
            .put("event_id", UUID.randomUUID().toString()).put("stream_id", old.getString("stream_id")).put("sequence", 1)
            .put("emitted_at", OapObservation.timestamp(end)).put("expires_at", OapObservation.timestamp(end + 86_400_000))
            .put("window", new JSONObject().put("start", OapObservation.timestamp(start)).put("end", OapObservation.timestamp(end)))
            .put("coverage", "unknown").put("quality", "unverified_estimate")
            .put("apps", new JSONArray().put(new JSONObject()
                .put("application", new JSONObject().put("namespace", "android").put("id", "org.liveabit.fixture"))
                .put("foreground_duration_ms", JSONObject.NULL).put("transition_count", 0)));
        String body = legacy.toString();
        old.put("enabled", true).put("url", endpoint).put("key", LocalSecret.seal(token))
            .put("packages", new JSONArray().put("org.liveabit.fixture")).put("sequence", 1).put("cursor", end)
            .put("failure_since", end - 1000).put("failure_elapsed", SystemClock.elapsedRealtime() - 1000)
            .put("boot_count", android.provider.Settings.Global.getInt(context.getContentResolver(), android.provider.Settings.Global.BOOT_COUNT, -1))
            .put("pending", new JSONArray().put(new JSONObject().put("event_id", legacy.getString("event_id"))
                .put("body", body).put("expires_at", legacy.getString("expires_at"))));
        store.write(old); JSONObject migrated = store.read(), reread = store.read();
        check(migrated.getString("recipient_id").equals(reread.getString("recipient_id"))
            && migrated.getString("subscription_id").equals(reread.getString("subscription_id"))
            && migrated.getString("stream_id").equals(old.getString("stream_id"))
            && migrated.getLong("failure_since") == old.getLong("failure_since")
            && migrated.getLong("cursor") == end && migrated.getLong("sequence") == 1
            && migrated.getJSONArray("pending").getJSONObject(0).getString("body").equals(body), "Legacy storage migration changed queued bytes or session");
        api("/api/mode", "acknowledge"); cycle(engine, false);
        check(engine.snapshot().getJSONArray("pending").length() == 0, "Retained older-APK event was not acknowledged");
        JSONArray records = api("/api/events", null).getJSONArray("events"); boolean found = false;
        for (int i = 0; i < records.length(); i++) {
            JSONObject record = records.getJSONObject(i);
            if (record.getJSONObject("event").getString("event_id").equals(legacy.getString("event_id"))) {
                check(record.getString("body_sha256").equals(DeliveryEngine.sha256(body.getBytes(StandardCharsets.UTF_8))), "Legacy delivery rewrote pending bytes");
                found = true;
            }
        }
        check(found, "Receiver did not retain older-format event"); engine.stop();
        passed.add("native_legacy_storage_migration_preserves_and_delivers_original_bytes");
    }
    private void openClawSetupGuides(Context context, DeliveryEngine engine) throws Exception {
        engine.stop();
        int port = 62283;
        String endpoint = "http://127.0.0.1:" + port + "/hooks/liveabit", token = "g".repeat(43);
        String setup = new JSONObject().put("format", OpenClawWebhook.SETUP_FORMAT).put("url", endpoint)
            .put("key", token).put("agent_id", "main").put("warning_minutes", 60).toString();
        var activity = (MainActivity) startActivitySync(new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        try {
            runOnMainSync(() -> {
                activity.getSystemService(ClipboardManager.class).setPrimaryClip(ClipData.newPlainText("OpenClaw setup", setup));
                findButton(activity.getWindow().getDecorView(), "Paste receiver setup").performClick();
            });
            check(((EditText) activity.findViewById(R.id.receiver_address)).getText().toString().equals(endpoint)
                && ((EditText) activity.findViewById(R.id.connection_key)).getText().toString().equals(token)
                && ((EditText) activity.findViewById(R.id.openclaw_agent)).getText().toString().equals("main"),
                "OpenClaw paste did not fill the imported destination");
            check(!engine.snapshot().getBoolean("enabled") && engine.snapshot().getJSONArray("pending").length() == 0,
                "OpenClaw setup import started sharing");
            for (int[] guide : new int[][] {
                {R.string.wifi_help_button, R.string.openclaw_wifi_help},
                {R.string.usb_help_button, R.string.openclaw_usb_help}
            }) {
                String expected = context.getString(guide[1], port);
                check(expected.contains("OpenClaw") && expected.contains(Integer.toString(port))
                    && !expected.contains("start-activity-receiver.ps1"), "OpenClaw guide gives test receiver instructions");
                runOnMainSync(() -> findButton(activity.getWindow().getDecorView(), context.getString(guide[0])).performClick());
                check(awaitNode(expected, 5000, "org.liveabit.publish") != null,
                    "Imported OpenClaw endpoint did not select its guide and actual port");
                clickNode(awaitNode("Close", 5000, "org.liveabit.publish")); waitForIdleSync();
            }
            passed.add("native_openclaw_paste_without_sharing_and_dynamic_wifi_usb_guides");
        } finally { runOnMainSync(activity::finish); }
    }
    private void runCases() throws Exception {
        waitForIdleSync(); // Wait for the target Application.onCreate before reading its native engine.
        Context context = getTargetContext(); DeliveryEngine engine = ((PublisherApplication) context.getApplicationContext()).engine();
        String endpoint = arguments.getString("endpoint"), token = arguments.getString("key");
        if ("openclaw_contract".equals(arguments.getString("phase"))) {
            openClawSetupGuides(context, engine);
            OpenClawContractCases.run(context, engine, passed); return;
        }
        if ("openclaw_live".equals(arguments.getString("phase"))) {
            OpenClawContractCases.live(context, engine, endpoint, token,
                arguments.getString("agent", OpenClawWebhook.AGENT_ID), passed); return;
        }
        if ("warnings_blocked".equals(arguments.getString("phase"))) {
            check(!engine.warningsEnabled(), "Warnings shown as enabled without notification permission");
            passed.add("denied_notification_permission_is_reported"); return;
        }
        check(engine.snapshot().getInt("alert_minutes") == 60, "Fresh install warning interval must be one hour");
        passed.add("default_one_hour_warning");
        if ("job_setup".equals(arguments.getString("phase"))) {
            engine.configure(endpoint, token, "org.liveabit.fixture", 60); passed.add("background_job_configured"); return;
        }
        if ("file_import".equals(arguments.getString("phase"))) {
            var activity = (MainActivity) startActivitySync(new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            runOnMainSync(() -> findButton(activity.getWindow().getDecorView(), "Import receiver setup file").performClick());
            AccessibilityNodeInfo file = awaitNode("liveabit-emulator-setup.json", 1500);
            if (file == null) {
                clickNode(awaitNode("Show roots", 5000));
                clickNode(awaitNode("Downloads", 5000));
                file = awaitNode("liveabit-emulator-setup.json", 5000);
            }
            clickNode(file);
            long deadline = SystemClock.elapsedRealtime() + 5000;
            boolean filled = false;
            while (!filled && SystemClock.elapsedRealtime() < deadline) {
                waitForIdleSync();
                filled = ((EditText) activity.findViewById(R.id.receiver_address)).getText().toString().equals(endpoint)
                    && ((EditText) activity.findViewById(R.id.connection_key)).getText().toString().equals(token);
                if (!filled) Thread.sleep(100);
            }
            check(filled, "Native file picker did not import receiver setup");
            check(!engine.snapshot().getBoolean("enabled"), "File import started sharing without user action");
            runOnMainSync(activity::finish); passed.add("actual_android_document_picker_imports_receiver_setup"); return;
        }
        canonicalCases();
        JSONObject setups = api("/api/setup", null);
        String setupText = null;
        JSONArray connections = setups.getJSONArray("connections");
        for (int i = 0; i < connections.length(); i++) {
            JSONObject candidate = connections.getJSONObject(i).getJSONObject("setup");
            if (candidate.getString("url").equals(endpoint)) setupText = candidate.toString();
        }
        check(setupText != null, "Receiver offers no emulator setup");
        ConnectionSetup setup = ConnectionSetup.parse(setupText);
        check(setup.url.equals(endpoint) && setup.key.equals(token) && setup.minutes == 60, "Receiver setup imports incorrect values");
        String[] invalidSetups = { "{}", setupText.replace("liveabit.receiver.connection.v1", "unrelated"),
            new JSONObject(setupText).put("url", "http://example.com/events").toString(), setupText.replace(token, "short"),
            new JSONObject(setupText).put("warning_minutes", 0).toString(),
            new JSONObject(setupText).put("warning_minutes", "60").toString(), "x".repeat(ConnectionSetup.MAX_BYTES + 1) };
        for (String invalid : invalidSetups) {
            boolean refused = false; try { ConnectionSetup.parse(invalid); } catch (Exception expected) { refused = true; }
            check(refused, "Invalid receiver setup was imported");
        }
        passed.add("real_receiver_setup_import_and_invalid_setup_rejection");
        check(ConnectionSetup.describe(endpoint).startsWith("Android emulator:"), "Emulator connection not identified");
        check(ConnectionSetup.describe("http://192.168.1.10:8765/events").equals("Wi-Fi / local network: 192.168.1.10:8765"), "Wi-Fi address not identified");
        check(ConnectionSetup.describe("http://127.0.0.1:8765/events").startsWith("USB:"), "USB connection not identified");
        check(ConnectionSetup.describe("").equals("No receiver configured"), "Empty setup shown as connected");
        passed.add("configured_connection_description");
        var setupActivity = (MainActivity) startActivitySync(new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        for (int[] guide : new int[][] { {R.string.wifi_help_button, R.string.wifi_help}, {R.string.usb_help_button, R.string.usb_help} }) {
            runOnMainSync(() -> findButton(setupActivity.getWindow().getDecorView(), context.getString(guide[0])).performClick());
            check(awaitNode(context.getString(guide[1]), 5000, "org.liveabit.publish") != null, "Connection guide did not render");
            clickNode(awaitNode("Close", 5000, "org.liveabit.publish")); waitForIdleSync();
        }
        passed.add("native_wifi_and_usb_instructions_render");
        String copiedSetup = setupText;
        runOnMainSync(() -> {
            setupActivity.getSystemService(ClipboardManager.class).setPrimaryClip(ClipData.newPlainText("Receiver setup", copiedSetup));
            findButton(setupActivity.getWindow().getDecorView(), "Paste receiver setup").performClick();
        });
        check(((EditText) setupActivity.findViewById(R.id.receiver_address)).getText().toString().equals(endpoint), "Paste did not fill receiver address");
        check(((EditText) setupActivity.findViewById(R.id.connection_key)).getText().toString().equals(token), "Paste did not fill connection key");
        check(!engine.snapshot().getBoolean("enabled"), "Import started sharing without user action");
        runOnMainSync(() -> {
            setupActivity.getSystemService(ClipboardManager.class).setPrimaryClip(ClipData.newPlainText("Invalid setup", "{}"));
            findButton(setupActivity.getWindow().getDecorView(), "Paste receiver setup").performClick();
        });
        check(((EditText) setupActivity.findViewById(R.id.receiver_address)).getText().toString().equals(endpoint), "Invalid paste changed connection settings");
        runOnMainSync(setupActivity::finish);
        passed.add("native_paste_fills_setup_without_starting_sharing");
        boolean rejected = false;
        try { DeliveryEngine.validateEndpoint("http://example.com/events"); } catch (IllegalArgumentException error) { rejected = true; }
        check(rejected, "Public cleartext receiver accepted");
        engine.configure(endpoint, token, "org.liveabit.fixture", 1);
        context.getSystemService(JobScheduler.class).cancel(DeliveryEngine.PERIODIC_JOB);
        check(!engine.snapshot().getString("key").equals(token), "Connection key stored unencrypted");
        check(LocalSecret.open(engine.snapshot().getString("key")).equals(token), "Android Keystore round trip failed");
        passed.add("native_setup_and_key_storage");
        api("/api/mode", "acknowledge"); cycle(engine, true);
        JSONObject state = engine.snapshot();
        check(state.getLong("last_ack") > 0 && state.getJSONArray("pending").length() == 0, "Real event not acknowledged");
        JSONArray records = api("/api/events", null).getJSONArray("events");
        check(records.length() > 0, "Receiver displayed no event");
        JSONObject event = records.getJSONObject(0).getJSONObject("event");
        check(event.getString("stream_id").equals(state.getString("stream_id")), "Wrong Android stream displayed");
        JSONArray apps = event.getJSONObject("observation").getJSONArray("apps");
        check(apps.length() == 1 && apps.getJSONObject(0).getJSONObject("application").getString("id").equals("org.liveabit.fixture"), "Unselected app shared");
        int observedTransitions = 0;
        for (int i = 0; i < records.length(); i++) {
            JSONObject received = records.getJSONObject(i).getJSONObject("event");
            if (received.getString("stream_id").equals(state.getString("stream_id"))) {
                JSONArray receivedApps = received.getJSONObject("observation").getJSONArray("apps");
                check(receivedApps.length() == 1 && receivedApps.getJSONObject(0).getJSONObject("application")
                    .getString("id").equals("org.liveabit.fixture"), "Background delivery shared an unselected app");
                observedTransitions += receivedApps.getJSONObject(0).getInt("transition_count");
            }
        }
        check(observedTransitions >= 2, "Real Android lifecycle transitions not observed");
        check("unknown".equals(event.getJSONObject("observation").getString("coverage")), "Coverage uncertainty lost");
        passed.add("actual_android_usage_to_receiver_and_matching_ack");
        check(event.getString("protocol_version").equals(OapObservation.VERSION) && event.getString("event_name").equals(OapObservation.EVENT_NAME)
            && event.getString("recipient_id").equals(state.getString("recipient_id"))
            && event.getString("subscription_id").equals(state.getString("subscription_id"))
            && event.getJSONObject("window").has("window_id")
            && "unverified_estimate".equals(event.getJSONObject("observation").getString("quality")), "OAP envelope lost its identity or uncertainty");
        check(records.getJSONObject(0).getString("body_sha256")
            .equals(DeliveryEngine.sha256(OapObservation.encode(event).getBytes(StandardCharsets.UTF_8))), "Android canonical bytes differ from received digest");
        passed.add("actual_oap_observation_envelope_and_canonical_wire_digest");
        invalidObservations(event);
        api("/api/mode", "wrong_acknowledgement"); Thread.sleep(30); cycle(engine, true);
        state = engine.snapshot(); check(state.getJSONArray("pending").length() > 0, "Wrong acknowledgement removed pending event");
        check(state.getString("status").contains("incorrect acknowledgement"), "Incorrect acknowledgement status not explained");
        JSONObject pending = state.getJSONArray("pending").getJSONObject(0);
        String id = pending.getString("event_id"), bytes = pending.getString("body");
        check(state.getLong("failure_since") > 0, "Missing acknowledgement timer not started");
        passed.add("wrong_event_ack_is_refused");
        long failureSince = state.getLong("failure_since"), failureElapsed = state.getLong("failure_elapsed");
        String stream = state.getString("stream_id"); long acknowledged = state.getLong("last_ack");
        String recipient = state.getString("recipient_id"), subscription = state.getString("subscription_id");
        check(engine.pendingToClear(endpoint, token, "org.liveabit.fixture\norg.liveabit.fixture", 2) == 0, "Same setup would clear pending activity");
        engine.configure(endpoint, token, "org.liveabit.fixture", 2);
        context.getSystemService(JobScheduler.class).cancel(DeliveryEngine.PERIODIC_JOB);
        state = engine.snapshot();
        check(state.getString("stream_id").equals(stream) && state.getLong("last_ack") == acknowledged
            && state.getString("recipient_id").equals(recipient) && state.getString("subscription_id").equals(subscription)
            && state.getLong("failure_since") == failureSince && state.getLong("failure_elapsed") == failureElapsed
            && state.getJSONArray("pending").getJSONObject(0).getString("body").equals(bytes)
            && state.getInt("alert_minutes") == 2, "Routine Start sharing reset the saved session");
        engine.updateAlert(1);
        check(engine.pendingToClear("http://127.0.0.1:1/events", token, "org.liveabit.fixture", 1) > 0,
            "Changed receiver did not report pending activity to clear");
        check(engine.pendingToClear(endpoint, token, "org.liveabit.publish", 1) > 0,
            "Changed selected apps did not report pending activity to clear");
        passed.add("repeat_start_preserves_pending_session_and_outage_timer");
        api("/api/mode", "no_acknowledgement"); cycle(engine, false);
        JSONObject reopened = new DeliveryEngine(context).snapshot();
        check(reopened.getString("status").contains("Receiver is unavailable"), "Unavailable receiver status not explained");
        check(reopened.getJSONArray("pending").getJSONObject(0).getString("body").equals(bytes), "Restart changed pending bytes");
        check(reopened.getJSONArray("pending").getJSONObject(0).getString("event_id").equals(id), "Restart changed pending identity");
        int copies = 0; records = api("/api/events", null).getJSONArray("events");
        for (int i = 0; i < records.length(); i++) if (records.getJSONObject(i).getJSONObject("event").getString("event_id").equals(id)) copies++;
        check(copies == 1, "Receiver duplicated a retried event");
        passed.add("durable_pending_bytes_retry_and_receiver_deduplication");
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        check(manager.getActiveNotifications().length == 0, "Warning posted before configured deadline");
        engine.updateAlert(1); check(engine.snapshot().getInt("alert_minutes") == 1, "Warning interval did not persist");
        long deadline = engine.snapshot().getLong("failure_elapsed") + 60_050;
        while (SystemClock.elapsedRealtime() < deadline) { Thread.sleep(1000); engine.checkHealth(); }
        engine.checkHealth();
        check(manager.getActiveNotifications().length == 1, "No actual Android outage notification");
        check(manager.getActiveNotifications()[0].getId() == DeliveryEngine.OUTAGE_NOTIFICATION, "Wrong notification");
        check("Receiver is down".contentEquals(manager.getActiveNotifications()[0].getNotification().extras.getCharSequence("android.title")), "Incorrect outage notification title");
        engine.checkHealth(); check(manager.getActiveNotifications().length == 1, "Repeated warning created extra notifications");
        passed.add("configurable_one_minute_real_time_android_outage_notification");
        api("/api/mode", "acknowledge"); cycle(engine, false);
        check(engine.snapshot().getJSONArray("pending").length() == 0 && engine.snapshot().getLong("failure_since") == 0,
            "Receiver recovery did not acknowledge retained page");
        check(manager.getActiveNotifications().length == 0, "Recovery did not clear warning");
        passed.add("recovery_clears_pending_and_outage_notification");
        api("/api/mode", "no_acknowledgement"); Thread.sleep(30); cycle(engine, true);
        check(engine.snapshot().getJSONArray("pending").length() > 0, "Failure not retained before stop");
        engine.stop(); check(!engine.snapshot().getBoolean("enabled") && engine.snapshot().getJSONArray("pending").length() == 0,
            "Stop did not disable sharing and erase pending activity");
        api("/api/mode", "acknowledge");
        passed.add("stop_sharing_clears_pending_and_jobs");
        engine.configure(endpoint, "z".repeat(43).equals(token) ? "y".repeat(43) : "z".repeat(43), "org.liveabit.fixture", 60);
        context.getSystemService(JobScheduler.class).cancel(DeliveryEngine.PERIODIC_JOB);
        cycle(engine, true);
        check(engine.snapshot().getString("status").contains("refused the connection key")
            && engine.snapshot().getJSONArray("pending").length() > 0, "Incorrect key failure not displayed or retained");
        passed.add("real_receiver_rejects_bad_key_with_clear_status");
        JSONObject beforeSwitch = engine.snapshot();
        var switchActivity = (MainActivity) startActivitySync(new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        runOnMainSync(() -> {
            ((EditText) switchActivity.findViewById(R.id.receiver_address)).setText("http://127.0.0.1:1/events");
            ((EditText) switchActivity.findViewById(R.id.connection_key)).setText(token);
            findButton(switchActivity.getWindow().getDecorView(), "Start sharing").performClick();
        });
        check(awaitNode("Change sharing setup?", 5000, "org.liveabit.publish") != null, "Changed setup cleared activity without confirmation");
        clickNode(awaitNode("Cancel", 5000, "org.liveabit.publish")); waitForIdleSync();
        check(engine.snapshot().getString("stream_id").equals(beforeSwitch.getString("stream_id"))
            && engine.snapshot().getJSONArray("pending").getJSONObject(0).getString("body")
                .equals(beforeSwitch.getJSONArray("pending").getJSONObject(0).getString("body")), "Cancelling setup change erased pending activity");
        runOnMainSync(() -> findButton(switchActivity.getWindow().getDecorView(), "Start sharing").performClick());
        clickNode(awaitNode("Switch and clear", 5000, "org.liveabit.publish")); waitForIdleSync();
        context.getSystemService(JobScheduler.class).cancel(DeliveryEngine.PERIODIC_JOB);
        cycle(engine, false); // Wait behind the actual UI send on the serial app worker.
        check(!engine.snapshot().getString("stream_id").equals(beforeSwitch.getString("stream_id"))
            && !engine.snapshot().getString("recipient_id").equals(beforeSwitch.getString("recipient_id"))
            && !engine.snapshot().getString("subscription_id").equals(beforeSwitch.getString("subscription_id"))
            && engine.snapshot().getString("url").equals("http://127.0.0.1:1/events"), "Confirmed setup change did not start the new session");
        for (int i = 0; i < engine.snapshot().getJSONArray("pending").length(); i++)
            check(!engine.snapshot().getJSONArray("pending").getJSONObject(i).getString("event_id")
                .equals(beforeSwitch.getJSONArray("pending").getJSONObject(0).getString("event_id")), "Confirmed change retained old receiver activity");
        runOnMainSync(switchActivity::finish);
        passed.add("native_setup_change_cancel_retains_and_confirm_clears_pending");
        check(engine.snapshot().getString("status").contains("Cannot reach receiver")
            && engine.snapshot().getJSONArray("pending").length() > 0, "Disconnected receiver failure not displayed or retained");
        passed.add("real_connection_failure_has_clear_status");
        engine.stop();
        var activity = startActivitySync(new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        check(activity != null, "Native connection screen failed to open"); runOnMainSync(activity::finish);
        passed.add("native_connection_screen_opens");
        engine.updateAlert(60);
        legacyMigration(context, engine, endpoint, token);
    }
    private static Button findButton(View view, String label) {
        if (view instanceof Button && ((Button) view).getText().toString().equals(label)) return (Button) view;
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) {
                Button result = findButton(group.getChildAt(i), label); if (result != null) return result;
            }
        }
        return null;
    }
    private void cycle(DeliveryEngine engine, boolean collect) throws Exception {
        // Use the same serial Android worker as the UI and JobService, including already-dispatched jobs.
        ((PublisherApplication) getTargetContext().getApplicationContext()).worker.submit(() -> engine.cycle(collect))
            .get(30, java.util.concurrent.TimeUnit.SECONDS);
    }
    private AccessibilityNodeInfo awaitNode(String text, long timeout) throws Exception {
        return awaitNode(text, timeout, "com.android.documentsui");
    }
    private AccessibilityNodeInfo awaitNode(String text, long timeout, String packageName) throws Exception {
        long deadline = SystemClock.elapsedRealtime() + timeout;
        do {
            AccessibilityNodeInfo root = getUiAutomation().getRootInActiveWindow();
            if (root != null && packageName.equals(String.valueOf(root.getPackageName()))) {
                List<AccessibilityNodeInfo> nodes = root.findAccessibilityNodeInfosByText(text);
                for (AccessibilityNodeInfo node : nodes)
                    // Android's Material buttons expose their displayed uppercase label.
                    if (text.equalsIgnoreCase(String.valueOf(node.getText())) || text.equalsIgnoreCase(String.valueOf(node.getContentDescription()))) return node;
            }
            Thread.sleep(100);
        } while (SystemClock.elapsedRealtime() < deadline);
        return null;
    }
    private static void clickNode(AccessibilityNodeInfo node) {
        check(node != null, "Android screen item was not found");
        while (!node.isClickable() && node.getParent() != null) node = node.getParent();
        check(node.performAction(AccessibilityNodeInfo.ACTION_CLICK), "Android screen item could not be selected");
    }
}
