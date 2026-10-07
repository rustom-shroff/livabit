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
import android.provider.Settings;
import android.text.InputType;
import android.text.InputFilter;
import android.text.Editable;
import android.text.TextWatcher;
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
import org.liveabit.collector.core.FixtureComparison;

import java.text.DateFormat;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.Set;
import java.util.TimeZone;

/** SDK-native local inspection screen. It never accepts a remote destination. */
public final class MainActivity extends Activity {
    private static final int PICK_APP = 41;
    private LocalInspectionApplication app;
    private final ForegroundReadAuthority readAuthority = new ForegroundReadAuthority();
    private LocalInspectionApplication.PendingRead inFlight;
    private EditText selection;
    private TextView state, detail, permission, estimates, transitions;
    private Button addApp, start, inspect, stop;
    private LinearLayout fixturePanel, fixtureInputs;
    private Button fixtureToggle, fixtureCompare;
    private EditText fixtureStart, fixtureEnd, fixtureDuration;
    private TextView fixtureResult;
    private LinearLayout fixtureTimingPanel;
    private Button fixtureTimingToggle;
    private TextView fixtureTimingDetails;
    private long fixtureContextGeneration = -1;
    private String fixtureContextScope = "";
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
        readAuthority.resume();
        app.setObserver(refresh);
        render();
    }

    @Override protected void onStop() {
        readAuthority.leave();
        if (inFlight != null) {
            app.cancelRead(inFlight);
            if (app.core.snapshot().active) {
                app.message = "The read was canceled when you left. Tap Inspect now after returning to retry.";
            }
        }
        inFlight = null;
        app.removeObserver(refresh);
        clearFixtureInputs();
        estimates.setText("");
        transitions.setText("");
        super.onStop();
    }

    @Override protected void onDestroy() {
        readAuthority.leave();
        app.cancelRead(inFlight);
        inFlight = null;
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
            clearFixtureInputs();
            app.stop("Stopped. Observations in memory were cleared. Your app selection is saved.");
        });
        button(page, "Clear local data and selection", () -> {
            cancelRead();
            clearFixtureInputs();
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
        label(page, "Android records activity-level screen changes. Moving between screens inside one app "
                + "can create several resume/pause transitions without an app exit. These counts are not app visits.", 13, false);
        estimates = label(page, "", 14, false);
        label(page, "Recent permitted transitions", 18, true);
        transitions = label(page, "", 13, false);
        transitions.setTypeface(Typeface.MONOSPACE);
        transitions.setTextIsSelectable(false);
        createFixturePanel(page);
        selection.addTextChangedListener(afterChange(this::clearFixtureInputs));
    }

    private void startSession() {
        cancelRead();
        clearFixtureInputs();
        try {
            Set<String> packages = LocalInspectionCore.parsePackages(selection.getText().toString());
            app.start(packages);
        } catch (IllegalArgumentException error) {
            app.message = "Choose 1–32 valid app identifiers. Inspection has not been started.";
        }
        render();
    }

    private void inspectNow() {
        if (!readAuthority.isForeground() || inFlight != null) return;
        clearFixtureResult();
        app.checkedReport();
        if (!app.storageReady || !app.listenerReady || !app.source.hasUsageAccess() || !app.source.isUserUnlocked()) {
            render();
            return;
        }
        long capturedEpoch = readAuthority.advance();
        inFlight = app.requestRead(readAuthority, capturedEpoch);
        render();
    }

    private void cancelRead() {
        readAuthority.invalidate();
        app.cancelRead(inFlight);
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
        if (!readAuthority.isForeground()) return;
        LocalInspectionCore.DiagnosticReport report = app.checkedReport();
        LocalInspectionCore.Snapshot snapshot = report.snapshot;
        if (inFlight != null && !app.isPending(inFlight)) inFlight = null;
        boolean physicalReadBusy = app.physicalReadBusy();
        state.setText(snapshot.active ? "Local session ready" : "Stopped");
        if (physicalReadBusy && inFlight == null) {
            detail.setText(getString(R.string.local_read_finishing_status, app.message));
        } else {
            detail.setText(app.message);
        }
        permission.setText(app.source.hasUsageAccess() ? "Android usage access: allowed"
                : "Android usage access: off or unavailable");
        selection.setEnabled(!snapshot.active);
        addApp.setEnabled(!snapshot.active);
        start.setEnabled(!snapshot.active && app.storageReady && app.listenerReady);
        inspect.setEnabled(snapshot.active && app.storageReady && app.listenerReady && inFlight == null && !physicalReadBusy);
        stop.setEnabled(snapshot.active || snapshot.eventCount != 0);
        renderFixtureContext(report);
        if (!snapshot.active) {
            estimates.setText(R.string.no_observations);
            transitions.setText(R.string.no_observations_short);
            return;
        }
        StringBuilder summary = new StringBuilder();
        DateFormat intervalTimes = new SimpleDateFormat("MMM d, HH:mm:ss.SSS", Locale.getDefault());
        for (LocalInspectionCore.PackageDiagnostic appResult : report.packages) {
            summary.append(appResult.packageName).append('\n');
            if (appResult.estimatedDurationMillis == null) summary.append("No closed estimate; usage unknown.");
            else summary.append(getString(R.string.retained_interval_sum,
                    appResult.estimatedDurationMillis / 1000.0));
            if (estimatesWereDiscarded(appResult.ambiguityReasons)) {
                summary.append('\n').append(getString(R.string.discarded_estimates_warning));
            }
            int intervalCount = appResult.closedEstimates.size();
            summary.append("\n").append(intervalCount).append(" inferred closed interval")
                    .append(intervalCount == 1 ? "." : "s.")
                    .append("\n").append(appResult.eventCount).append(" activity transition records (not app visits).\n");
            for (String reason : appResult.ambiguityReasons) {
                summary.append("• ").append(friendlyAmbiguity(reason)).append('\n');
            }
            if (intervalCount > 0) {
                int shown = Math.min(8, intervalCount);
                summary.append(intervalCount > shown ? "Latest " : "All ").append(shown)
                        .append(" inferred interval").append(shown == 1 ? ":\n" : "s:\n");
                for (int index = intervalCount - 1; index >= intervalCount - shown; index--) {
                    LocalInspectionCore.ClosedEstimate interval = appResult.closedEstimates.get(index);
                    summary.append(intervalTimes.format(new Date(interval.startInclusive))).append(" → ")
                            .append(intervalTimes.format(new Date(interval.endExclusive))).append(" · ")
                            .append(String.format(Locale.getDefault(), "%.3f s", interval.durationMillis / 1000.0))
                            .append('\n');
                }
                if (intervalCount > shown) summary.append("Showing 8 of ").append(intervalCount)
                        .append(" inferred intervals; the total above includes all ").append(intervalCount).append(".\n");
            }
            summary.append('\n');
        }
        estimates.setText(summary.toString());
        StringBuilder recent = new StringBuilder();
        DateFormat times = new SimpleDateFormat("MMM d, HH:mm:ss.SSS", Locale.getDefault());
        if (!report.recentEvents.isEmpty()) recent.append("Showing ")
                .append(report.recentEvents.size() < snapshot.eventCount ? "latest " : "all ")
                .append(report.recentEvents.size()).append(" of ").append(snapshot.eventCount)
                .append(" retained activity transitions.\n\n");
        for (LocalInspectionCore.ProjectedEvent event : report.recentEvents) {
            recent.append(times.format(new Date(event.timestampMillis))).append("  ")
                    .append(event.type == LocalInspectionCore.Type.RESUME ? "Activity resumed" : "Activity paused").append('\n')
                    .append(event.packageName).append("\n\n");
        }
        transitions.setText(recent.length() == 0 ? "No returned transitions. Usage is unknown." : recent.toString());
    }

    private String friendlyAmbiguity(String reason) {
        switch (reason) {
            case "unknown_initial_state": return "Starting activity state is unknown.";
            case "unverified_source_continuity": return "Source completeness is unknown; transitions may be missing or late.";
            case "ambiguous_same_timestamp_transitions": return "Several transitions share one time; earlier estimates were discarded.";
            case "package_level_overlap_or_missing_pause": return "Activity overlap and a missing pause cannot be distinguished.";
            case "unmatched_pause_invalidates_prior_estimates": return "A pause has no known matching resume; earlier estimates were discarded.";
            case "open_transition_sequence": return "A transition sequence is still open; no closing time was invented.";
            case "no_records_usage_unknown": return "No transitions were returned; usage remains unknown.";
            default: return "Some transition evidence could not be fully interpreted.";
        }
    }

    private boolean estimatesWereDiscarded(java.util.List<String> reasons) {
        return reasons.contains("ambiguous_same_timestamp_transitions")
                || reasons.contains("unmatched_pause_invalidates_prior_estimates");
    }

    private void createFixturePanel(LinearLayout page) {
        fixturePanel = new LinearLayout(this);
        fixturePanel.setOrientation(LinearLayout.VERTICAL);
        fixturePanel.setSaveEnabled(false);
        fixturePanel.setSaveFromParentEnabled(false);
        fixturePanel.setVisibility(View.GONE);
        page.addView(fixturePanel, match());
        fixtureToggle = button(fixturePanel, getString(R.string.show_fixture_comparison), () -> {
            LocalInspectionCore.DiagnosticReport report = app.checkedReport();
            if (!report.snapshot.active || !report.snapshot.selectedPackages.contains(FixtureComparison.FIXTURE_PACKAGE)) {
                clearFixtureInputs();
                render();
                return;
            }
            boolean show = fixtureInputs.getVisibility() != View.VISIBLE;
            fixtureInputs.setVisibility(show ? View.VISIBLE : View.GONE);
            fixtureToggle.setText(show ? R.string.hide_fixture_comparison : R.string.show_fixture_comparison);
            if (!show) clearFixtureTimingDetails();
        });
        fixtureInputs = new LinearLayout(this);
        fixtureInputs.setOrientation(LinearLayout.VERTICAL);
        fixtureInputs.setVisibility(View.GONE);
        fixturePanel.addView(fixtureInputs, match());
        label(fixtureInputs, "For the owned liveabit fixture only. After Inspect now, enter its start/end time "
                + "codes and reported callback duration (up to a 10-minute window). This uses retained records "
                + "and runs no extra read. Values clear when you leave this screen.", 13, false);
        fixtureStart = numericFixtureInput(fixtureInputs, R.string.fixture_start_hint, 15);
        fixtureEnd = numericFixtureInput(fixtureInputs, R.string.fixture_end_hint, 15);
        fixtureDuration = numericFixtureInput(fixtureInputs, R.string.fixture_duration_hint, 7);
        fixtureCompare = button(fixtureInputs, getString(R.string.compare_fixture_records), this::compareFixture);
        fixtureResult = label(fixtureInputs, getString(R.string.fixture_not_compared), 14, false);
        fixtureResult.setSaveEnabled(false);
        fixtureResult.setTextIsSelectable(false);
        fixtureTimingToggle = button(fixtureInputs, getString(R.string.show_fixture_timing_details), this::toggleFixtureTimingDetails);
        fixtureTimingPanel = new LinearLayout(this);
        fixtureTimingPanel.setOrientation(LinearLayout.VERTICAL);
        fixtureTimingPanel.setSaveEnabled(false);
        fixtureTimingPanel.setSaveFromParentEnabled(false);
        fixtureTimingPanel.setVisibility(View.GONE);
        fixtureInputs.addView(fixtureTimingPanel, match());
        label(fixtureTimingPanel, "Exact timing codes for repeatable owned-fixture checks. These describe the "
                + "current local report, remain only on this screen and clear when you leave. "
                + "The report clock pair is separate from the query cursor; no elapsed query-end code is inferred.", 13, false);
        fixtureTimingDetails = label(fixtureTimingPanel, "", 13, false);
        fixtureTimingDetails.setTypeface(Typeface.MONOSPACE);
        fixtureTimingDetails.setSaveEnabled(false);
        fixtureTimingDetails.setSaveFromParentEnabled(false);
        fixtureTimingDetails.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
        fixtureTimingDetails.setTextIsSelectable(false);
    }

    private EditText numericFixtureInput(LinearLayout parent, int hint, int maxLength) {
        EditText input = new EditText(this);
        input.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        input.setSingleLine(true);
        input.setHint(hint);
        input.setFilters(new InputFilter[]{new InputFilter.LengthFilter(maxLength)});
        input.setSaveEnabled(false);
        input.setSaveFromParentEnabled(false);
        input.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
        input.setImeOptions(EditorInfo.IME_FLAG_NO_PERSONALIZED_LEARNING);
        input.setTextSize(14);
        input.setPadding(dp(12), dp(8), dp(12), dp(8));
        input.setBackground(panel());
        LinearLayout.LayoutParams parameters = match();
        parameters.topMargin = dp(8);
        parent.addView(input, parameters);
        input.addTextChangedListener(afterChange(this::clearFixtureResult));
        return input;
    }

    private TextWatcher afterChange(Runnable action) {
        return new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence text, int start, int count, int after) { }
            @Override public void onTextChanged(CharSequence text, int start, int before, int count) { }
            @Override public void afterTextChanged(Editable text) { action.run(); }
        };
    }

    private void renderFixtureContext(LocalInspectionCore.DiagnosticReport report) {
        LocalInspectionCore.Snapshot snapshot = report.snapshot;
        String scope = String.join("\n", snapshot.selectedPackages);
        if (fixtureContextGeneration != snapshot.generation || !fixtureContextScope.equals(scope)) {
            clearFixtureInputs();
            fixtureContextGeneration = snapshot.generation;
            fixtureContextScope = scope;
        }
        boolean available = snapshot.active && snapshot.selectedPackages.contains(FixtureComparison.FIXTURE_PACKAGE);
        if (!available) clearFixtureInputs();
        fixturePanel.setVisibility(available ? View.VISIBLE : View.GONE);
        fixtureCompare.setEnabled(available && inFlight == null && app.storageReady && app.listenerReady);
        fixtureTimingToggle.setEnabled(available && inFlight == null && app.storageReady && app.listenerReady);
        if (available && fixtureTimingPanel.getVisibility() == View.VISIBLE) renderFixtureTimingDetails(report);
    }

    private void toggleFixtureTimingDetails() {
        if (!readAuthority.isForeground() || inFlight != null) return;
        LocalInspectionCore.DiagnosticReport report = app.checkedReport();
        renderFixtureContext(report);
        if (!report.snapshot.active || !report.snapshot.selectedPackages.contains(FixtureComparison.FIXTURE_PACKAGE)) {
            clearFixtureInputs();
            render();
            return;
        }
        boolean show = fixtureTimingPanel.getVisibility() != View.VISIBLE;
        fixtureTimingPanel.setVisibility(show ? View.VISIBLE : View.GONE);
        fixtureTimingToggle.setText(show ? R.string.hide_fixture_timing_details : R.string.show_fixture_timing_details);
        if (show) renderFixtureTimingDetails(report);
        else fixtureTimingDetails.setText("");
    }

    private void renderFixtureTimingDetails(LocalInspectionCore.DiagnosticReport report) {
        LocalInspectionCore.Snapshot snapshot = report.snapshot;
        TimeZone zone = TimeZone.getDefault();
        LocalInspectionCore.PackageDiagnostic fixture = null;
        for (LocalInspectionCore.PackageDiagnostic item : report.packages) {
            if (FixtureComparison.FIXTURE_PACKAGE.equals(item.packageName)) fixture = item;
        }
        if (!snapshot.active || fixture == null) {
            fixtureTimingDetails.setText("");
            return;
        }
        int shownEvents = 0;
        for (LocalInspectionCore.ProjectedEvent event : report.recentEvents) {
            if (FixtureComparison.FIXTURE_PACKAGE.equals(event.packageName)) shownEvents++;
        }
        StringBuilder context = new StringBuilder("Fixture timing details v1\nPackage: ")
                .append(FixtureComparison.FIXTURE_PACKAGE)
                .append("\nSession start wall code: ").append(snapshot.sessionStartWallMillis)
                .append("\nSession start elapsed code: ").append(snapshot.sessionStartElapsedMillis)
                .append("\nQuery cursor wall code (exclusive): ").append(snapshot.queryCursorWallMillis)
                .append("\nReport clock wall code: ").append(snapshot.lastWallMillis)
                .append("\nReport clock elapsed code: ").append(snapshot.lastElapsedMillis)
                .append("\nDisplayed time zone: ").append(zone.getID())
                .append("\nReport clock UTC offset millis: ").append(zone.getOffset(snapshot.lastWallMillis))
                .append("\nFixture transitions shown: ").append(shownEvents == fixture.eventCount ? "all " : "latest ")
                .append(shownEvents).append(" of ").append(fixture.eventCount);
        for (LocalInspectionCore.ProjectedEvent event : report.recentEvents) {
            if (FixtureComparison.FIXTURE_PACKAGE.equals(event.packageName)) {
                context.append("\nEvent: ").append(event.timestampMillis).append(' ').append(event.type.name());
            }
        }
        if (shownEvents < fixture.eventCount) context.append("\nThe recent-record limit omitted some fixture transitions.");
        int intervalCount = fixture.closedEstimates.size();
        int shownIntervals = Math.min(8, intervalCount);
        context.append("\nFixture inferred intervals shown: ").append(shownIntervals == intervalCount ? "all " : "latest ")
                .append(shownIntervals).append(" of ").append(intervalCount);
        for (int index = intervalCount - 1; index >= intervalCount - shownIntervals; index--) {
            LocalInspectionCore.ClosedEstimate interval = fixture.closedEstimates.get(index);
            context.append("\nInterval: ").append(interval.startInclusive).append(' ').append(interval.endExclusive);
        }
        context.append("\nDisplayed time zone describes current formatting, not the source zone at event time.")
                .append("\nCoverage remains unknown; timing is unverified.");
        fixtureTimingDetails.setText(context.toString());
    }

    private void clearFixtureInputs() {
        if (fixtureStart == null) return;
        fixtureStart.setText("");
        fixtureEnd.setText("");
        fixtureDuration.setText("");
        clearFixtureResult();
        fixtureInputs.setVisibility(View.GONE);
        fixtureToggle.setText(R.string.show_fixture_comparison);
        clearFixtureTimingDetails();
    }

    private void clearFixtureTimingDetails() {
        if (fixtureTimingDetails != null) fixtureTimingDetails.setText("");
        if (fixtureTimingPanel != null) fixtureTimingPanel.setVisibility(View.GONE);
        if (fixtureTimingToggle != null) fixtureTimingToggle.setText(R.string.show_fixture_timing_details);
    }

    private void clearFixtureResult() {
        if (fixtureResult != null) fixtureResult.setText(R.string.fixture_not_compared);
    }

    private void compareFixture() {
        if (!readAuthority.isForeground() || inFlight != null) return;
        LocalInspectionCore.DiagnosticReport report = app.checkedReport();
        renderFixtureContext(report);
        if (!report.snapshot.active || !app.storageReady || !app.listenerReady
                || !app.source.hasUsageAccess() || !app.source.isUserUnlocked()
                || !report.snapshot.selectedPackages.contains(FixtureComparison.FIXTURE_PACKAGE)) {
            clearFixtureInputs();
            render();
            return;
        }
        long accessRevision = app.usageAccessRevision();
        long startCode, endCode, callbackDuration;
        try {
            startCode = fixtureNumber(fixtureStart);
            endCode = fixtureNumber(fixtureEnd);
            callbackDuration = fixtureNumber(fixtureDuration);
        } catch (NumberFormatException error) {
            fixtureResult.setText(R.string.fixture_invalid_numbers);
            return;
        }
        FixtureComparison.Result result = FixtureComparison.compare(report, startCode, endCode, callbackDuration);
        LocalInspectionCore.Snapshot current = app.checkedReport().snapshot;
        if (!readAuthority.isForeground() || current.generation != report.snapshot.generation || !current.active
                || accessRevision != app.usageAccessRevision()) {
            clearFixtureInputs();
            render();
            return;
        }
        String text;
        if (result.status == FixtureComparison.Status.INVALID) {
            text = invalidFixtureReason(result.reason);
        } else if (result.status == FixtureComparison.Status.UNKNOWN) {
            text = getString(R.string.fixture_unknown);
        } else {
            text = getString(R.string.fixture_retained_interval_sum, result.candidateDurationMillis) + "\n"
                    + "Fixture value you entered: " + result.fixtureDurationMillis + " ms\n"
                    + "Difference (retained sum − entered): "
                    + String.format(Locale.getDefault(), "%+d ms", result.signedDifferenceMillis) + "\n"
                    + result.overlappingClosedIntervals + " overlapping inferred closed interval"
                    + (result.overlappingClosedIntervals == 1 ? ".\n" : "s.\n")
                    + "Manual values are unverified. Coverage is unknown. This is not an accuracy pass.";
        }
        if (result.status != FixtureComparison.Status.INVALID) {
            StringBuilder explanation = new StringBuilder(text);
            if (estimatesWereDiscarded(result.ambiguityReasons)) {
                explanation.append('\n').append(getString(R.string.discarded_estimates_warning));
            }
            for (String reason : result.ambiguityReasons) {
                explanation.append("\n• ").append(friendlyAmbiguity(reason));
            }
            text = explanation.toString();
        }
        fixtureResult.setText(text);
    }

    private long fixtureNumber(EditText input) {
        String value = input.getText().toString().trim();
        if (!value.matches("[0-9]{1,15}")) throw new NumberFormatException();
        return Long.parseLong(value);
    }

    private String invalidFixtureReason(FixtureComparison.Reason reason) {
        switch (reason) {
            case WINDOW_TOO_LONG: return "Use a controlled test window no longer than 10 minutes.";
            case WINDOW_OUTSIDE_SESSION: return "These codes extend outside this local session. Use a fresh controlled test after Start.";
            case WINDOW_NOT_QUERIED: return "The full window has not been inspected. Tap Inspect now, then enter the codes again.";
            case INVALID_FIXTURE_DURATION: return "The entered callback duration does not fit this window. Check the fixture value.";
            case INVALID_WINDOW: return "Enter a start code followed by a later end code.";
            default: return "This retained report cannot support the comparison. Start a fresh fixture session and inspect first.";
        }
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
