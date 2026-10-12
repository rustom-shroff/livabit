package org.liveabit.publish;

import android.app.AppOpsManager;
import android.app.usage.UsageEvents;
import android.app.usage.UsageEventsQuery;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.os.Process;
import android.os.SystemClock;
import org.json.JSONArray;
import org.json.JSONObject;
import org.liveabit.collector.core.LocalInspectionCore;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/** Reuses the accepted native estimator. Only selected package/time/lifecycle fields leave the OS read. */
final class UsageCollector {
    static boolean permitted(Context context) {
        AppOpsManager ops = context.getSystemService(AppOpsManager.class);
        return ops != null && ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS,
            Process.myUid(), context.getPackageName()) == AppOpsManager.MODE_ALLOWED;
    }
    static JSONObject collect(Context context, JSONObject state, long end) throws Exception {
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
        LocalInspectionCore.ClockSample finished = new LocalInspectionCore.ClockSample(System.currentTimeMillis(), SystemClock.elapsedRealtime());
        if (!core.finishQuery(ticket, finished, events, LocalInspectionCore.SourceStatus.AVAILABLE).accepted)
            throw new IllegalStateException("Usage read could not be accepted.");
        JSONArray apps = new JSONArray();
        for (LocalInspectionCore.PackageDiagnostic diagnostic : core.report(finished).packages) {
            apps.put(new JSONObject().put("application", new JSONObject().put("namespace", "android").put("id", diagnostic.packageName))
                .put("foreground_duration_ms", diagnostic.estimatedDurationMillis == null ? JSONObject.NULL : diagnostic.estimatedDurationMillis)
                .put("transition_count", diagnostic.eventCount));
        }
        return OapObservation.create(state, start, end, Math.max(end, finished.wallMillis), apps);
    }
    static String join(JSONArray values) throws Exception {
        List<String> strings = new ArrayList<>(); for (int index = 0; index < values.length(); index++) strings.add(values.getString(index));
        return String.join("\n", strings);
    }
}
