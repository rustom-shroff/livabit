package org.liveabit.publish;

import android.app.usage.UsageEvents;
import android.app.usage.UsageEventsQuery;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.os.PowerManager;
import android.os.SystemClock;
import android.provider.Settings;
import org.json.JSONObject;

/** Screen timing stays local; only ordinary selected-app observations are transmitted. */
final class ScreenActivity {
    static boolean interactive(Context context) {
        PowerManager power = context.getSystemService(PowerManager.class);
        return power != null && power.isInteractive();
    }
    static void record(Context context, JSONObject state, boolean interactive) throws Exception {
        int boot = Settings.Global.getInt(context.getContentResolver(), Settings.Global.BOOT_COUNT, -1);
        if (interactive) {
            state.put("screen_interactive", true).put("screen_off_elapsed", -1).put("automatic_paused", false);
        } else if (state.optBoolean("screen_interactive", true)
                || state.optInt("screen_off_boot", -1) != boot || state.optLong("screen_off_elapsed", -1) < 0) {
            state.put("screen_interactive", false).put("screen_off_elapsed", SystemClock.elapsedRealtime())
                .put("screen_off_boot", boot);
            state.remove("foreground_context");
        }
    }
    static boolean paused(Context context, JSONObject state) throws Exception {
        if (interactive(context)) { record(context, state, true); return false; }
        int boot = Settings.Global.getInt(context.getContentResolver(), Settings.Global.BOOT_COUNT, -1);
        long elapsed = SystemClock.elapsedRealtime(), off = state.optLong("screen_off_elapsed", -1);
        if (state.optInt("screen_off_boot", -1) != boot || off < 0 || off > elapsed
                || state.optBoolean("screen_interactive", true)) {
            // Recover an off transition if Android restarted our process while the phone was idle.
            long wall = System.currentTimeMillis(), latestOff = -1;
            UsageStatsManager manager = context.getSystemService(UsageStatsManager.class);
            UsageEvents events = manager == null ? null : manager.queryEvents(new UsageEventsQuery.Builder(
                Math.max(wall - elapsed, wall - 86_400_000L), wall)
                .setEventTypes(UsageEvents.Event.SCREEN_INTERACTIVE, UsageEvents.Event.SCREEN_NON_INTERACTIVE).build());
            UsageEvents.Event event = new UsageEvents.Event();
            int count = 0;
            while (events != null && events.hasNextEvent() && count++ < 4096) {
                if (!events.getNextEvent(event)) break;
                if (event.getEventType() == UsageEvents.Event.SCREEN_NON_INTERACTIVE) latestOff = event.getTimeStamp();
                else latestOff = -1;
            }
            // Unknown inactive history must not generate idle traffic.
            off = latestOff < 0 ? -1 : Math.max(0, elapsed - Math.max(0, wall - latestOff));
            state.put("screen_interactive", false).put("screen_off_elapsed", off).put("screen_off_boot", boot);
        }
        boolean paused = off < 0 || elapsed - off >= state.getInt("screen_off_minutes") * 60_000L;
        state.put("automatic_paused", paused);
        return paused;
    }
}
