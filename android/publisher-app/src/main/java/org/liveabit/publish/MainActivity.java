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
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.content.res.ColorStateList;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.text.InputType;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.view.inputmethod.InputMethodManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import org.json.JSONArray;
import org.json.JSONObject;
import java.text.DateFormat;
import java.nio.charset.StandardCharsets;
import java.net.URI;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

public final class MainActivity extends Activity {
    private PublisherApplication app;
    private EditText endpoint, key, minutes, agent, sendMinutes, screenOffMinutes;
    private TextView apps, status, sharingTitle, homeApps, schedule, connectionSummary;
    private final View[] pages = new View[3];
    private final Button[] tabs = new Button[3];
    private Button homeStart, homeSend, homeStop;
    private LinearLayout root;
    private int currentTab;
    private static final int INK = Color.rgb(27, 43, 58), BLUE = Color.rgb(26, 89, 177), MUTED = Color.rgb(91, 108, 124);
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
        root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setFocusableInTouchMode(true);
        root.setBackgroundColor(Color.rgb(244, 247, 251)); root.setPadding(dp(20), dp(12), dp(20), dp(12));
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            var bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime());
            view.setPadding(dp(20) + bars.left, dp(12) + bars.top, dp(20) + bars.right, dp(12) + bars.bottom); return insets;
        });
        label(root, "liveabit", 30).setTypeface(null, Typeface.BOLD);
        label(root, "Your activity, shared on your terms", 15).setTextColor(MUTED);
        LinearLayout navigation = new LinearLayout(this); root.addView(navigation);
        String[] names = {"Activity", "Setup", "Settings"};
        for (int index = 0; index < names.length; index++) {
            final int tab = index;
            Button view = new Button(this); view.setText(names[index]); view.setAllCaps(false); view.setTextSize(14);
            view.setMinWidth(0); view.setMinimumWidth(0); view.setPadding(dp(4), dp(8), dp(4), dp(8));
            view.setOnClickListener(ignored -> showTab(tab));
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, dp(48), 1);
            params.setMargins(0, dp(8), index < 2 ? dp(6) : 0, dp(14)); navigation.addView(view, params); tabs[index] = view;
        }
        LinearLayout content = new LinearLayout(this); content.setOrientation(LinearLayout.VERTICAL);
        root.addView(content, new LinearLayout.LayoutParams(-1, 0, 1)); setContentView(root);
        LinearLayout home = page(content, 0, R.id.activity_page);
        LinearLayout overview = card(home);
        sharingTitle = label(overview, "Sharing is off", 24); sharingTitle.setTypeface(null, Typeface.BOLD);
        schedule = label(overview, "Automatic sends are off", 16);
        homeApps = label(overview, "Choose your apps in Setup", 15); homeApps.setTextColor(MUTED);
        homeStart = button(overview, "Start sharing", this::startSharing);
        homeSend = button(overview, "Send now", this::send);
        homeStop = button(overview, "Stop sharing", () -> { try { app.engine().stop(); render(); } catch (Exception error) { toast("Unable to save stop. Try again"); } });
        LinearLayout delivery = card(home);
        label(delivery, "Connection", 18).setTypeface(null, Typeface.BOLD);
        status = label(delivery, "Ready to connect", 15);
        button(delivery, "Connection details", this::showDetails);
        button(home, "Change apps or connection", () -> showTab(1));
        label(home, "Your agent decides when a nudge is useful. An accepted event starts processing; it does not mean a message is sent every time.", 14).setTextColor(MUTED);

        LinearLayout setup = page(content, 1, R.id.setup_page);
        label(setup, "Set up sharing", 24).setTypeface(null, Typeface.BOLD);
        label(setup, "Import your connection, then choose which apps to share.", 15).setTextColor(MUTED);
        LinearLayout connection = card(setup);
        label(connection, "Connect your agent", 18).setTypeface(null, Typeface.BOLD);
        connectionSummary = label(connection, "No connection imported", 15);
        button(connection, "Import receiver setup file", () -> startActivityForResult(
            new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("*/*").addCategory(Intent.CATEGORY_OPENABLE), IMPORT_SETUP));
        button(connection, "Paste receiver setup", this::pasteSetup);
        button(connection, getString(R.string.wifi_help_button), () -> showTransportHelp(true));
        button(connection, getString(R.string.usb_help_button), () -> showTransportHelp(false));
        button(connection, getString(R.string.openclaw_help_button), () -> showConnectionHelp(R.string.openclaw_help_button, R.string.openclaw_help));
        LinearLayout manual = new LinearLayout(this); manual.setOrientation(LinearLayout.VERTICAL);
        button(connection, "Edit connection manually", () -> manual.setVisibility(manual.getVisibility() == View.VISIBLE ? View.GONE : View.VISIBLE));
        connection.addView(manual); manual.setVisibility(View.GONE);
        label(manual, "Receiver address", 15);
        endpoint = field(manual, "Import setup to fill the address", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        endpoint.setId(R.id.receiver_address);
        label(manual, "Connection key", 15);
        key = field(manual, "Hook token or receiver key", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        key.setId(R.id.connection_key);
        label(manual, "OpenClaw agent", 15);
        agent = field(manual, "main", InputType.TYPE_CLASS_TEXT); agent.setText("main");
        agent.setId(R.id.openclaw_agent);
        LinearLayout selection = card(setup);
        label(selection, "Apps to share", 18).setTypeface(null, Typeface.BOLD);
        apps = label(selection, "No apps selected", 16);
        button(selection, "Choose apps", this::chooseApps);
        button(selection, "Enable usage access", () -> startActivity(new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS,
            Uri.parse("package:" + getPackageName()))));
        button(setup, "Start sharing", this::startSharing);
        label(setup, "Importing only fills the connection. Start sharing applies your apps and destination.", 14).setTextColor(MUTED);

        LinearLayout settings = page(content, 2, R.id.settings_page);
        label(settings, "Sending settings", 24).setTypeface(null, Typeface.BOLD);
        LinearLayout timing = card(settings);
        label(timing, "Send interval while active (minutes)", 16);
        sendMinutes = field(timing, "5", InputType.TYPE_CLASS_NUMBER); sendMinutes.setId(R.id.send_minutes);
        label(timing, "Pause after screen is off (minutes)", 16);
        screenOffMinutes = field(timing, "15", InputType.TYPE_CLASS_NUMBER); screenOffMinutes.setId(R.id.screen_off_minutes);
        label(timing, "Automatic sends skip empty observations. When paused, queued events wait until the phone is in use again.", 14).setTextColor(MUTED);
        label(timing, "Warn after no acknowledgement (minutes)", 16);
        minutes = field(timing, "60", InputType.TYPE_CLASS_NUMBER);
        minutes.setId(R.id.warning_minutes);
        button(timing, "Save settings", () -> {
            try {
                app.engine().updateTiming(Integer.parseInt(sendMinutes.getText().toString()),
                    Integer.parseInt(screenOffMinutes.getText().toString()), Integer.parseInt(minutes.getText().toString()));
                render(); toast("Sending settings saved");
            } catch (Exception error) { toast("Enter 1 to 1440 minutes for each setting"); }
        }).setId(R.id.save_settings);
        button(settings, "Enable receiver warnings", this::enableWarnings);
        label(settings, "Android can delay background jobs and warnings to save battery. These intervals are targets, not exact alarms.", 14).setTextColor(MUTED);
        try {
            JSONObject state = app.engine().snapshot(); endpoint.setText(state.getString("url"));
            if (OpenClawWebhook.isEndpoint(state.getString("url"))) agent.setText(state.optString("agent_id", "liveabit"));
            if (!state.getString("key").isEmpty()) key.setText(LocalSecret.open(state.getString("key")));
            minutes.setText(Integer.toString(state.getInt("alert_minutes")));
            sendMinutes.setText(Integer.toString(state.getInt("send_minutes")));
            screenOffMinutes.setText(Integer.toString(state.getInt("screen_off_minutes")));
            JSONArray values = state.getJSONArray("packages"); for (int i = 0; i < values.length(); i++) selected.add(values.getString(i));
        } catch (Exception error) { toast("Saved settings could not be read"); }
        if (saved != null && saved.containsKey("selected_apps")) {
            selected.clear(); selected.addAll(saved.getStringArrayList("selected_apps"));
        }
        showApps(); showTab(saved == null ? 0 : saved.getInt("tab", 0)); render();
    }
    @Override protected void onSaveInstanceState(Bundle state) {
        state.putInt("tab", currentTab); state.putStringArrayList("selected_apps", new ArrayList<>(selected));
        super.onSaveInstanceState(state);
    }
    private void showTab(int index) {
        currentTab = Math.max(0, Math.min(2, index));
        root.requestFocus();
        for (int i = 0; i < pages.length; i++) {
            pages[i].setVisibility(i == currentTab ? View.VISIBLE : View.GONE);
            tabs[i].setBackground(background(i == currentTab ? BLUE : Color.WHITE, 10, i == currentTab ? BLUE : Color.rgb(219, 227, 236)));
            tabs[i].setTextColor(i == currentTab ? Color.WHITE : INK); tabs[i].setSelected(i == currentTab);
        }
        getSystemService(InputMethodManager.class).hideSoftInputFromWindow(tabs[currentTab].getWindowToken(), 0);
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
            boolean enabled = state.getBoolean("enabled");
            homeStart.setEnabled(!enabled); homeSend.setEnabled(enabled); homeStop.setEnabled(enabled);
            homeStart.setVisibility(enabled ? View.GONE : View.VISIBLE);
            homeSend.setVisibility(enabled ? View.VISIBLE : View.GONE); homeStop.setVisibility(enabled ? View.VISIBLE : View.GONE);
            sharingTitle.setText(enabled ? (state.optBoolean("automatic_paused") ? "Sharing paused" : "Sharing is on") : "Sharing is off");
            sharingTitle.setTextColor(enabled ? Color.rgb(21, 110, 96) : INK);
            schedule.setText(enabled ? (state.optBoolean("automatic_paused") ? "Screen off — resumes when your phone is in use"
                : "New activity about every " + state.getInt("send_minutes") + " min") : "Ready when you are");
            homeApps.setText(state.getJSONArray("packages").length() == 0 ? "Choose your apps in Setup"
                : state.getJSONArray("packages").length() + (state.getJSONArray("packages").length() == 1 ? " selected app" : " selected apps")
                    + " · pause after " + state.getInt("screen_off_minutes") + " min with screen off");
            status.setText(state.getString("status") + "\n\n" + (openClaw ? "Last acceptance: " : "Last acknowledgement: ") + last
                + "\nPending events: " + state.getJSONArray("pending").length()
                + "\nUsage access: " + (UsageCollector.permitted(this) ? "On" : "Enable in Setup")
                + "\nReceiver warnings: " + (warnings ? "On" : "Enable in Settings"));
            String address = endpoint.getText().toString().trim();
            connectionSummary.setText(address.isEmpty() ? "No connection imported" : ConnectionSetup.describe(address, agent.getText().toString().trim()));
        } catch (Exception error) { status.setText("Saved settings unavailable. Stop and reconnect."); }
    }
    private void showDetails() {
        try {
            JSONObject state = app.engine().snapshot();
            String run = state.optString("last_run_id");
            new AlertDialog.Builder(this).setTitle("Connection details")
                .setMessage(ConnectionSetup.describe(state.getString("url"), state.optString("agent_id", "liveabit"))
                    + "\n\n" + state.optString("automatic_status") + (run.isEmpty() ? "" : "\n\nLast accepted run: " + run))
                .setPositiveButton("Close", null).show();
        } catch (Exception error) { toast("Connection details unavailable"); }
    }
    private void showConnectionHelp(int title, int instructions) {
        new AlertDialog.Builder(this).setTitle(title).setMessage(instructions)
            .setPositiveButton(R.string.close_help, null).show();
    }
    private void showTransportHelp(boolean wifi) {
        int title = wifi ? R.string.wifi_help_button : R.string.usb_help_button;
        String address = endpoint.getText().toString().trim();
        if (!OpenClawWebhook.isEndpoint(address)) {
            showConnectionHelp(title, wifi ? R.string.wifi_help : R.string.usb_help);
            return;
        }
        URI uri = URI.create(address);
        int port = uri.getPort();
        if (port < 0) port = "https".equals(uri.getScheme()) ? 443 : 80;
        new AlertDialog.Builder(this).setTitle(title)
            .setMessage(getString(wifi ? R.string.openclaw_wifi_help : R.string.openclaw_usb_help, port))
            .setPositiveButton(R.string.close_help, null).show();
    }
    private void startSharing() {
        if (endpoint.getText().toString().trim().isEmpty() || selected.isEmpty()) {
            showTab(1); toast("Import a connection and choose apps in Setup"); return;
        }
        if (!UsageCollector.permitted(this)) { showTab(1); toast("Enable usage access first"); return; }
        try {
            String url = endpoint.getText().toString().trim(), token = key.getText().toString().trim();
            String agentId = agent.getText().toString().trim();
            String selection = String.join("\n", selected); int interval = Integer.parseInt(minutes.getText().toString());
            int pending = app.engine().pendingToClear(url, token, selection, interval, agentId);
            Runnable apply = () -> {
                try { app.engine().configure(url, token, selection, interval, agentId); send(); }
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
        if (setup.agentId != null) agent.setText(setup.agentId);
        render();
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
        TextView view = new TextView(this); view.setText(text); view.setTextSize(size); view.setTextColor(INK);
        view.setPadding(0, dp(6), 0, dp(8)); parent.addView(view); return view;
    }
    private EditText field(LinearLayout parent, String hint, int type) {
        EditText view = new EditText(this); view.setHint(hint); view.setInputType(type); view.setSingleLine(true);
        view.setTextSize(16); view.setPadding(dp(12), dp(8), dp(12), dp(8)); view.setMinimumHeight(dp(48));
        view.setBackground(background(Color.rgb(250, 252, 255), 8, Color.rgb(210, 221, 234)));
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2); params.setMargins(0, 0, 0, dp(8));
        parent.addView(view, params); return view;
    }
    private Button button(LinearLayout parent, String text, Runnable action) {
        Button button = new Button(this); button.setText(text); button.setAllCaps(false); button.setTextSize(15);
        boolean primary = text.equals("Start sharing") || text.equals("Save settings");
        button.setTextColor(new ColorStateList(new int[][] {new int[] {-android.R.attr.state_enabled}, new int[] {}},
            new int[] {MUTED, primary ? Color.WHITE : BLUE}));
        button.setBackground(new RippleDrawable(ColorStateList.valueOf(Color.rgb(203, 223, 248)),
            background(primary ? BLUE : Color.rgb(234, 242, 253), 9, primary ? BLUE : Color.rgb(215, 228, 246)), null));
        button.setMinHeight(dp(48)); button.setPadding(dp(10), dp(10), dp(10), dp(10)); button.setOnClickListener(view -> action.run());
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2); params.setMargins(0, dp(2), 0, dp(4));
        parent.addView(button, params); return button;
    }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private GradientDrawable background(int color, int radius, int stroke) {
        GradientDrawable shape = new GradientDrawable(); shape.setColor(color); shape.setCornerRadius(dp(radius)); shape.setStroke(dp(1), stroke); return shape;
    }
    private LinearLayout page(LinearLayout parent, int index, int id) {
        ScrollView scroll = new ScrollView(this); scroll.setFillViewport(true); scroll.setId(id);
        LinearLayout body = new LinearLayout(this); body.setOrientation(LinearLayout.VERTICAL); body.setPadding(0, 0, 0, dp(16));
        scroll.addView(body); parent.addView(scroll, new LinearLayout.LayoutParams(-1, -1)); pages[index] = scroll; return body;
    }
    private LinearLayout card(LinearLayout parent) {
        LinearLayout card = new LinearLayout(this); card.setOrientation(LinearLayout.VERTICAL); card.setPadding(dp(16), dp(10), dp(16), dp(12));
        card.setBackground(background(Color.WHITE, 14, Color.rgb(223, 230, 238)));
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2); params.setMargins(0, dp(4), 0, dp(14)); parent.addView(card, params); return card;
    }
    private void toast(String text) { android.widget.Toast.makeText(this, text, android.widget.Toast.LENGTH_LONG).show(); }
}
