package org.liveabit.inspect;

import android.app.Application;
import org.liveabit.collector.core.LocalInspectionCore;
import java.util.List;
import java.util.function.BooleanSupplier;

/** Host source seam deliberately permits a late denied/locked result despite canceled authority. */
final class AndroidUsageSource {
    interface Reader { ReadResult read(LocalInspectionCore.QueryTicket ticket, BooleanSupplier permitted); }
    static final class ReadResult {
        final List<LocalInspectionCore.ProjectedEvent> events;
        final LocalInspectionCore.SourceStatus status;
        final boolean canceled;
        final String message;
        ReadResult(LocalInspectionCore.SourceStatus status, List<LocalInspectionCore.ProjectedEvent> events) {
            this.status = status; this.events = events; canceled = false; message = "host seam read result";
        }
    }
    volatile boolean access = true, unlocked = true;
    volatile Reader reader;
    AndroidUsageSource(Application application) { }
    boolean hasUsageAccess() { return access; }
    boolean isUserUnlocked() { return unlocked; }
    ReadResult read(LocalInspectionCore.QueryTicket ticket, BooleanSupplier permitted) {
        return reader.read(ticket, permitted);
    }
}
