package org.liveabit.inspect;

import android.app.AppOpsManager;
import android.app.Application;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;

import org.liveabit.collector.core.LocalInspectionCore;

import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;

/** One process-local coordinator. There is no service, receiver or background collector. */
public final class LocalInspectionApplication extends Application {
    final LocalInspectionCore core = new LocalInspectionCore();
    AndroidUsageSource source;
    private InspectionStore store;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private Runnable observer;
    private AppOpsManager operations;
    private AppOpsManager.OnOpChangedListener usageListener;
    private final AtomicLong usageAccessRevision = new AtomicLong();
    private long handledUsageAccessRevision;
    volatile boolean storageReady;
    volatile boolean listenerReady;
    String message = "Stopped. Start a local session when you are ready.";

    private final Runnable expiry = () -> {
        LocalInspectionCore.Snapshot snapshot = core.snapshot();
        if (!snapshot.active) return;
        long remaining = snapshot.sessionStartElapsedMillis + LocalInspectionCore.MAX_SESSION_MILLIS
                - SystemClock.elapsedRealtime();
        if (remaining > 0) {
            mainHandler.postDelayed(thisExpiry(), remaining);
            return;
        }
        stop("The 24-hour local session ended. Observations were cleared.");
    };

    // Avoid referring to the field being initialized from its own lambda initializer.
    private Runnable thisExpiry() { return expiry; }

    @Override public void onCreate() {
        super.onCreate();
        source = new AndroidUsageSource(this);
        store = new InspectionStore(this);
        if (!source.isUserUnlocked()) {
            failClosed("Device storage is locked. Local inspection is stopped.");
            return;
        }
        try {
            InspectionStore.StoredControl restored = store.load();
            store.commit(core.restart(restored.generation, new HashSet<>(restored.selectedPackages), now()));
            storageReady = true;
        } catch (RuntimeException error) {
            failClosed("Local settings could not be verified. Inspection is stopped. Clear local data to retry.");
        }
        watchUsageAccess();
    }

    static LocalInspectionCore.ClockSample now() {
        return new LocalInspectionCore.ClockSample(System.currentTimeMillis(), SystemClock.elapsedRealtime());
    }

    void setObserver(Runnable observer) { this.observer = observer; }
    void removeObserver(Runnable observer) { if (this.observer == observer) this.observer = null; }

    boolean start(Set<String> packages) {
        handlePendingUsageAccessChange();
        long accessRevision = usageAccessRevision.get();
        if (!listenerReady) {
            failClosed("This device cannot track usage-access changes. Local inspection is unavailable.");
            notifyObserver();
            return false;
        }
        if (!storageReady || !source.isUserUnlocked()) {
            failClosed("Local storage is unavailable. Inspection is stopped.");
            notifyObserver();
            return false;
        }
        if (!source.hasUsageAccess()) {
            stop("Usage access is off. Enable it separately before starting.");
            return false;
        }
        try {
            LocalInspectionCore.Snapshot snapshot = core.start(packages, now());
            store.commit(snapshot);
            if (accessRevision != usageAccessRevision.get()) {
                handlePendingUsageAccessChange();
                return false;
            }
            message = "Local session ready. Use a selected app, return here, then tap Inspect now.";
            scheduleExpiry(snapshot);
            notifyObserver();
            return true;
        } catch (RuntimeException error) {
            failClosed("The start could not be saved. Inspection is stopped.");
            notifyObserver();
            return false;
        }
    }

    void stop(String stoppedMessage) {
        mainHandler.removeCallbacks(expiry);
        try {
            LocalInspectionCore.Snapshot snapshot = core.pause(now());
            store.commit(snapshot);
            storageReady = true;
            message = stoppedMessage;
        } catch (RuntimeException error) {
            failClosed("Inspection is stopped and memory cleared. The saved stop could not be verified.");
        }
        notifyObserver();
    }

    void clear() {
        mainHandler.removeCallbacks(expiry);
        try {
            LocalInspectionCore.Snapshot snapshot = core.clear(now());
            store.reset(snapshot);
            storageReady = true;
            message = "Stopped. Observations and the saved app selection were cleared.";
            if (!listenerReady) watchUsageAccess();
        } catch (RuntimeException error) {
            failClosed("Inspection is stopped and memory cleared. Saved selection deletion could not be verified.");
        }
        notifyObserver();
    }

    LocalInspectionCore.DiagnosticReport checkedReport() {
        handlePendingUsageAccessChange();
        if (!listenerReady || !source.isUserUnlocked() || !source.hasUsageAccess()) {
            if (core.snapshot().active || core.snapshot().eventCount != 0) {
                stop("Usage access, change tracking or unlocked storage is unavailable. Inspection stopped and observations cleared.");
            }
        }
        LocalInspectionCore.Snapshot before = core.snapshot();
        LocalInspectionCore.DiagnosticReport report = core.report(now());
        if (before.generation != report.snapshot.generation || before.active != report.snapshot.active) {
            try {
                store.commit(report.snapshot);
                message = "The session stopped after its time or clock safety check. Observations were cleared.";
            } catch (RuntimeException error) {
                failClosed("Inspection is stopped and memory cleared. Local settings could not be saved.");
                report = core.report(now());
            }
            mainHandler.removeCallbacks(expiry);
        }
        return report;
    }

    void commitRead(LocalInspectionCore.QueryTicket ticket, AndroidUsageSource.ReadResult read,
            long capturedAccessRevision) {
        handlePendingUsageAccessChange();
        if (capturedAccessRevision != usageAccessRevision.get()) {
            core.cancelQuery(ticket);
            notifyObserver();
            return;
        }
        if (read.canceled) {
            core.cancelQuery(ticket);
            message = read.message;
            notifyObserver();
            return;
        }
        if (!listenerReady || !source.hasUsageAccess() || !source.isUserUnlocked()
                || read.status == LocalInspectionCore.SourceStatus.PERMISSION_DENIED
                || read.status == LocalInspectionCore.SourceStatus.DEVICE_LOCKED) {
            stop("Usage access or unlocked storage is unavailable. Inspection stopped and observations cleared.");
            return;
        }
        try {
            LocalInspectionCore.CommitResult result = core.finishQuery(ticket, now(), read.events, read.status);
            store.commit(result.snapshot);
            message = result.accepted ? read.message
                    : "This result was discarded after a session, source or clock safety check.";
            if (!result.snapshot.active) mainHandler.removeCallbacks(expiry);
        } catch (RuntimeException error) {
            failClosed("The local read could not be saved safely. Inspection is stopped and memory cleared.");
        }
        notifyObserver();
    }

    LocalInspectionCore.QueryTicket beginRead() {
        handlePendingUsageAccessChange();
        if (!listenerReady || !storageReady) return null;
        LocalInspectionCore.Snapshot before = core.snapshot();
        LocalInspectionCore.QueryTicket ticket = core.beginQuery(now());
        LocalInspectionCore.Snapshot after = core.snapshot();
        if (before.generation != after.generation || before.active != after.active) {
            try {
                store.commit(after);
                message = "The session stopped after its time or clock safety check. Observations were cleared.";
            } catch (RuntimeException error) {
                failClosed("Inspection is stopped and memory cleared. Local settings could not be saved.");
            }
            mainHandler.removeCallbacks(expiry);
        }
        return ticket;
    }

    private void scheduleExpiry(LocalInspectionCore.Snapshot snapshot) {
        mainHandler.removeCallbacks(expiry);
        long remaining = snapshot.sessionStartElapsedMillis + LocalInspectionCore.MAX_SESSION_MILLIS
                - SystemClock.elapsedRealtime();
        mainHandler.postDelayed(expiry, Math.max(0, remaining));
    }

    private void watchUsageAccess() {
        if (listenerReady) return;
        operations = getSystemService(AppOpsManager.class);
        if (operations == null) {
            failClosed("This device cannot track usage-access changes. Local inspection is unavailable.");
            return;
        }
        usageListener = (operation, packageName) -> {
            if (!AppOpsManager.OPSTR_GET_USAGE_STATS.equals(operation)
                    || !(packageName == null || packageName.isEmpty()
                    || getPackageName().equals(packageName))) return;
            // Fence a pending read immediately, even if the OS regrants access before the UI callback runs.
            usageAccessRevision.incrementAndGet();
            mainHandler.post(this::handlePendingUsageAccessChange);
        };
        try {
            operations.startWatchingMode(AppOpsManager.OPSTR_GET_USAGE_STATS, getPackageName(), usageListener);
            listenerReady = true;
        } catch (RuntimeException error) {
            listenerReady = false;
            failClosed("This device cannot track usage-access changes. Local inspection is unavailable.");
        }
    }

    long usageAccessRevision() { return usageAccessRevision.get(); }

    private void handlePendingUsageAccessChange() {
        long observed = usageAccessRevision.get();
        if (observed == handledUsageAccessRevision) return;
        handledUsageAccessRevision = observed;
        if (core.snapshot().active || core.snapshot().eventCount != 0) {
            // The notification proves a boundary happened; current MODE_ALLOWED cannot erase that boundary.
            stop("Android usage access changed. The session stopped and observations were cleared. Start a fresh local session.");
        }
    }

    private void failClosed(String failureMessage) {
        core.pause(now());
        storageReady = false;
        mainHandler.removeCallbacks(expiry);
        message = failureMessage;
    }

    private void notifyObserver() {
        if (observer != null) observer.run();
    }
}
