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
    private final ProcessReadCoordinator physicalReads = new ProcessReadCoordinator();
    private PendingRead pendingRead;
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


    /** Main-thread-owned admission data. The physical worker retains no Activity. */
    static final class PendingRead {
        final LocalInspectionCore.QueryTicket ticket;
        final ProcessReadCoordinator.Reservation reservation;
        final ForegroundReadAuthority authority;
        final long epoch;
        final long accessRevision;
        volatile boolean completionDeliveryRejected;

        PendingRead(LocalInspectionCore.QueryTicket ticket, ProcessReadCoordinator.Reservation reservation,
                ForegroundReadAuthority authority, long epoch, long accessRevision) {
            this.ticket = ticket;
            this.reservation = reservation;
            this.authority = authority;
            this.epoch = epoch;
            this.accessRevision = accessRevision;
        }
    }

    boolean physicalReadBusy() { return physicalReads.isBusy(); }
    boolean isPending(PendingRead operation) {
        return operation != null && pendingRead == operation && !operation.reservation.isCanceled();
    }

    /** Called on the main thread after an explicit foreground Inspect tap. No queued replacement. */
    PendingRead requestRead(ForegroundReadAuthority authority, long epoch) {
        reconcileUndeliverableRead();
        handlePendingUsageAccessChange();
        if (authority == null || !authority.matches(epoch)) return null;
        if (physicalReads.isBusy() || pendingRead != null) {
            message = "An earlier read is still finishing. Tap Inspect now after it ends.";
            return null;
        }
        if (!storageReady || !listenerReady || !source.hasUsageAccess() || !source.isUserUnlocked()) return null;
        ProcessReadCoordinator.Reservation reservation = physicalReads.tryReserve();
        if (reservation == null) {
            message = "An earlier read is still finishing. Tap Inspect now after it ends.";
            return null;
        }
        LocalInspectionCore.QueryTicket ticket = null;
        boolean dispatched = false;
        try {
            long accessRevision = usageAccessRevision();
            ticket = beginRead();
            if (ticket == null) {
                if (core.snapshot().active && storageReady) {
                    message = "There is no new query interval. Use a selected app, then return and inspect.";
                }
                return null;
            }
            PendingRead operation = new PendingRead(ticket, reservation, authority, epoch, accessRevision);
            pendingRead = operation;
            if (!readPermitted(operation)) {
                cancelRead(operation);
                return null;
            }
            message = "Reading selected transitions on this device…";
            dispatched = physicalReads.dispatch(reservation,
                    ignored -> source.read(operation.ticket, () -> readPermitted(operation)),
                    (ignored, result, failure) -> postReadCompletion(operation, result, failure));
            if (!dispatched) {
                cancelRead(operation);
                message = "The local read could not be started. Tap Inspect now to retry.";
                return null;
            }
            return operation;
        } catch (RuntimeException failure) {
            if (pendingRead != null && pendingRead.reservation == reservation) cancelRead(pendingRead);
            else if (ticket != null) core.cancelQuery(ticket);
            reservation.cancel();
            message = "The local read could not be started safely. Tap Inspect now to retry.";
            return null;
        } finally {
            if (!dispatched) physicalReads.abandonUnstarted(reservation);
        }
    }

    private boolean readPermitted(PendingRead operation) {
        LocalInspectionCore.Snapshot current = core.snapshot();
        long elapsed = SystemClock.elapsedRealtime();
        long wall = System.currentTimeMillis();
        boolean clockSafe = LocalInspectionCore.isClockContinuous(current,
                new LocalInspectionCore.ClockSample(wall, elapsed));
        return !operation.reservation.isCanceled() && operation.authority.matches(operation.epoch)
                && storageReady && listenerReady && current.active && current.generation == operation.ticket.generation
                && clockSafe && operation.accessRevision == usageAccessRevision()
                && elapsed - current.sessionStartElapsedMillis < LocalInspectionCore.MAX_SESSION_MILLIS;
    }

    private void postReadCompletion(PendingRead operation, AndroidUsageSource.ReadResult result, Throwable failure) {
        boolean delivered;
        try {
            delivered = mainHandler.post(() -> finishRead(operation, result, failure));
        } catch (RuntimeException unavailable) {
            delivered = false;
        }
        if (!delivered) {
            // Only synchronized core/volatile authority data may change on this worker.
            // Never commit, persist, notify UI or free a running source slot here.
            operation.reservation.cancel();
            operation.completionDeliveryRejected = true;
            core.cancelQuery(operation.ticket);
        }
    }

    private void reconcileUndeliverableRead() {
        PendingRead operation = pendingRead;
        if (operation == null || !operation.completionDeliveryRejected) return;
        cancelRead(operation);
        message = "The read result could not reach this screen. No result was retained; tap Inspect now to retry.";
    }

    private void finishRead(PendingRead operation, AndroidUsageSource.ReadResult result, Throwable failure) {
        handlePendingUsageAccessChange();
        // Reject stale authority before commitRead's permission/lock branches can affect a fresh session.
        if (pendingRead != operation || !readPermitted(operation)) {
            cancelRead(operation);
            notifyObserver();
            return;
        }
        pendingRead = null;
        if (failure != null || result == null) {
            operation.reservation.cancel();
            core.cancelQuery(operation.ticket);
            message = "The local read failed. No result was retained; usage is unknown.";
            notifyObserver();
            return;
        }
        commitRead(operation.ticket, result, operation.accessRevision);
    }

    /** Revoking authority never frees a dispatched physical slot, even after Activity destruction. */
    void cancelRead(PendingRead operation) {
        if (operation == null) return;
        operation.reservation.cancel();
        core.cancelQuery(operation.ticket);
        if (pendingRead == operation) pendingRead = null;
    }

    private void cancelPendingRead() { cancelRead(pendingRead); }

    boolean start(Set<String> packages) {
        cancelPendingRead();
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
        cancelPendingRead();
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
        cancelPendingRead();
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
        reconcileUndeliverableRead();
        handlePendingUsageAccessChange();
        if (!listenerReady || !source.isUserUnlocked() || !source.hasUsageAccess()) {
            if (core.snapshot().active || core.snapshot().eventCount != 0) {
                stop("Usage access, change tracking or unlocked storage is unavailable. Inspection stopped and observations cleared.");
            }
        }
        LocalInspectionCore.Snapshot before = core.snapshot();
        LocalInspectionCore.DiagnosticReport report = core.report(now());
        if (before.generation != report.snapshot.generation || before.active != report.snapshot.active) {
            cancelPendingRead();
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
            cancelPendingRead();
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
        } else {
            // A stopped session still needs its visible OS-permission label refreshed.
            // The revision is already handled, so the observer's checkedReport cannot recurse on it.
            notifyObserver();
        }
    }

    private void failClosed(String failureMessage) {
        cancelPendingRead();
        core.pause(now());
        storageReady = false;
        mainHandler.removeCallbacks(expiry);
        message = failureMessage;
    }

    private void notifyObserver() {
        if (observer != null) observer.run();
    }
}
