package org.liveabit.inspect;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.SystemClock;
import android.provider.Settings;
import android.text.InputType;
import android.text.InputFilter;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.liveabit.collector.core.LocalInspectionCore;

import java.text.DateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** SDK-native local inspection screen. It never accepts a remote destination. */
public final class MainActivity extends Activity {
    private static final int PICK_APP = 41;
    private LocalInspectionApplication app;
    private final ExecutorService reads = Executors.newSingleThreadExecutor();
    private volatile boolean foreground;
    private volatile long uiEpoch;
    private LocalInspectionCore.QueryTicket inFlight;
    private EditText selection;
    private TextView state, detail, permission, estimates, transitions;
    private Button addApp, start, inspect, stop;
    private final Runnable refresh = this::render;

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        app = (LocalInspectionApplication) getApplication();
        createScreen();
        selection.setText(String.join("\n", app.core.snapshot().selectedPackages));
    }

    @Override protected void onResume() {
        super.onResume();
        foreground = true;
        app.setObserver(refresh);
        render();
    }

    @Override protected void onStop() {
        foreground = false;
        uiEpoch++;
        if (inFlight != null) {
            app.core.cancelQuery(inFlight);
            if (app.core.snapshot().active) {
                app.message = "The read was canceled when you left. Tap Inspect now after returning to retry.";
            }
        }
        inFlight = null;
        app.removeObserver(refresh);
        estimates.setText("");
        transitions.setText("");
        super.onStop();
    }

    @Override protected void onDestroy() {
        foreground = false;
        reads.shutdownNow();
        app.removeObserver(refresh);
        super.onDestroy();
    }

    private void createScreen() {
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        LinearLayout page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        page.setPadding(dp(22), dp(24), dp(22), dp(28));
        page.setOnApplyWindowInsetsListener((view, insets) -> {
            android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime());
            view.setPadding(dp(22) + bars.left, dp(24) + bars.top, dp(22) + bars.right, dp(28) + bars.bottom);
            return insets;
        });
        scroll.addView(page);
        setContentView(scroll);
        label(page, "liveabit", 30, true);
        label(page, "Local inspection", 20, true);
        label(page, "Inspect selected app transitions on this device. This prototype sends nothing, "
                + "has no agent connection and reads only when you tap Inspect now.", 15, false);
        state = label(page, "Stopped", 20, true);
        state.setTextColor(Color.rgb(36, 106, 87));
        detail = label(page, "", 15, false);
        label(page, "1  Choose apps", 18, true);
        addApp = button(page, "Add app", this::pickApp);
        label(page, "The system chooser may be unavailable on some devices. You can also enter exact app "
                + "identifiers below, one per line (up to 32). The app does not scan your installed apps.", 13, false);
        selection = new EditText(this);
        selection.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE
                | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        selection.setSingleLine(false);
        selection.setMinLines(2);
        selection.setHint("App identifiers, for example com.example.fixture");
        selection.setTextSize(14);
        selection.setFilters(new InputFilter[]{new InputFilter.LengthFilter(LocalInspectionCore.MAX_PACKAGES * 130)});
        selection.setSaveEnabled(false);
        selection.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
        selection.setImeOptions(EditorInfo.IME_FLAG_NO_PERSONALIZED_LEARNING);
        selection.setBackground(panel());
        selection.setPadding(dp(12), dp(8), dp(12), dp(8));
        page.addView(selection, match());
        label(page, "2  Allow Android usage access", 18, true);
        permission = label(page, "", 14, false);
        button(page, "Open usage access settings", this::usageSettings);
        label(page, "The Android permission and this local session are separate. Returning from Settings "
                + "does not start inspection.", 13, false);
        label(page, "3  Start, use an app, then inspect", 18, true);
        start = button(page, "Start local session", this::startSession);
        inspect = button(page, "Inspect now", this::inspectNow);
        stop = button(page, "Stop and clear observations", () -> {
            cancelRead();
            app.stop("Stopped. Observations in memory were cleared. Your app selection is saved.");
        });
        button(page, "Clear local data and selection", () -> {
            cancelRead();
            app.clear();
            if (app.storageReady) selection.setText("");
            render();
        });
        label(page, "Activity records stay only in memory, up to 4,096 records and a 24-hour session. "
                + "Stop, a new session, permission loss or process restart clears them. Restart always returns "
                + "to Stopped. App selection is private on-device storage until Clear.", 13, false);
        label(page, "What the records suggest", 18, true);
        label(page, "Duration estimates are inferred and unverified. Starting state, missing transitions "
                + "and source completeness are unknown. No records does not mean no usage. "
                + "These records are not Open Activity Protocol (OAP) summaries.", 13, false);
        estimates = label(page, "", 14, false);
        label(page, "Recent permitted transitions", 18, true);
        transitions = label(page, "", 13, false);
        transitions.setTypeface(Typeface.MONOSPACE);
        transitions.setTextIsSelectable(false);
    }

    private void startSession() {
        cancelRead();
        try {
            Set<String> packages = LocalInspectionCore.parsePackages(selection.getText().toString());
            app.start(packages);
        } catch (IllegalArgumentException error) {
            app.message = "Choose 1–32 valid app identifiers. Inspection has not been started.";
        }
        render();
    }

    private void inspectNow() {
        if (!foreground || inFlight != null) return;
        app.checkedReport();
        if (!app.storageReady || !app.listenerReady || !app.source.hasUsageAccess() || !app.source.isUserUnlocked()) {
            render();
            return;
        }
        long capturedAccessRevision = app.usageAccessRevision();
        LocalInspectionCore.QueryTicket ticket = app.beginRead();
        if (ticket == null) {
            if (app.core.snapshot().active && app.storageReady) {
                app.message = "There is no new query interval. Use a selected app, then return and inspect.";
            }
            render();
            return;
        }
        long capturedEpoch = ++uiEpoch;
        inFlight = ticket;
        app.message = "Reading selected transitions on this device…";
        render();
        reads.execute(() -> {
            AndroidUsageSource.ReadResult result = app.source.read(ticket, () -> {
                LocalInspectionCore.Snapshot current = app.core.snapshot();
                long elapsed = SystemClock.elapsedRealtime();
                long wall = System.currentTimeMillis();
                boolean clockSafe = elapsed >= current.lastElapsedMillis
                        && wall >= current.lastWallMillis
                        && Math.abs((wall - current.lastWallMillis) - (elapsed - current.lastElapsedMillis))
                        <= LocalInspectionCore.CLOCK_TOLERANCE_MILLIS;
                return foreground && uiEpoch == capturedEpoch && app.storageReady && app.listenerReady
                        && current.active && current.generation == ticket.generation && clockSafe
                        && capturedAccessRevision == app.usageAccessRevision()
                        && elapsed - current.sessionStartElapsedMillis < LocalInspectionCore.MAX_SESSION_MILLIS;
            });
            runOnUiThread(() -> {
                if (!foreground || uiEpoch != capturedEpoch || inFlight != ticket) {
                    app.core.cancelQuery(ticket);
                    return;
                }
                inFlight = null;
                app.commitRead(ticket, result, capturedAccessRevision);
            });
        });
    }

    private void cancelRead() {
        uiEpoch++;
        if (inFlight != null) app.core.cancelQuery(inFlight);
        inFlight = null;
    }

    private void pickApp() {
        Intent launchable = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
        Intent chooser = new Intent(Intent.ACTION_PICK_ACTIVITY).putExtra(Intent.EXTRA_INTENT, launchable);
        try {
            startActivityForResult(chooser, PICK_APP);
        } catch (ActivityNotFoundException | SecurityException error) {
            app.message = "This device has no available app chooser. Enter an exact app identifier instead.";
            render();
        }
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent returned) {
        super.onActivityResult(requestCode, resultCode, returned);
        if (requestCode != PICK_APP || resultCode != RESULT_OK || returned == null
                || app.core.snapshot().active) return;
        // The system picker owns discovery. Never read/store a chosen class, label or other extras.
        ComponentName selected = returned.getComponent();
        if (selected == null) return;
        String packageName = selected.getPackageName();
        try {
            String existing = selection.getText().toString().trim();
            Set<String> next = LocalInspectionCore.parsePackages(existing.isEmpty()
                    ? packageName : existing + "\n" + packageName);
            selection.setText(String.join("\n", next));
        } catch (IllegalArgumentException error) {
            app.message = "The selection was not added. Use valid exact identifiers for up to 32 apps.";
        }
    }

    private void usageSettings() {
        Intent settings = new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS,
                Uri.parse("package:" + getPackageName()));
        try {
            startActivity(settings);
        } catch (ActivityNotFoundException | SecurityException error) {
            try {
                startActivity(new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS));
            } catch (ActivityNotFoundException | SecurityException unavailable) {
                app.message = "Usage access settings are unavailable on this device. Inspection stays stopped.";
                render();
            }
        }
    }

    private void render() {
        if (!foreground) return;
        LocalInspectionCore.DiagnosticReport report = app.checkedReport();
        LocalInspectionCore.Snapshot snapshot = report.snapshot;
        state.setText(snapshot.active ? "Local session ready" : "Stopped");
        detail.setText(app.message);
        permission.setText(app.source.hasUsageAccess() ? "Android usage access: allowed"
                : "Android usage access: off or unavailable");
        selection.setEnabled(!snapshot.active);
        addApp.setEnabled(!snapshot.active);
        start.setEnabled(!snapshot.active && app.storageReady && app.listenerReady);
        inspect.setEnabled(snapshot.active && app.storageReady && app.listenerReady && inFlight == null);
        stop.setEnabled(snapshot.active || snapshot.eventCount != 0);
        if (!snapshot.active) {
            estimates.setText("No observations retained. Start a fresh local session to inspect.");
            transitions.setText("No observations retained.");
            return;
        }
        StringBuilder summary = new StringBuilder();
        for (LocalInspectionCore.PackageDiagnostic appResult : report.packages) {
            summary.append(appResult.packageName).append('\n');
            if (appResult.estimatedDurationMillis == null) summary.append("No closed estimate; usage unknown.");
            else summary.append(String.format(Locale.ROOT, "Inferred closed duration: %.1f seconds (unverified)",
                    appResult.estimatedDurationMillis / 1000.0));
            summary.append("\n").append(appResult.eventCount).append(" permitted transition records.\n\n");
        }
        estimates.setText(summary.toString());
        StringBuilder recent = new StringBuilder();
        DateFormat times = DateFormat.getTimeInstance(DateFormat.MEDIUM);
        for (LocalInspectionCore.ProjectedEvent event : report.recentEvents) {
            recent.append(times.format(new Date(event.timestampMillis))).append("  ")
                    .append(event.type == LocalInspectionCore.Type.RESUME ? "resume" : "pause").append('\n')
                    .append(event.packageName).append("\n\n");
        }
        transitions.setText(recent.length() == 0 ? "No returned transitions. Usage is unknown." : recent.toString());
    }

    private TextView label(LinearLayout parent, String text, int size, boolean bold) {
        TextView view = new TextView(this);
        view.setText(text);
        view.setTextSize(size);
        view.setTextColor(Color.rgb(32, 46, 40));
        if (bold) view.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        LinearLayout.LayoutParams parameters = match();
        parameters.topMargin = dp(bold ? 18 : 8);
        parent.addView(view, parameters);
        return view;
    }

    private Button button(LinearLayout parent, String text, Runnable action) {
        Button view = new Button(this);
        view.setText(text);
        view.setAllCaps(false);
        view.setOnClickListener(ignored -> action.run());
        LinearLayout.LayoutParams parameters = match();
        parameters.topMargin = dp(6);
        parent.addView(view, parameters);
        return view;
    }

    private GradientDrawable panel() {
        GradientDrawable shape = new GradientDrawable();
        shape.setColor(Color.WHITE);
        shape.setCornerRadius(dp(8));
        shape.setStroke(dp(1), Color.rgb(195, 207, 199));
        return shape;
    }

    private LinearLayout.LayoutParams match() {
        return new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT);
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
}
