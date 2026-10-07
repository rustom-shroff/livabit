package org.liveabit.inspect;

import android.os.Handler;
import android.os.SystemClock;
import org.liveabit.collector.core.LocalInspectionCore;
import java.lang.reflect.Field;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.BooleanSupplier;

/** Executes the exact proposed Application with explicit host seams; no Android lifecycle/runtime proof. */
public final class ApplicationReadIntegrationTest {
    private static final String PACKAGE = "org.liveabit.fixture";
    private static int passed;
    private static void check(boolean value, String message) { if (!value) throw new AssertionError(message); }
    private static void until(BooleanSupplier condition) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(3);
        while (!condition.getAsBoolean() && System.nanoTime() < deadline) Thread.sleep(1);
        check(condition.getAsBoolean(), "bounded condition timed out");
    }
    private static void await(CountDownLatch latch) throws Exception { check(latch.await(3, TimeUnit.SECONDS), "bounded latch timed out"); }
    private static LocalInspectionApplication create() throws Exception {
        Handler.reset(); SystemClock.offset = 0; InspectionStore.commits = 0;
        LocalInspectionApplication app = new LocalInspectionApplication(); app.onCreate();
        check(app.storageReady && app.listenerReady && app.start(Set.of(PACKAGE)), "host application setup failed");
        until(() -> System.currentTimeMillis() > app.core.snapshot().queryCursorWallMillis);
        return app;
    }
    private static ForegroundReadAuthority owner() { ForegroundReadAuthority value = new ForegroundReadAuthority(); value.resume(); return value; }
    private static LocalInspectionApplication.PendingRead inspect(LocalInspectionApplication app, ForegroundReadAuthority authority) {
        return app.requestRead(authority, authority.advance());
    }
    private static void close(LocalInspectionApplication app) throws Exception {
        Field field = LocalInspectionApplication.class.getDeclaredField("physicalReads"); field.setAccessible(true);
        ((ProcessReadCoordinator) field.get(app)).close(); Handler.reset(); SystemClock.offset = 0;
    }
    private static final class Blocked implements AndroidUsageSource.Reader {
        final CountDownLatch entered = new CountDownLatch(1), release = new CountDownLatch(1);
        final AtomicInteger calls = new AtomicInteger();
        final LocalInspectionCore.SourceStatus status;
        Blocked(LocalInspectionCore.SourceStatus status) { this.status = status; }
        @Override public AndroidUsageSource.ReadResult read(LocalInspectionCore.QueryTicket ticket, BooleanSupplier permitted) {
            calls.incrementAndGet(); entered.countDown();
            for (;;) { try { if (release.await(10, TimeUnit.MILLISECONDS)) break; } catch (InterruptedException ignored) { } }
            return new AndroidUsageSource.ReadResult(status, List.of(new LocalInspectionCore.ProjectedEvent(PACKAGE, ticket.startInclusive, LocalInspectionCore.Type.RESUME)));
        }
        void finish(LocalInspectionApplication app) throws Exception { release.countDown(); until(() -> !app.physicalReadBusy() && Handler.hasPending()); }
    }
    private static void recreation() throws Exception {
        LocalInspectionApplication app = create(); Blocked source = new Blocked(LocalInspectionCore.SourceStatus.AVAILABLE);
        try {
            app.source.reader = source; ForegroundReadAuthority original = owner();
            AtomicInteger oldObserver = new AtomicInteger(), currentObserver = new AtomicInteger();
            Runnable oldRefresh = oldObserver::incrementAndGet, newRefresh = currentObserver::incrementAndGet;
            app.setObserver(oldRefresh);
            LocalInspectionApplication.PendingRead first = inspect(app, original); check(first != null, "first application read absent"); await(source.entered);
            original.leave(); app.cancelRead(first); app.removeObserver(oldRefresh);
            for (int i = 0; i < 80; i++) {
                ForegroundReadAuthority replacement = owner();
                check(app.physicalReadBusy() && inspect(app, replacement) == null, "Activity replacement escaped process read bound");
                replacement.leave();
            }
            app.setObserver(newRefresh); app.removeObserver(oldRefresh);
            source.finish(app); Handler.pump();
            check(source.calls.get() == 1 && app.core.snapshot().eventCount == 0 && oldObserver.get() == 0
                    && currentObserver.get() == 1 && !app.isPending(first), "stale data or old observer escaped lifecycle fence");
        } finally { source.release.countDown(); close(app); }
        passed++;
    }
    private static void freshSession(LocalInspectionCore.SourceStatus status, boolean clear) throws Exception {
        LocalInspectionApplication app = create(); Blocked source = new Blocked(status);
        try {
            app.source.reader = source; LocalInspectionApplication.PendingRead read = inspect(app, owner()); check(read != null, "fresh-session source absent"); await(source.entered);
            if (clear) app.clear(); else app.stop("host stopped");
            check(app.start(Set.of(PACKAGE)), "fresh session failed"); long generation = app.core.snapshot().generation;
            int savedBeforeLate = InspectionStore.commits;
            check(inspect(app, owner()) == null && app.physicalReadBusy(), "new session queued a replacement");
            source.finish(app); Handler.pump();
            check(app.core.snapshot().active && app.core.snapshot().generation == generation && app.core.snapshot().eventCount == 0
                    && InspectionStore.commits == savedBeforeLate, "stale permission status stopped/persisted fresh session");
        } finally { source.release.countDown(); close(app); }
        passed++;
    }
    private static void accessBoundary() throws Exception {
        LocalInspectionApplication app = create(); Blocked source = new Blocked(LocalInspectionCore.SourceStatus.PERMISSION_DENIED);
        try {
            app.source.reader = source; check(inspect(app, owner()) != null, "revision source absent"); await(source.entered);
            app.testOperations.signalChange(); app.testOperations.signalChange(); Handler.pump();
            check(!app.core.snapshot().active && app.usageAccessRevision() == 2, "access boundary not handled");
            check(app.start(Set.of(PACKAGE)), "fresh revision session failed"); long generation = app.core.snapshot().generation;
            source.finish(app); Handler.pump();
            check(app.core.snapshot().active && app.core.snapshot().generation == generation && app.core.snapshot().eventCount == 0,
                    "old access result crossed fresh revision fence");
        } finally { source.release.countDown(); close(app); }
        passed++;
    }
    private static void rejectedDelivery(boolean throwsPost) throws Exception {
        LocalInspectionApplication app = create();
        try {
            app.source.reader = (ticket, permitted) -> new AndroidUsageSource.ReadResult(LocalInspectionCore.SourceStatus.AVAILABLE,
                    List.of(new LocalInspectionCore.ProjectedEvent(PACKAGE, ticket.startInclusive, LocalInspectionCore.Type.RESUME)));
            if (throwsPost) Handler.throwPosts = true; else Handler.rejectPosts = true;
            long cursor = app.core.snapshot().queryCursorWallMillis; int stored = InspectionStore.commits;
            LocalInspectionApplication.PendingRead operation = inspect(app, owner()); check(operation != null, "rejected delivery source absent");
            until(() -> operation.completionDeliveryRejected);
            check(!app.physicalReadBusy() && !app.isPending(operation) && !Handler.hasPending() && app.core.snapshot().eventCount == 0
                    && app.core.snapshot().queryCursorWallMillis == cursor && stored == InspectionStore.commits,
                    "completion rejection committed/stored data or stranded occupancy");
            Handler.throwPosts = false; Handler.rejectPosts = false;
            app.checkedReport();
            check(app.message.contains("could not reach this screen") && app.core.beginQuery(LocalInspectionApplication.now()) != null,
                    "main reconciliation failed to drop rejected ticket");
        } finally { close(app); }
        passed++;
    }
    private static void clockBoundary() throws Exception {
        LocalInspectionApplication app = create(); Blocked source = new Blocked(LocalInspectionCore.SourceStatus.AVAILABLE);
        try {
            app.source.reader = source; check(inspect(app, owner()) != null, "clock source absent"); await(source.entered);
            SystemClock.offset = 3600000; source.finish(app); Handler.pump();
            check(app.core.snapshot().eventCount == 0 && !app.checkedReport().snapshot.active, "clock-unsafe result committed");
        } finally { source.release.countDown(); close(app); }
        passed++;
    }
    public static void main(String[] args) throws Exception {
        recreation(); freshSession(LocalInspectionCore.SourceStatus.PERMISSION_DENIED, false);
        freshSession(LocalInspectionCore.SourceStatus.DEVICE_LOCKED, false); freshSession(LocalInspectionCore.SourceStatus.AVAILABLE, true);
        accessBoundary(); rejectedDelivery(false); rejectedDelivery(true); clockBoundary();
        System.out.println("{\"result\":\"pass_exact_application_with_host_seams\",\"passed\":" + passed
                + ",\"blocked_recreations\":80,\"android_runtime_verified\":false,\"sqlite_verified\":false}");
    }
}
