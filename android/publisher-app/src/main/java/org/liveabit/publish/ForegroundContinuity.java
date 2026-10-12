package org.liveabit.publish;

import org.json.JSONArray;
import org.json.JSONObject;
import org.liveabit.collector.core.LocalInspectionCore;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Set;

/** Package-level estimates across adjacent windows; never establishes source completeness. */
final class ForegroundContinuity {
    static final class Result {
        final JSONArray apps;
        final JSONObject boundary;
        Result(JSONArray apps, JSONObject boundary) { this.apps = apps; this.boundary = boundary; }
    }
    static Result estimate(Set<String> packages, List<LocalInspectionCore.ProjectedEvent> events,
            List<Long> screenOffs, JSONObject previous, long start, long end, long elapsed, int boot, boolean interactive) throws Exception {
        long previousWall = previous == null ? -1 : previous.optLong("wall", -1);
        long previousElapsed = previous == null ? -1 : previous.optLong("elapsed", -1);
        boolean adjacent = interactive && boot >= 0 && previous != null && previousWall == start
            && previous.optInt("boot", -1) == boot && previousElapsed >= 0 && elapsed >= previousElapsed
            && Math.abs((end - previousWall) - (elapsed - previousElapsed)) <= LocalInspectionCore.CLOCK_TOLERANCE_MILLIS;
        JSONObject saved = adjacent ? previous.optJSONObject("apps") : null;
        JSONObject next = new JSONObject(); JSONArray apps = new JSONArray();
        for (String name : packages) {
            JSONObject carry = saved == null ? null : saved.optJSONObject(name);
            int depth = carry == null ? 0 : carry.optInt("depth", 0);
            long since = carry == null ? -1 : carry.optLong("since", -1);
            if (depth < 1 || depth > LocalInspectionCore.MAX_EVENTS || since < 0 || since > start
                    || end - since > LocalInspectionCore.MAX_SESSION_MILLIS) { depth = 0; since = -1; }
            long opening = depth > 0 ? start : -1, total = 0; boolean estimated = false, screenEnded = false;
            List<LocalInspectionCore.ProjectedEvent> records = new ArrayList<>();
            for (LocalInspectionCore.ProjectedEvent event : events) {
                if (name.equals(event.packageName) && event.timestampMillis >= start && event.timestampMillis < end)
                    records.add(event);
            }
            int transitionCount = records.size();
            // Screen boundaries end an inferred foreground interval without leaving the device.
            for (long off : screenOffs) if (off >= start && off < end)
                records.add(new LocalInspectionCore.ProjectedEvent(name, off, null));
            records.sort(Comparator.comparingLong(event -> event.timestampMillis));
            for (int index = 0; index < records.size();) {
                LocalInspectionCore.ProjectedEvent event = records.get(index);
                int limit = index + 1;
                while (limit < records.size() && records.get(limit).timestampMillis == event.timestampMillis) limit++;
                if (event.type == null && limit - index == 1) {
                    if (depth > 0 && opening < event.timestampMillis) { total += event.timestampMillis - opening; estimated = true; }
                    depth = 0; opening = since = -1; screenEnded = true;
                } else if (limit - index > 1) {
                    // Package-only records cannot distinguish duplicate or overlapping activity instances.
                    total = 0; estimated = false; depth = 0; opening = since = -1;
                } else if (event.type == LocalInspectionCore.Type.RESUME) {
                    if (depth == 0) opening = since = event.timestampMillis;
                    depth++; screenEnded = false;
                } else if (depth == 0 && !screenEnded) {
                    total = 0; estimated = false; opening = since = -1;
                } else if (depth > 0 && --depth == 0) {
                    if (opening < event.timestampMillis) { total += event.timestampMillis - opening; estimated = true; }
                    opening = since = -1;
                }
                index = limit;
            }
            if (interactive && depth > 0 && depth <= LocalInspectionCore.MAX_EVENTS
                    && end - since <= LocalInspectionCore.MAX_SESSION_MILLIS) {
                if (opening < end) { total += end - opening; estimated = true; }
                next.put(name, new JSONObject().put("depth", depth).put("since", since));
            }
            apps.put(new JSONObject().put("application", new JSONObject().put("namespace", "android").put("id", name))
                .put("foreground_duration_ms", estimated ? total : JSONObject.NULL).put("transition_count", transitionCount));
        }
        return new Result(apps, new JSONObject().put("wall", end).put("elapsed", elapsed).put("boot", boot).put("apps", next));
    }
}
