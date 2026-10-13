package org.liveabit.publish;

import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.inputmethod.InputMethodManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/** User-facing regressions: expanded controls and real downloaded-file imports. */
final class SetupRegressionCases {
    private static final List<String> OPTIONS = List.of("Import receiver file", "Connect to OpenClaw", "Edit connection manually");
    private static void check(boolean value, String message) { if (!value) throw new AssertionError(message); }

    static void ui(Instrumentation test, Context context, DeliveryEngine engine, List<String> passed) throws Exception {
        engine.stop();
        MainActivity activity = open(test, context);
        MainActivity recreated = null;
        try {
            assertConnectionOptions(activity);
            test.runOnMainSync(() -> activity.findViewById(R.id.edit_connection).performClick());
            check(activity.findViewById(R.id.receiver_address).isShown() && activity.findViewById(R.id.connection_key).isShown(),
                "Manual editing did not reveal the connection fields");
            assertConnectionOptions(activity);
            passed.add("native_expanding_manual_connection_keeps_exactly_three_actions");
            test.runOnMainSync(() -> {
                activity.findViewById(R.id.receiver_address).requestFocus();
                context.getSystemService(InputMethodManager.class).showSoftInput(activity.findViewById(R.id.receiver_address), InputMethodManager.SHOW_IMPLICIT);
            });
            test.waitForIdleSync();
            long keyboardDeadline = SystemClock.elapsedRealtime() + 3000;
            while (!activity.getWindow().getDecorView().getRootWindowInsets().isVisible(WindowInsets.Type.ime())
                    && SystemClock.elapsedRealtime() < keyboardDeadline) Thread.sleep(50);
            check(activity.getWindow().getDecorView().getRootWindowInsets().isVisible(WindowInsets.Type.ime()),
                "Manual keyboard regression did not actually open the keyboard");
            assertConnectionOptions(activity);
            capture(test, activity, "setup-manual-screen.png");
            passed.add("native_manual_connection_keyboard_does_not_reintroduce_extra_actions");
            var monitor = test.addMonitor(MainActivity.class.getName(), null, false);
            test.runOnMainSync(activity::recreate);
            recreated = (MainActivity) monitor.waitForActivityWithTimeout(5000); test.removeMonitor(monitor);
            check(recreated != null && recreated.findViewById(R.id.setup_page).isShown()
                && recreated.findViewById(R.id.receiver_address).isShown(), "Recreation lost the expanded manual editor");
            assertConnectionOptions(recreated);
            passed.add("native_expanded_manual_editor_recreation_keeps_exactly_three_actions");
            MainActivity active = recreated;
            test.runOnMainSync(() -> {
                ((EditText) active.findViewById(R.id.receiver_address)).setText("");
                ((EditText) active.findViewById(R.id.connection_key)).setText("");
                active.findViewById(R.id.connect_openclaw).performClick();
            });
            check(awaitNode(test, "Import receiver file", 5000, "org.liveabit.publish") != null, "Missing-configuration dialog did not open");
            List<String> dialogActions = accessibleButtons(test.getUiAutomation().getRootInActiveWindow());
            check(dialogActions.size() == 3 && dialogActions.contains("import receiver file")
                && dialogActions.contains("edit connection manually") && dialogActions.contains("close"),
                "Connect dialog reintroduced additional connection actions");
            clickNode(test, awaitNode(test, "Close", 5000, "org.liveabit.publish"));
            passed.add("native_missing_configuration_dialog_offers_only_import_manual_and_close");
        } finally {
            if (recreated != null) { MainActivity closing = recreated; test.runOnMainSync(closing::finish); }
            test.runOnMainSync(activity::finish); engine.stop();
        }
    }

    static void importFiles(Instrumentation test, Context context, DeliveryEngine engine, Bundle arguments, List<String> passed) throws Exception {
        engine.stop();
        String endpoint = arguments.getString("endpoint"), token = arguments.getString("key");
        JSONObject original = engine.snapshot();
        long end = System.currentTimeMillis();
        JSONObject retained = OapObservation.create(original, end - 1000, end, end,
            new JSONArray().put(new JSONObject().put("application", new JSONObject().put("namespace", "android").put("id", "org.liveabit.fixture"))
                .put("foreground_duration_ms", 1000).put("transition_count", 0)));
        original.put("enabled", true).put("url", endpoint).put("key", LocalSecret.seal(token))
            .put("agent_id", "liveabit").put("packages", new JSONArray().put("org.liveabit.fixture"))
            .put("cursor", end).put("sequence", retained.getLong("sequence"))
            .put("pending", new JSONArray().put(new JSONObject().put("event_id", retained.getString("event_id"))
                .put("body", OapObservation.encode(retained)).put("expires_at", retained.getString("expires_at"))));
        new PublisherStore(context).write(original);
        MainActivity activity = open(test, context);
        JSONObject before = engine.snapshot();
        try {
            // The first import reproduces the exact retained-file failure reported on the phone.
            importFile(test, activity, "liveabit-retained-openclaw-wifi.json");
            awaitImported(test, activity, arguments.getString("legacy_url"), arguments.getString("legacy_key"), "liveabit");
            check(status(activity).contains("Older OpenClaw setup updated to liveabit"), "Retained main-agent file was not visibly migrated");
            assertRetained(before, engine.snapshot());
            passed.add("actual_picker_migrates_retained_main_agent_wifi_export_without_changing_saved_sharing");

            // This deliberately blocks the real sharing queue. Imports must still finish promptly.
            CountDownLatch held = new CountDownLatch(1), release = new CountDownLatch(1);
            var worker = ((PublisherApplication) context.getApplicationContext()).worker.submit(() -> {
                held.countDown();
                try { release.await(40, TimeUnit.SECONDS); } catch (InterruptedException error) { Thread.currentThread().interrupt(); }
            });
            try {
                check(held.await(5000, TimeUnit.MILLISECONDS), "Sharing worker fixture did not start");
                // Current and retained exports can share their address/key. Make the
                // draft distinct so stale fields/status cannot masquerade as success.
                test.runOnMainSync(() -> {
                    ((EditText) activity.findViewById(R.id.receiver_address)).setText("https://unapplied-draft.invalid/hooks/agent");
                    ((EditText) activity.findViewById(R.id.connection_key)).setText("q".repeat(43));
                    ((EditText) activity.findViewById(R.id.openclaw_agent)).setText("main");
                });
                importFile(test, activity, "liveabit-current-openclaw-wifi.json");
                awaitImported(test, activity, arguments.getString("wifi_url"), arguments.getString("wifi_key"), "liveabit");
                check(!worker.isDone(), "Import was queued behind the active sharing worker");
                assertRetained(before, engine.snapshot());
            } finally { release.countDown(); worker.get(5000, TimeUnit.MILLISECONDS); }
            passed.add("actual_picker_imports_generated_openclaw_wifi_file_without_waiting_for_sharing");
            passed.add("actual_openclaw_file_import_preserves_enabled_selection_and_pending_bytes");

            String[] draft = fields(activity);
            importFile(test, activity, "liveabit-wrong-host-connection.json");
            awaitFailure(test, activity);
            String hostError = status(activity);
            check(hostError.contains("android-wifi-setup.json") && !hostError.contains(arguments.getString("wifi_key")),
                "Host connection.json rejection does not identify the usable Android setup file safely");
            check(java.util.Arrays.equals(draft, fields(activity)), "Wrong host file changed the connection draft");
            assertRetained(before, engine.snapshot());
            capture(test, activity, "setup-import-error-screen.png");
            closeError(test);
            passed.add("actual_picker_wrong_host_file_shows_actionable_error_and_preserves_draft_and_pending_bytes");

            importFile(test, activity, "liveabit-malformed-secret.json");
            awaitFailure(test, activity);
            String malformedError = status(activity);
            String privateFixtureKey = "malformed_private_fixture_key_do_not_echo_12345";
            check(!malformedError.contains(privateFixtureKey) && !allAccessibleText(test.getUiAutomation().getRootInActiveWindow()).contains(privateFixtureKey)
                && malformedError.toLowerCase(Locale.ROOT).contains("json"), "Malformed import leaked file content or hid the useful error");
            check(java.util.Arrays.equals(draft, fields(activity)), "Malformed file changed the connection draft");
            assertRetained(before, engine.snapshot()); closeError(test);
            passed.add("actual_picker_malformed_secret_bearing_file_reports_safe_error_without_changing_saved_state");

            importFile(test, activity, "liveabit-emulator-setup.json");
            awaitImported(test, activity, endpoint, token, "liveabit");
            assertRetained(before, engine.snapshot());
            passed.add("actual_picker_receiver_setup_still_imports_without_applying_draft_or_clearing_pending_bytes");
        } finally { test.runOnMainSync(activity::finish); engine.stop(); }
    }

    private static void assertRetained(JSONObject before, JSONObject after) throws Exception {
        for (String field : new String[] {"enabled", "url", "key", "agent_id", "packages", "send_minutes", "screen_off_minutes", "alert_minutes",
                "stream_id", "recipient_id", "subscription_id", "scope_revision", "cursor", "sequence", "pending", "failure_since", "failure_elapsed"})
            check(String.valueOf(before.get(field)).equals(String.valueOf(after.get(field))), "Import changed saved sharing field: " + field);
    }
    private static MainActivity open(Instrumentation test, Context context) {
        MainActivity activity = (MainActivity) test.startActivitySync(new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        test.runOnMainSync(() -> findButton(activity.getWindow().getDecorView(), "Setup").performClick());
        return activity;
    }
    private static void assertConnectionOptions(MainActivity activity) {
        ViewGroup card = (ViewGroup) activity.findViewById(R.id.import_receiver).getParent();
        List<String> actions = new ArrayList<>(); visibleButtons(card, actions);
        check(actions.equals(OPTIONS), "Expanded connection editor must offer exactly Import receiver file, Connect to OpenClaw and Edit connection manually");
    }
    private static void visibleButtons(View view, List<String> labels) {
        if (!view.isShown()) return;
        if (view instanceof Button) labels.add(((Button) view).getText().toString());
        if (view instanceof ViewGroup) for (int index = 0; index < ((ViewGroup) view).getChildCount(); index++) visibleButtons(((ViewGroup) view).getChildAt(index), labels);
    }
    private static Button findButton(View view, String label) {
        if (view instanceof Button && view.isShown() && ((Button) view).getText().toString().equals(label)) return (Button) view;
        if (view instanceof ViewGroup) for (int i = 0; i < ((ViewGroup) view).getChildCount(); i++) {
            Button found = findButton(((ViewGroup) view).getChildAt(i), label); if (found != null) return found;
        }
        return null;
    }
    private static void importFile(Instrumentation test, MainActivity activity, String filename) throws Exception {
        test.runOnMainSync(() -> activity.findViewById(R.id.import_receiver).performClick());
        AccessibilityNodeInfo file = awaitNode(test, filename, 1500, "com.android.documentsui");
        if (file == null) {
            clickNode(test, awaitNode(test, "Show roots", 5000, "com.android.documentsui"));
            clickNode(test, awaitNode(test, "Downloads", 5000, "com.android.documentsui"));
            file = awaitNode(test, filename, 5000, "com.android.documentsui");
        }
        check(file != null, "Owned document-picker fixture was not visible: " + filename);
        clickNode(test, file);
    }
    private static void awaitImported(Instrumentation test, MainActivity activity, String url, String key, String agent) throws Exception {
        long deadline = SystemClock.elapsedRealtime() + 7000;
        do {
            test.waitForIdleSync();
            String[] values = fields(activity);
            if (values[0].equals(url) && values[1].equals(key) && values[2].equals(agent)
                && (status(activity).toLowerCase(Locale.ROOT).contains("import") || status(activity).contains("updated to liveabit"))
                && activity.findViewById(R.id.import_receiver).isEnabled()) return;
            Thread.sleep(50);
        } while (SystemClock.elapsedRealtime() < deadline);
        throw new AssertionError("Downloaded setup file was not imported into the connection draft");
    }
    private static String[] fields(MainActivity activity) {
        return new String[] {((EditText) activity.findViewById(R.id.receiver_address)).getText().toString(),
            ((EditText) activity.findViewById(R.id.connection_key)).getText().toString(),
            ((EditText) activity.findViewById(R.id.openclaw_agent)).getText().toString()};
    }
    private static String status(MainActivity activity) { return ((TextView) activity.findViewById(R.id.connection_check_status)).getText().toString(); }
    private static void awaitFailure(Instrumentation test, MainActivity activity) throws Exception {
        check(awaitNode(test, "Could not import connection", 7000, "org.liveabit.publish") != null
            && activity.findViewById(R.id.connection_check_status).isShown() && !status(activity).isBlank()
            && activity.findViewById(R.id.import_receiver).isEnabled(), "Import failed without a persistent result and error dialog");
    }
    private static void closeError(Instrumentation test) throws Exception { clickNode(test, awaitNode(test, "Close", 5000, "org.liveabit.publish")); }
    private static void clickNode(Instrumentation test, AccessibilityNodeInfo node) {
        check(node != null, "Required native UI action was absent");
        AccessibilityNodeInfo clickable = node;
        while (!clickable.isClickable() && clickable.getParent() != null) clickable = clickable.getParent();
        check(clickable.performAction(AccessibilityNodeInfo.ACTION_CLICK), "Native UI click failed"); test.waitForIdleSync();
    }
    private static AccessibilityNodeInfo awaitNode(Instrumentation test, String text, long timeout, String packageName) throws Exception {
        long deadline = SystemClock.elapsedRealtime() + timeout;
        do {
            AccessibilityNodeInfo root = test.getUiAutomation().getRootInActiveWindow();
            if (root != null && packageName.equals(String.valueOf(root.getPackageName())))
                for (AccessibilityNodeInfo node : root.findAccessibilityNodeInfosByText(text))
                    if (text.equalsIgnoreCase(String.valueOf(node.getText())) || text.equalsIgnoreCase(String.valueOf(node.getContentDescription()))) return node;
            Thread.sleep(100);
        } while (SystemClock.elapsedRealtime() < deadline);
        return null;
    }
    private static List<String> accessibleButtons(AccessibilityNodeInfo root) {
        List<String> result = new ArrayList<>();
        if (root == null) return result;
        if (root.isVisibleToUser() && String.valueOf(root.getClassName()).endsWith("Button")) result.add(String.valueOf(root.getText()).toLowerCase(Locale.ROOT));
        for (int i = 0; i < root.getChildCount(); i++) result.addAll(accessibleButtons(root.getChild(i)));
        return result;
    }
    private static String allAccessibleText(AccessibilityNodeInfo root) {
        if (root == null) return "";
        StringBuilder text = new StringBuilder(String.valueOf(root.getText()));
        for (int i = 0; i < root.getChildCount(); i++) text.append(allAccessibleText(root.getChild(i)));
        return text.toString();
    }
    private static void capture(Instrumentation test, MainActivity activity, String filename) {
        test.waitForIdleSync();
        test.runOnMainSync(() -> {
            View root = activity.getWindow().getDecorView();
            Bitmap picture = Bitmap.createBitmap(root.getWidth(), root.getHeight(), Bitmap.Config.ARGB_8888);
            root.draw(new Canvas(picture));
            try (var output = new FileOutputStream(new File(test.getTargetContext().getExternalCacheDir(), filename))) {
                check(picture.compress(Bitmap.CompressFormat.PNG, 100, output), "Native regression view rendering failed");
            } catch (Exception error) { throw new AssertionError("Could not capture owned regression UI", error); }
            finally { picture.recycle(); }
        });
    }
}
