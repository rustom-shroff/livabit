package org.liveabit.publish;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.ClipboardManager;
import android.content.ClipData;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.text.InputType;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import org.json.JSONArray;
import org.json.JSONObject;
import java.text.DateFormat;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

public final class MainActivity extends Activity {
    private PublisherApplication app;
    private EditText endpoint, key, minutes;
    private TextView apps, status;
    private final Set<String> selected = new TreeSet<>();
    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean visible;
    private static final int IMPORT_SETUP = 2;
    private final Runnable refresh = new Runnable() {
        @Override public void run() {
            if (!visible) return;
            try { app.engine().checkHealth(); } catch (Exception ignored) {}
            render(); handler.postDelayed(this, 5000);
        }
    };
    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved); getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        app = (PublisherApplication) getApplication();
        LinearLayout body = new LinearLayout(this); body.setOrientation(LinearLayout.VERTICAL); body.setPadding(24, 20, 24, 30);
        body.setOnApplyWindowInsetsListener((view, insets) -> {
            var bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime());
            view.setPadding(24 + bars.left, 20 + bars.top, 24 + bars.right, 30 + bars.bottom); return insets;
        });
        ScrollView scroll = new ScrollView(this); scroll.addView(body); setContentView(scroll);
        label(body, "liveabit", 30);
        label(body, "Connect your Android activity", 20);
        label(body, "Choose the apps to share. Send their usage estimates directly to OpenClaw or your test receiver, including the last 15 minutes. Stop sharing at any time.", 16);
        button(body, getString(R.string.openclaw_help_button), () -> showConnectionHelp(R.string.openclaw_help_button, R.string.openclaw_help));
        button(body, getString(R.string.wifi_help_button), () -> showConnectionHelp(R.string.wifi_help_button, R.string.wifi_help));
        button(body, getString(R.string.usb_help_button), () -> showConnectionHelp(R.string.usb_help_button, R.string.usb_help));
        button(body, "Import receiver setup file", () -> startActivityForResult(
            new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("*/*").addCategory(Intent.CATEGORY_OPENABLE), IMPORT_SETUP));
        button(body, "Paste receiver setup", this::pasteSetup);
        label(body, "Import your OpenClaw or receiver setup, or paste its copied setup. Then choose apps and tap Start sharing.", 14);
        label(body, "Receiver address", 16);
        endpoint = field(body, "http://192.168.1.10:18789/hooks/agent", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        endpoint.setId(R.id.receiver_address);
        label(body, "Connection key", 16);
        key = field(body, "Paste the hook token or receiver key", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        key.setId(R.id.connection_key);
        button(body, "Choose apps", this::chooseApps); apps = label(body, "No apps selected", 16);
        button(body, "Enable usage access", () -> startActivity(new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS,
            Uri.parse("package:" + getPackageName()))));
        label(body, "Warn me after no acknowledgement (minutes)", 16);
        minutes = field(body, "60", InputType.TYPE_CLASS_NUMBER); minutes.setText("60");
        minutes.setId(R.id.warning_minutes);
        button(body, "Save warning interval", () -> {
            try { app.engine().updateAlert(Integer.parseInt(minutes.getText().toString())); render(); toast("Warning interval saved"); }
            catch (Exception error) { toast("Choose between 1 and 1440 minutes"); }
        });
        button(body, "Enable receiver warnings", this::enableWarnings);
        button(body, "Start sharing", this::startSharing);
        button(body, "Send now", this::send);
        button(body, "Stop sharing", () -> { try { app.engine().stop(); render(); } catch (Exception error) { toast("Unable to save stop. Try again"); } });
        status = label(body, "Ready to connect", 16);
        label(body, "While sharing is on, Android schedules a send about every 15 minutes. Battery restrictions can delay background sends and warnings. Local HTTP is for testing on your own network.", 14);
        try {
            JSONObject state = app.engine().snapshot(); endpoint.setText(state.getString("url"));
            if (!state.getString("key").isEmpty()) key.setText(LocalSecret.open(state.getString("key")));
            minutes.setText(Integer.toString(state.getInt("alert_minutes")));
            JSONArray values = state.getJSONArray("packages"); for (int i = 0; i < values.length(); i++) selected.add(values.getString(i));
        } catch (Exception error) { toast("Saved settings could not be read"); }
        showApps();
    }
    @Override protected void onResume() {
        super.onResume();
        try { app.engine().restoreScheduling(); } catch (Exception error) { toast("Background sharing could not restart. Reopen the app to retry."); }
        visible = true; handler.post(refresh);
    }
    @Override protected void onStop() { visible = false; handler.removeCallbacks(refresh); super.onStop(); }
    private void send() {
        status.setText("Reading activity and sending…");
        app.worker.execute(() -> { app.engine().cycle(true); runOnUiThread(() -> { if (!isFinishing()) render(); }); });
    }
    private void render() {
        try {
            JSONObject state = app.engine().snapshot();
            long acknowledged = state.getLong("last_ack");
            String last = acknowledged == 0 ? "None yet" : DateFormat.getDateTimeInstance().format(new Date(acknowledged));
            boolean warnings = app.engine().warningsEnabled();
            boolean openClaw = OpenClawWebhook.isEndpoint(state.getString("url"));
            String runId = state.optString("last_run_id");
            status.setText(state.getString("status") + "\nPending events: " + state.getJSONArray("pending").length()
                + "\nSharing: " + (state.getBoolean("enabled") ? "On" : "Off")
                + "\nConfigured connection: " + ConnectionSetup.describe(state.getString("url"))
                + (openClaw ? "\nLast OpenClaw acceptance: " : "\nLast acknowledgement: ") + last
                + (openClaw && !runId.isEmpty() ? "\nLast accepted run: " + runId : "")
                + (openClaw ? "\nAcceptance starts processing. Check the liveabit agent session for the result." : "")
                + "\nUsage access: " + (UsageCollector.permitted(this) ? "On" : "Off")
                + "\nReceiver warnings: " + (warnings ? "On" : "Off — tap Enable receiver warnings")
                + "\nWarning interval: " + state.getInt("alert_minutes") + " minutes");
        } catch (Exception error) { status.setText("Saved settings unavailable. Stop and reconnect."); }
    }
    private void showConnectionHelp(int title, int instructions) {
        new AlertDialog.Builder(this).setTitle(title).setMessage(instructions)
            .setPositiveButton(R.string.close_help, null).show();
    }
    private void startSharing() {
        if (!UsageCollector.permitted(this)) { toast("Enable usage access first"); return; }
        try {
            String url = endpoint.getText().toString().trim(), token = key.getText().toString().trim();
            String selection = String.join("\n", selected); int interval = Integer.parseInt(minutes.getText().toString());
            int pending = app.engine().pendingToClear(url, token, selection, interval);
            Runnable apply = () -> {
                try { app.engine().configure(url, token, selection, interval); send(); }
                catch (Exception error) { toast("Sharing setup could not be saved. Try again"); }
            };
            if (pending > 0) new AlertDialog.Builder(this).setTitle(R.string.switch_setup_title)
                .setMessage(getString(R.string.switch_setup_message, pending))
                .setPositiveButton(R.string.switch_setup_confirm, (dialog, which) -> apply.run())
                .setNegativeButton(android.R.string.cancel, null).show();
            else apply.run();
        } catch (Exception error) { toast("Check the receiver address, connection key, chosen apps and warning interval"); }
    }
    private void pasteSetup() {
        ClipData clip = getSystemService(ClipboardManager.class).getPrimaryClip();
        try {
            if (clip == null || clip.getItemCount() == 0 || clip.getItemAt(0).getText() == null)
                throw new IllegalArgumentException();
            applySetup(ConnectionSetup.parse(clip.getItemAt(0).getText().toString()));
        } catch (Exception error) { toast("Copy a liveabit receiver setup, then try again"); }
    }
    private void applySetup(ConnectionSetup setup) {
        endpoint.setText(setup.url); key.setText(setup.key); minutes.setText(Integer.toString(setup.minutes));
        toast("Setup imported. Choose apps and tap Start sharing to apply it");
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request != IMPORT_SETUP || result != RESULT_OK || data == null || data.getData() == null) return;
        Uri uri = data.getData();
        app.worker.execute(() -> {
            try (var input = getContentResolver().openInputStream(uri)) {
                if (input == null) throw new IllegalArgumentException();
                byte[] bytes = input.readNBytes(ConnectionSetup.MAX_BYTES + 1);
                if (bytes.length > ConnectionSetup.MAX_BYTES) throw new IllegalArgumentException();
                ConnectionSetup setup = ConnectionSetup.parse(new String(bytes, StandardCharsets.UTF_8));
                runOnUiThread(() -> { if (!isFinishing() && !isDestroyed()) applySetup(setup); });
            } catch (Exception error) {
                runOnUiThread(() -> { if (!isFinishing() && !isDestroyed()) toast("Choose a valid liveabit receiver setup file"); });
            }
        });
    }
    private void enableWarnings() {
        if (app.engine().warningsEnabled()) { toast("Receiver warnings are already on"); return; }
        if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
            && !getPreferences(MODE_PRIVATE).getBoolean("asked_notifications", false)) {
            getPreferences(MODE_PRIVATE).edit().putBoolean("asked_notifications", true).apply();
            requestPermissions(new String[] {Manifest.permission.POST_NOTIFICATIONS}, 1); return;
        }
        String action = checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
            ? Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS : Settings.ACTION_APP_NOTIFICATION_SETTINGS;
        startActivity(new Intent(action).putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName())
            .putExtra(Settings.EXTRA_CHANNEL_ID, DeliveryEngine.CHANNEL));
    }
    private void chooseApps() {
        List<ResolveInfo> entries = getPackageManager().queryIntentActivities(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER), 0);
        entries.sort((a, b) -> a.loadLabel(getPackageManager()).toString().compareToIgnoreCase(b.loadLabel(getPackageManager()).toString()));
        List<String> ids = new ArrayList<>(), names = new ArrayList<>();
        for (ResolveInfo entry : entries) {
            String id = entry.activityInfo.packageName;
            if (!ids.contains(id)) { ids.add(id); names.add(entry.loadLabel(getPackageManager()).toString()); }
        }
        Set<String> next = new TreeSet<>(selected); boolean[] checked = new boolean[ids.size()];
        for (int i = 0; i < ids.size(); i++) checked[i] = next.contains(ids.get(i));
        new AlertDialog.Builder(this).setTitle("Apps to share (up to 32)")
            .setMultiChoiceItems(names.toArray(new String[0]), checked, (dialog, which, on) -> {
                if (on) next.add(ids.get(which)); else next.remove(ids.get(which));
            }).setPositiveButton("Choose", (dialog, which) -> {
                if (next.size() > 32) { toast("Choose up to 32 apps"); return; }
                selected.clear(); selected.addAll(next); showApps();
                toast("Tap Start sharing to apply your selection");
            }).setNegativeButton("Cancel", null).show();
    }
    private void showApps() {
        List<String> names = new ArrayList<>();
        for (String id : selected) {
            try { names.add(getPackageManager().getApplicationLabel(getPackageManager().getApplicationInfo(id, 0)).toString()); }
            catch (Exception error) { names.add(id); }
        }
        apps.setText(names.isEmpty() ? "No apps selected" : String.join(", ", names));
    }
    private TextView label(LinearLayout parent, String text, int size) {
        TextView view = new TextView(this); view.setText(text); view.setTextSize(size); view.setTextColor(Color.rgb(25, 36, 45));
        view.setPadding(0, 12, 0, 10); parent.addView(view); return view;
    }
    private EditText field(LinearLayout parent, String hint, int type) {
        EditText view = new EditText(this); view.setHint(hint); view.setInputType(type); view.setSingleLine(true); parent.addView(view); return view;
    }
    private void button(LinearLayout parent, String text, Runnable action) {
        Button button = new Button(this); button.setText(text); button.setOnClickListener(view -> action.run()); parent.addView(button);
    }
    private void toast(String text) { android.widget.Toast.makeText(this, text, android.widget.Toast.LENGTH_LONG).show(); }
}
