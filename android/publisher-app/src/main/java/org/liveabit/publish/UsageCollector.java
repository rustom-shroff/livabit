package org.liveabit.publish;

import android.app.AppOpsManager;
import android.app.usage.UsageEvents;
import android.app.usage.UsageEventsQuery;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.os.Process;
import android.os.SystemClock;
import android.provider.Settings;
import org.json.JSONArray;
import org.json.JSONObject;
import org.liveabit.collector.core.LocalInspectionCore;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/** Validates the native read and estimates adjacent windows using selected package/time/lifecycle fields. */
final class UsageCollector {
    static final class Result {
        final JSONObject event, boundary;
        Result(JSONObject event, JSONObject boundary) { this.event = event; this.boundary = boundary; }
    }
    static boolean permitted(Context context) {
        AppOpsManager ops = context.getSystemService(AppOpsManager.class);
        return ops != null && ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS,
            Process.myUid(), context.getPackageName()) == AppOpsManager.MODE_ALLOWED;
    }
    static Result collect(Context context, JSONObject state, long end) throws Exception {
        if (!permitted(context)) throw new IllegalStateException("Enable usage access before sharing.");
        Set<String> packages = LocalInspectionCore.parsePackages(join(state.getJSONArray("packages")));
        long elapsed = SystemClock.elapsedRealtime();
        long start = Math.max(Math.max(state.optLong("cursor", end - 900_000), end - 900_000), end - elapsed);
        if (start >= end) return null;
        LocalInspectionCore core = new LocalInspectionCore();
        core.start(packages, new LocalInspectionCore.ClockSample(start, elapsed - (end - start)));
        LocalInspectionCore.QueryTicket ticket = core.beginQuery(new LocalInspectionCore.ClockSample(end, elapsed));
        UsageStatsManager manager = context.getSystemService(UsageStatsManager.class);
        UsageEventsQuery query = new UsageEventsQuery.Builder(start, end).setPackageNames(packages.toArray(new String[0]))
            .setEventTypes(UsageEvents.Event.ACTIVITY_RESUMED, UsageEvents.Event.ACTIVITY_PAUSED).build();
        UsageEvents source = manager == null ? null : manager.queryEvents(query);
        if (source == null) throw new IllegalStateException("Android usage source unavailable.");
        List<LocalInspectionCore.ProjectedEvent> events = new ArrayList<>();
        UsageEvents.Event raw = new UsageEvents.Event();
        while (source.hasNextEvent()) {
            if (events.size() >= 4096 || SystemClock.elapsedRealtime() - elapsed > 5000)
                throw new IllegalStateException("Android usage read exceeded its limit.");
            if (!source.getNextEvent(raw)) break;
            String packageName = raw.getPackageName();
            if (!packages.contains(packageName)) continue;
            int type = raw.getEventType(); long at = raw.getTimeStamp();
            if (at < start || at >= end) continue;
            if (type == UsageEvents.Event.ACTIVITY_RESUMED || type == UsageEvents.Event.ACTIVITY_PAUSED)
                events.add(new LocalInspectionCore.ProjectedEvent(packageName, at,
                    type == UsageEvents.Event.ACTIVITY_RESUMED ? LocalInspectionCore.Type.RESUME : LocalInspectionCore.Type.PAUSE));
        }
        if (!permitted(context)) throw new IllegalStateException("Usage access has been removed.");
        // Recover screen-off boundaries even if Android killed the process and its broadcast receiver.
        UsageEvents screenSource = manager.queryEvents(new UsageEventsQuery.Builder(start, end)
            .setEventTypes(UsageEvents.Event.SCREEN_NON_INTERACTIVE).build());
        if (screenSource == null) throw new IllegalStateException("Android screen source unavailable.");
        List<Long> screenOffs = new ArrayList<>();
        while (screenSource.hasNextEvent()) {
            if (screenOffs.size() >= 4096 || SystemClock.elapsedRealtime() - elapsed > 5000)
                throw new IllegalStateException("Android usage read exceeded its limit.");
            if (!screenSource.getNextEvent(raw)) break;
            if (raw.getEventType() == UsageEvents.Event.SCREEN_NON_INTERACTIVE) screenOffs.add(raw.getTimeStamp());
        }
        if (!permitted(context)) throw new IllegalStateException("Usage access has been removed.");
        LocalInspectionCore.ClockSample finished = new LocalInspectionCore.ClockSample(System.currentTimeMillis(), SystemClock.elapsedRealtime());
        if (!core.finishQuery(ticket, finished, events, LocalInspectionCore.SourceStatus.AVAILABLE).accepted)
            throw new IllegalStateException("Usage read could not be accepted.");
        int boot = Settings.Global.getInt(context.getContentResolver(), Settings.Global.BOOT_COUNT, -1);
        ForegroundContinuity.Result estimate = ForegroundContinuity.estimate(packages, events, screenOffs,
            state.optJSONObject("foreground_context"), start, end, elapsed, boot, ScreenActivity.interactive(context));
        return new Result(OapObservation.create(state, start, end, Math.max(end, finished.wallMillis), estimate.apps), estimate.boundary);
    }
    static String join(JSONArray values) throws Exception {
        List<String> strings = new ArrayList<>(); for (int index = 0; index < values.length(); index++) strings.add(values.getString(index));
        return String.join("\n", strings);
    }
}
