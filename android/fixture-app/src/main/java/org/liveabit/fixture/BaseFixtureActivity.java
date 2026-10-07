package org.liveabit.fixture;

import android.app.Activity;
import android.graphics.Insets;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import org.liveabit.fixture.core.LifecycleFixtureCore;

/** Authored screens forward only their own callback token/type and paired clock samples. */
abstract class BaseFixtureActivity extends Activity {
    // No Activity instance, class metadata or identifier is placed in a retained record.
    private final Object callbackToken = new Object();
    private TextView reportView;
    private TextView traceView;

    protected abstract int titleResource();
    protected abstract void switchScreen();

    private LifecycleFixtureCore ledger() { return ((FixtureApplication) getApplication()).ledger(); }

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        ScrollView scroll = new ScrollView(this);
        scroll.setSaveEnabled(false);
        scroll.setOnApplyWindowInsetsListener((view, windowInsets) -> {
            Insets safe = windowInsets.getInsets(WindowInsets.Type.systemBars()
                | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
            view.setPadding(safe.left, safe.top, safe.right, safe.bottom);
            return windowInsets;
        });
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(dp(20), dp(20), dp(20), dp(28));
        panel.setSaveEnabled(false);
        panel.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
        scroll.addView(panel);
        addText(panel, getString(titleResource()), 26);
        addText(panel, getString(R.string.boundary_notice), 16);
        addText(panel, getString(R.string.trial_instructions), 16);
        addButton(panel, R.string.begin, () -> {
            ledger().begin(callbackToken, FixtureApplication.sample()); render();
        });
        addButton(panel, R.string.switch_screen, () -> {
            ledger().report(FixtureApplication.sample()); switchScreen();
        });
        addButton(panel, R.string.finish, () -> {
            ledger().finish(callbackToken, FixtureApplication.sample()); render();
        });
        addButton(panel, R.string.clear, () -> {
            ledger().clear(FixtureApplication.sample()); render();
        });
        addButton(panel, R.string.refresh, this::render);
        reportView = addText(panel, "", 17);
        addText(panel, getString(R.string.callback_heading), 19);
        traceView = addText(panel, "", 15);
        setContentView(scroll);
        scroll.requestApplyInsets();
    }

    @Override protected void onResume() {
        super.onResume();
        ledger().resume(callbackToken, FixtureApplication.sample());
        render();
    }

    @Override protected void onPause() {
        ledger().pause(callbackToken, FixtureApplication.sample());
        // Hidden screens retain no rendered copy of a trace cleared on the other screen.
        if (reportView != null) reportView.setText("");
        if (traceView != null) traceView.setText("");
        super.onPause();
    }

    private void render() {
        if (reportView == null) return;
        LifecycleFixtureCore.Report report = ledger().report(FixtureApplication.sample());
        StringBuilder text = new StringBuilder(getString(stateResource(report.state)));
        text.append('\n').append(getString(reasonResource(report.reason))).append('\n');
        text.append(getString(R.string.callback_count, report.callbackCount)).append('\n');
        if (report.unionDurationMillis != null) {
            text.append(getString(report.comparisonAvailable ? R.string.finished_union : R.string.provisional_union,
                Long.toString(report.unionDurationMillis))).append('\n');
        }
        if (report.comparisonAvailable) {
            text.append('\n').append(getString(R.string.comparison_instructions)).append('\n');
            text.append(getString(R.string.begin_code, Long.toString(report.beginWallMillis))).append('\n');
            text.append(getString(R.string.finish_code, Long.toString(report.finishWallMillis))).append('\n');
            text.append(getString(R.string.begin_elapsed, Long.toString(report.beginElapsedMillis))).append('\n');
            text.append(getString(R.string.finish_elapsed, Long.toString(report.finishElapsedMillis))).append('\n');
        } else if (report.state == LifecycleFixtureCore.State.ACTIVE) {
            text.append(getString(R.string.active_marker, Long.toString(report.beginWallMillis))).append('\n');
        }
        text.append('\n').append(getString(R.string.coverage_notice));
        reportView.setText(text.toString());
        StringBuilder trace = new StringBuilder();
        for (LifecycleFixtureCore.Record record : report.records) {
            trace.append(getString(R.string.callback_row,
                getString(record.type == LifecycleFixtureCore.Type.RESUME ? R.string.resume : R.string.pause),
                Long.toString(record.wallMillis), Long.toString(record.elapsedMillis))).append('\n');
        }
        traceView.setText(trace.length() == 0 ? getString(R.string.no_callbacks) : trace.toString());
    }

    private TextView addText(LinearLayout panel, String text, int size) {
        TextView view = new TextView(this);
        view.setTextSize(size);
        view.setText(text);
        view.setTextColor(0xFF18392D);
        view.setPadding(0, dp(8), 0, dp(8));
        view.setSaveEnabled(false);
        view.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO);
        panel.addView(view, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT));
        return view;
    }
    private void addButton(LinearLayout panel, int label, Runnable action) {
        Button button = new Button(this);
        button.setText(label);
        button.setAllCaps(false);
        button.setSaveEnabled(false);
        button.setOnClickListener(view -> action.run());
        panel.addView(button, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT));
    }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private static int stateResource(LifecycleFixtureCore.State state) {
        return switch (state) {
            case IDLE -> R.string.state_idle;
            case ACTIVE -> R.string.state_active;
            case FINISHED -> R.string.state_finished;
            case INVALID -> R.string.state_invalid;
        };
    }
    private static int reasonResource(LifecycleFixtureCore.Reason reason) {
        return switch (reason) {
            case EMPTY -> R.string.reason_empty;
            case RUNNING -> R.string.reason_running;
            case FINISHED -> R.string.reason_finished;
            case CLEARED -> R.string.reason_cleared;
            case INVALID_SAMPLE -> R.string.reason_sample;
            case CALLER_NOT_RESUMED -> R.string.reason_caller;
            case DUPLICATE_RESUME -> R.string.reason_duplicate;
            case UNMATCHED_PAUSE -> R.string.reason_unmatched;
            case RECORD_LIMIT -> R.string.reason_limit;
            case RUN_EXPIRED -> R.string.reason_expired;
            case CLOCK_DISCONTINUITY -> R.string.reason_clock;
        };
    }
}
