package org.liveabit.inspect;

import org.liveabit.collector.core.LocalInspectionCore;
import java.lang.reflect.Field;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executor;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.BooleanSupplier;

/** Host regressions with the actual coordinator and current core; Android/lifecycle driver is modeled. */
public final class ProcessReadCoordinatorTest {
    private static final String PACKAGE = "org.liveabit.fixture";
    private static int passed;
    private static void check(boolean value, String message) { if (!value) throw new AssertionError(message); }
    private static void await(CountDownLatch latch) throws Exception { check(latch.await(3, TimeUnit.SECONDS), "bounded latch timed out"); }
    private static void until(BooleanSupplier condition) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(3);
        while (!condition.getAsBoolean() && System.nanoTime() < deadline) Thread.sleep(1);
        check(condition.getAsBoolean(), "bounded condition timed out");
    }
    private static ForegroundReadAuthority owner() { ForegroundReadAuthority authority = new ForegroundReadAuthority(); authority.resume(); return authority; }
    private interface Source { Result read(Pending pending) throws Exception; }
    private static final class Result {
        final LocalInspectionCore.SourceStatus status;
        final List<LocalInspectionCore.ProjectedEvent> events;
        Result(LocalInspectionCore.SourceStatus status, List<LocalInspectionCore.ProjectedEvent> events) { this.status = status; this.events = events; }
    }
    private static final class Pending {
        final ProcessReadCoordinator.Reservation reservation;
        final LocalInspectionCore.QueryTicket ticket;
        final ForegroundReadAuthority authority;
        final long epoch, revision;
        volatile boolean completionDeliveryRejected;
        Pending(ProcessReadCoordinator.Reservation reservation, LocalInspectionCore.QueryTicket ticket,
                ForegroundReadAuthority authority, long epoch, long revision) {
            this.reservation = reservation; this.ticket = ticket; this.authority = authority; this.epoch = epoch; this.revision = revision;
        }
    }
    private static final class Driver implements AutoCloseable {
        final LocalInspectionCore core = new LocalInspectionCore();
        final ProcessReadCoordinator coordinator;
        final AtomicLong revision = new AtomicLong();
        final ConcurrentLinkedQueue<Runnable> main = new ConcurrentLinkedQueue<>();
        final AtomicInteger calls = new AtomicInteger(), physical = new AtomicInteger(), peak = new AtomicInteger();
        long wall = 1000000, elapsed = 1000;
        int commits, staleDiscards;
        boolean rejectCompletion;
        Pending pending;
        Driver() { this(new ProcessReadCoordinator()); }
        Driver(ProcessReadCoordinator coordinator) { this.coordinator = coordinator; start(); }
        LocalInspectionCore.ClockSample now() { return new LocalInspectionCore.ClockSample(wall, elapsed); }
        void advance(long millis) { wall += millis; elapsed += millis; }
        void start() { cancel(pending); core.start(Set.of(PACKAGE), now()); }
        void stop() { cancel(pending); core.pause(now()); }
        void clear() { cancel(pending); core.clear(now()); }
        void cancel(Pending read) {
            if (read == null) return;
            read.reservation.cancel(); core.cancelQuery(read.ticket);
            if (pending == read) pending = null;
        }
        void reconcileUndeliverable() {
            if (pending != null && pending.completionDeliveryRejected) cancel(pending);
        }
        boolean permits(Pending read) {
            LocalInspectionCore.Snapshot snapshot = core.snapshot();
            return !read.reservation.isCanceled() && read.authority.matches(read.epoch) && snapshot.active
                    && snapshot.generation == read.ticket.generation && revision.get() == read.revision
                    && LocalInspectionCore.isClockContinuous(snapshot, now())
                    && elapsed - snapshot.sessionStartElapsedMillis < LocalInspectionCore.MAX_SESSION_MILLIS;
        }
        Pending inspect(ForegroundReadAuthority authority, Source source) {
            reconcileUndeliverable();
            ProcessReadCoordinator.Reservation reservation = coordinator.tryReserve();
            if (reservation == null) return null;
            LocalInspectionCore.QueryTicket ticket = core.beginQuery(now());
            if (ticket == null) { coordinator.abandonUnstarted(reservation); return null; }
            Pending read = new Pending(reservation, ticket, authority, authority.advance(), revision.get());
            pending = read;
            boolean dispatched = coordinator.dispatch(reservation, lease -> {
                calls.incrementAndGet(); int count = physical.incrementAndGet(); peak.accumulateAndGet(count, Math::max);
                try { return source.read(read); } finally { physical.decrementAndGet(); }
            }, (lease, value, error) -> {
                if (rejectCompletion) {
                    read.reservation.cancel(); read.completionDeliveryRejected = true;
                    core.cancelQuery(read.ticket);
                    return;
                }
                main.add(() -> {
                // Same pre-commit gate as the proposal: stale denied/locked results must not stop a fresh session.
                if (pending != read || !permits(read)) { cancel(read); staleDiscards++; return; }
                pending = null; commits++;
                Result result = error != null || value == null ? new Result(LocalInspectionCore.SourceStatus.UNAVAILABLE, List.of()) : value;
                if (result.status == LocalInspectionCore.SourceStatus.PERMISSION_DENIED || result.status == LocalInspectionCore.SourceStatus.DEVICE_LOCKED) core.pause(now());
                else core.finishQuery(read.ticket, now(), result.events, result.status);
                });
            });
            if (!dispatched) { cancel(read); return null; }
            return read;
        }
        void pump() { for (Runnable callback; (callback = main.poll()) != null;) callback.run(); }
        @Override public void close() { coordinator.close(); }
    }
    private static final class Blocked implements Source {
        final CountDownLatch entered = new CountDownLatch(1), release = new CountDownLatch(1);
        final LocalInspectionCore.SourceStatus status;
        final AtomicInteger ignoredInterrupts = new AtomicInteger();
        Blocked(LocalInspectionCore.SourceStatus status) { this.status = status; }
        @Override public Result read(Pending pending) {
            entered.countDown();
            for (;;) { try { if (release.await(10, TimeUnit.MILLISECONDS)) break; } catch (InterruptedException error) { ignoredInterrupts.incrementAndGet(); } }
            return new Result(status, List.of(new LocalInspectionCore.ProjectedEvent(PACKAGE, pending.ticket.startInclusive + 1, LocalInspectionCore.Type.RESUME)));
        }
        void finish(Driver driver) throws Exception { release.countDown(); until(() -> !driver.coordinator.isBusy() && !driver.main.isEmpty()); }
    }
    /** Test-only executor with a joinable thread: delivery can remain queued after real task exit. */
    private static final class JoinableExecutor implements Executor {
        private Thread worker;
        @Override public synchronized void execute(Runnable command) {
            if (worker != null && worker.isAlive()) throw new RejectedExecutionException("test worker still running");
            worker = new Thread(command, "test-read-exit"); worker.setDaemon(true); worker.start();
        }
        void awaitExit() throws Exception {
            Thread current;
            synchronized (this) { current = worker; }
            check(current != null, "test executor never dispatched");
            current.join(3000); check(!current.isAlive(), "bounded test worker join timed out");
        }
    }
    private static void recreateBlocked() throws Exception {
        try (Driver driver = new Driver()) {
            driver.advance(100); ForegroundReadAuthority original = owner(); Blocked blocked = new Blocked(LocalInspectionCore.SourceStatus.AVAILABLE);
            Pending old = driver.inspect(original, blocked); check(old != null, "first read missing"); await(blocked.entered);
            long cursor = driver.core.snapshot().queryCursorWallMillis;
            original.leave(); driver.cancel(old);
            for (int i = 0; i < 80; i++) {
                ForegroundReadAuthority recreated = owner(); driver.advance(1);
                check(driver.coordinator.isBusy(), "recreation released blocked physical occupancy");
                check(driver.inspect(recreated, read -> { throw new AssertionError("replacement read ran"); }) == null, "busy recreation admitted replacement");
                recreated.leave();
            }
            Field field = ProcessReadCoordinator.class.getDeclaredField("executor"); field.setAccessible(true);
            ThreadPoolExecutor executor = (ThreadPoolExecutor) field.get(driver.coordinator);
            check(executor.getMaximumPoolSize() == 1 && executor.getQueue().size() == 0, "physical executor escaped bound or queued replacements");
            check(driver.calls.get() == 1 && driver.peak.get() == 1 && !old.reservation.isFinished(), "logical cancellation completed an active source");
            blocked.finish(driver); driver.pump();
            check(driver.commits == 0 && driver.core.snapshot().eventCount == 0 && driver.core.snapshot().queryCursorWallMillis == cursor, "canceled source committed or moved cursor");
            check(driver.calls.get() == 1 && driver.pending == null, "drain automatically scheduled a replacement");
        } passed++;
    }
    private static void stoppedFreshSession(LocalInspectionCore.SourceStatus lateStatus, boolean clear) throws Exception {
        try (Driver driver = new Driver()) {
            driver.advance(100); Blocked blocked = new Blocked(lateStatus); Pending old = driver.inspect(owner(), blocked); await(blocked.entered);
            if (clear) driver.clear(); else driver.stop();
            driver.advance(100); driver.start(); long generation = driver.core.snapshot().generation;
            check(driver.coordinator.isBusy() && driver.inspect(owner(), read -> new Result(LocalInspectionCore.SourceStatus.AVAILABLE, List.of())) == null, "fresh Start bypassed old physical occupancy");
            blocked.finish(driver); driver.pump();
            check(driver.commits == 0 && driver.core.snapshot().active && driver.core.snapshot().generation == generation && driver.core.snapshot().eventCount == 0,
                    "late denied/locked/canceled result stopped or contaminated fresh session");
        } passed++;
    }
    private static void revisionAndEpoch(boolean revision) throws Exception {
        try (Driver driver = new Driver()) {
            driver.advance(100); ForegroundReadAuthority authority = owner(); Blocked blocked = new Blocked(LocalInspectionCore.SourceStatus.AVAILABLE);
            driver.inspect(authority, blocked); await(blocked.entered); long cursor = driver.core.snapshot().queryCursorWallMillis;
            if (revision) { driver.revision.incrementAndGet(); driver.revision.incrementAndGet(); } else authority.invalidate();
            check(driver.coordinator.isBusy(), "fence boundary released occupancy"); blocked.finish(driver); driver.pump();
            check(driver.commits == 0 && driver.core.snapshot().queryCursorWallMillis == cursor && driver.core.snapshot().eventCount == 0, "epoch/revoke-regrant fence lost");
        } passed++;
    }
    private static void clockAndExpiry(boolean expiry) throws Exception {
        try (Driver driver = new Driver()) {
            driver.advance(100); Blocked blocked = new Blocked(LocalInspectionCore.SourceStatus.AVAILABLE); driver.inspect(owner(), blocked); await(blocked.entered);
            if (expiry) driver.advance(LocalInspectionCore.MAX_SESSION_MILLIS); else driver.wall += 3600000;
            blocked.finish(driver); driver.pump();
            check(driver.commits == 0 && !driver.core.report(driver.now()).snapshot.active && driver.core.snapshot().eventCount == 0, "clock/expiry fence lost");
        } passed++;
    }
    private static void delayedCompletion() throws Exception {
        JoinableExecutor executor = new JoinableExecutor();
        try (Driver driver = new Driver(new ProcessReadCoordinator(executor))) {
            driver.advance(100); Blocked oldSource = new Blocked(LocalInspectionCore.SourceStatus.PERMISSION_DENIED);
            Pending old = driver.inspect(owner(), oldSource); await(oldSource.entered); driver.cancel(old); oldSource.finish(driver);
            executor.awaitExit();
            driver.advance(100); driver.start(); driver.advance(100); long generation = driver.core.snapshot().generation;
            Blocked newSource = new Blocked(LocalInspectionCore.SourceStatus.AVAILABLE); Pending current = driver.inspect(owner(), newSource); check(current != null, "explicit new read not admitted after old physical exit"); await(newSource.entered);
            driver.pump(); check(driver.pending == current && driver.core.snapshot().active && driver.core.snapshot().generation == generation, "delayed old callback canceled fresh work");
            newSource.finish(driver); driver.pump(); check(driver.commits == 1 && driver.core.snapshot().eventCount == 1 && driver.peak.get() == 1, "fresh explicit result missing or physical reads overlapped");
        } passed++;
    }
    private static void dispatchRejected() {
        try (Driver driver = new Driver(new ProcessReadCoordinator(command -> { throw new RejectedExecutionException("synthetic rejection"); }))) {
            driver.advance(100); long cursor = driver.core.snapshot().queryCursorWallMillis;
            check(driver.inspect(owner(), read -> { throw new AssertionError("rejected source ran"); }) == null && !driver.coordinator.isBusy()
                    && driver.calls.get() == 0 && driver.core.snapshot().queryCursorWallMillis == cursor, "pre-dispatch failure leaked occupancy or ran source");
            ProcessReadCoordinator.Reservation lease = driver.coordinator.tryReserve(); check(lease != null, "rejected dispatch lost capacity"); driver.coordinator.abandonUnstarted(lease);
        } passed++;
    }
    private static void noInterval() {
        try (Driver driver = new Driver()) {
            check(driver.inspect(owner(), read -> { throw new AssertionError("empty interval ran"); }) == null && !driver.coordinator.isBusy() && driver.calls.get() == 0,
                    "null ticket leaked reservation");
        } passed++;
    }
    private static void workerException() throws Exception {
        try (Driver driver = new Driver()) {
            driver.advance(100); long cursor = driver.core.snapshot().queryCursorWallMillis;
            check(driver.inspect(owner(), read -> { throw new IllegalStateException("synthetic OS adapter failure"); }) != null, "failure fixture not dispatched");
            until(() -> !driver.coordinator.isBusy() && !driver.main.isEmpty()); driver.pump();
            check(driver.commits == 1 && driver.core.snapshot().queryCursorWallMillis == cursor && driver.core.snapshot().eventCount == 0, "worker failure committed data or leaked capacity");
        } passed++;
    }
    private static void completionDispatchRejected() throws Exception {
        JoinableExecutor executor = new JoinableExecutor();
        try (Driver driver = new Driver(new ProcessReadCoordinator(executor))) {
            driver.advance(100); long cursor = driver.core.snapshot().queryCursorWallMillis;
            driver.rejectCompletion = true;
            Pending rejected = driver.inspect(owner(), read -> new Result(LocalInspectionCore.SourceStatus.AVAILABLE,
                    List.of(new LocalInspectionCore.ProjectedEvent(PACKAGE, read.ticket.startInclusive + 1, LocalInspectionCore.Type.RESUME))));
            check(rejected != null, "completion rejection source missing"); executor.awaitExit();
            check(rejected.completionDeliveryRejected && rejected.reservation.isCanceled() && !driver.coordinator.isBusy()
                    && driver.main.isEmpty() && driver.commits == 0 && driver.core.snapshot().eventCount == 0
                    && driver.core.snapshot().queryCursorWallMillis == cursor, "rejected completion retained or committed result");
            driver.reconcileUndeliverable(); check(driver.pending == null, "rejected completion stranded pending admission");
            driver.rejectCompletion = false; driver.advance(100);
            Pending retried = driver.inspect(owner(), read -> new Result(LocalInspectionCore.SourceStatus.AVAILABLE, List.of()));
            check(retried != null, "explicit retry after rejected completion missing"); executor.awaitExit(); driver.pump();
            check(driver.commits == 1 && driver.pending == null && driver.calls.get() == 2 && driver.peak.get() == 1,
                    "completion rejection auto-retried or failed explicit recovery");
        } passed++;
    }
    private static void completionFinishingRejectsSafely() throws Exception {
        try (ProcessReadCoordinator coordinator = new ProcessReadCoordinator()) {
            CountDownLatch completionEntered = new CountDownLatch(1), finishCompletion = new CountDownLatch(1), completionExited = new CountDownLatch(1);
            AtomicInteger calls = new AtomicInteger();
            AtomicReference<Throwable> callbackFailure = new AtomicReference<>();
            ProcessReadCoordinator.Reservation first = coordinator.tryReserve();
            check(coordinator.dispatch(first, lease -> { calls.incrementAndGet(); return "returned"; }, (lease, value, error) -> {
                completionEntered.countDown();
                try { check(finishCompletion.await(3, TimeUnit.SECONDS), "bounded completion timed out"); }
                catch (Throwable callbackError) { callbackFailure.set(callbackError); }
                finally { completionExited.countDown(); }
            }), "initial finishing-worker fixture missing");
            try {
                await(completionEntered);
                check(!coordinator.isBusy() && first.isFinished(), "finished source still counted as an OS read");
                ProcessReadCoordinator.Reservation second = coordinator.tryReserve(); check(second != null, "physical occupancy did not drain");
                check(!coordinator.dispatch(second, lease -> { calls.incrementAndGet(); return "unexpected"; }, (lease, value, error) -> { }),
                        "SynchronousQueue admitted or queued a replacement while completion worker was occupied");
                check(!coordinator.isBusy() && second.isCanceled() && second.isFinished() && calls.get() == 1,
                        "safe finishing-worker rejection leaked capacity or called source");
            } finally {
                finishCompletion.countDown(); await(completionExited);
                check(callbackFailure.get() == null, "completion fixture failed on worker: " + callbackFailure.get());
            }
        } passed++;
    }
    private static void closeWhileBlocked() throws Exception {
        Driver driver = new Driver(); driver.advance(100); Blocked blocked = new Blocked(LocalInspectionCore.SourceStatus.AVAILABLE);
        Pending pending = driver.inspect(owner(), blocked); await(blocked.entered); driver.coordinator.close();
        check(driver.coordinator.isBusy() && !pending.reservation.isFinished() && driver.coordinator.tryReserve() == null && blocked.ignoredInterrupts.get() == 0,
                "shutdown released or interrupted active physical worker");
        driver.cancel(pending); blocked.finish(driver); driver.pump(); check(driver.calls.get() == 1 && driver.commits == 0, "shutdown caused replacement or stale commit"); passed++;
    }
    private static void plainAuthorityData() {
        for (Field field : ForegroundReadAuthority.class.getDeclaredFields()) check(field.getType().isPrimitive(), "foreground authority retains UI objects");
        for (Field field : ProcessReadCoordinator.Reservation.class.getDeclaredFields()) check(field.getType().isPrimitive(), "lease retains Activity/callback"); passed++;
    }
    public static void main(String[] args) throws Exception {
        recreateBlocked();
        stoppedFreshSession(LocalInspectionCore.SourceStatus.PERMISSION_DENIED, false);
        stoppedFreshSession(LocalInspectionCore.SourceStatus.DEVICE_LOCKED, false);
        stoppedFreshSession(LocalInspectionCore.SourceStatus.AVAILABLE, true);
        revisionAndEpoch(true); revisionAndEpoch(false); clockAndExpiry(false); clockAndExpiry(true);
        delayedCompletion(); dispatchRejected(); noInterval(); workerException(); completionDispatchRejected(); completionFinishingRejectsSafely(); closeWhileBlocked(); plainAuthorityData();
        System.out.println("{\"result\":\"pass_host_read_coordinator_regressions\",\"passed\":" + passed
                + ",\"blocked_recreations\":80,\"maximum_physical_reads\":1,\"queued_replacements\":0,\"android_runtime_verified\":false}");
    }
}
