package org.liveabit.inspect;

import android.app.AppOpsManager;
import android.app.usage.UsageEvents;
import android.app.usage.UsageEventsQuery;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.os.Process;
import android.os.SystemClock;
import android.os.UserManager;

import org.liveabit.collector.core.LocalInspectionCore;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.function.BooleanSupplier;

/** The only OS observation read path. No package inventory or event content is accessed. */
final class AndroidUsageSource {
    static final class ReadResult {
        final LocalInspectionCore.SourceStatus status;
        final List<LocalInspectionCore.ProjectedEvent> events;
        final String message;
        final boolean canceled;

        ReadResult(LocalInspectionCore.SourceStatus status,
                List<LocalInspectionCore.ProjectedEvent> events, String message, boolean canceled) {
            this.status = status;
            this.events = Collections.unmodifiableList(events);
            this.message = message;
            this.canceled = canceled;
        }
    }

    private final Context context;

    AndroidUsageSource(Context context) {
        this.context = context.getApplicationContext();
    }

    boolean hasUsageAccess() {
        AppOpsManager operations = context.getSystemService(AppOpsManager.class);
        if (operations == null) return false;
        try {
            return operations.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS,
                    Process.myUid(), context.getPackageName()) == AppOpsManager.MODE_ALLOWED;
        } catch (RuntimeException error) {
            return false;
        }
    }

    boolean isUserUnlocked() {
        UserManager users = context.getSystemService(UserManager.class);
        try {
            return users != null && users.isUserUnlocked();
        } catch (RuntimeException error) {
            return false;
        }
    }

    ReadResult read(LocalInspectionCore.QueryTicket ticket, BooleanSupplier permitted) {
        if (ticket == null || ticket.selectedPackages.isEmpty() || ticket.startInclusive < 0
                || ticket.endExclusive <= ticket.startInclusive || !permitted.getAsBoolean()) {
            return canceled();
        }
        if (!isUserUnlocked()) return locked();
        if (!hasUsageAccess()) return denied();
        UsageStatsManager manager = context.getSystemService(UsageStatsManager.class);
        if (manager == null) return unavailable("The Android usage source is unavailable.");
        Set<String> allowed = new HashSet<>(ticket.selectedPackages);
        List<LocalInspectionCore.ProjectedEvent> events = new ArrayList<>();
        long deadline = SystemClock.elapsedRealtime() + 5000;
        try {
            UsageEventsQuery query = new UsageEventsQuery.Builder(ticket.startInclusive, ticket.endExclusive)
                    .setPackageNames(ticket.selectedPackages.toArray(new String[0]))
                    .setEventTypes(UsageEvents.Event.ACTIVITY_RESUMED, UsageEvents.Event.ACTIVITY_PAUSED)
                    .build();
            if (!permitted.getAsBoolean() || !hasUsageAccess()) return canceledOrDenied(permitted);
            UsageEvents returned = manager.queryEvents(query);
            // This bounds accepted results; the OS query itself cannot be hard-canceled here.
            if (SystemClock.elapsedRealtime() >= deadline) return deadlineExceeded();
            if (returned == null) return unavailable("Android returned no source. Usage is unknown.");
            UsageEvents.Event raw = new UsageEvents.Event();
            while (returned.hasNextEvent()) {
                if (!permitted.getAsBoolean()) return canceled();
                if (SystemClock.elapsedRealtime() >= deadline) return deadlineExceeded();
                if (events.size() >= 4096) {
                    return new ReadResult(LocalInspectionCore.SourceStatus.TRUNCATED, new ArrayList<>(),
                            "This read exceeded the local limit. No partial read was retained.", false);
                }
                if (!returned.getNextEvent(raw)) break;
                String packageName = raw.getPackageName();
                // Denied package identities are discarded before reading any other field.
                if (!allowed.contains(packageName)) continue;
                long timestamp = raw.getTimeStamp();
                int type = raw.getEventType();
                if (timestamp < ticket.startInclusive || timestamp >= ticket.endExclusive) continue;
                LocalInspectionCore.Type projectedType;
                if (type == UsageEvents.Event.ACTIVITY_RESUMED) projectedType = LocalInspectionCore.Type.RESUME;
                else if (type == UsageEvents.Event.ACTIVITY_PAUSED) projectedType = LocalInspectionCore.Type.PAUSE;
                else continue;
                events.add(new LocalInspectionCore.ProjectedEvent(packageName, timestamp, projectedType));
            }
            if (!permitted.getAsBoolean()) return canceled();
            if (!isUserUnlocked()) return locked();
            if (!hasUsageAccess()) return denied();
            if (SystemClock.elapsedRealtime() >= deadline) return deadlineExceeded();
            return new ReadResult(LocalInspectionCore.SourceStatus.AVAILABLE, events,
                    events.isEmpty() ? "No transitions returned. Usage remains unknown."
                            : "Permitted transitions read. Completeness remains unknown.", false);
        } catch (SecurityException error) {
            return denied();
        } catch (RuntimeException error) {
            return unavailable("The Android usage read failed. Usage is unknown.");
        }
    }

    private ReadResult canceledOrDenied(BooleanSupplier permitted) {
        return permitted.getAsBoolean() ? denied() : canceled();
    }

    private ReadResult denied() {
        return new ReadResult(LocalInspectionCore.SourceStatus.PERMISSION_DENIED, new ArrayList<>(),
                "Usage access is off. The local session has stopped.", false);
    }

    private ReadResult locked() {
        return new ReadResult(LocalInspectionCore.SourceStatus.DEVICE_LOCKED, new ArrayList<>(),
                "Device storage is locked. The local session has stopped.", false);
    }

    private ReadResult canceled() {
        return new ReadResult(LocalInspectionCore.SourceStatus.UNAVAILABLE, new ArrayList<>(),
                "The read was canceled. No result was retained.", true);
    }

    private ReadResult unavailable(String message) {
        return new ReadResult(LocalInspectionCore.SourceStatus.UNAVAILABLE, new ArrayList<>(), message, false);
    }

    private ReadResult deadlineExceeded() {
        return unavailable("The result arrived outside the local acceptance deadline. No result was retained; usage is unknown.");
    }
}
