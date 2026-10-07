package org.liveabit.inspect;

import java.util.concurrent.Executor;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.SynchronousQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

/** Process-owned physical occupancy. Revoking authority never releases a running OS read. */
final class ProcessReadCoordinator implements AutoCloseable {
    interface Work<T> { T read(Reservation reservation) throws Exception; }
    interface Completion<T> { void finished(Reservation reservation, T value, Throwable failure); }

    static final class Reservation {
        private volatile boolean canceled;
        private volatile boolean finished;
        private boolean dispatched;
        void cancel() { canceled = true; }
        boolean isCanceled() { return canceled; }
        boolean isFinished() { return finished; }
    }

    private final Executor executor;
    private Reservation occupied;
    private boolean closed;

    ProcessReadCoordinator() {
        this(new ThreadPoolExecutor(0, 1, 30, TimeUnit.SECONDS, new SynchronousQueue<>(), runnable -> {
            Thread worker = new Thread(runnable, "liveabit-owned-usage-read");
            worker.setDaemon(true);
            return worker;
        }, new ThreadPoolExecutor.AbortPolicy()));
    }

    // Host fixtures inject bounded dispatchers to prove rollback and delayed delivery independently.
    ProcessReadCoordinator(Executor executor) { this.executor = executor; }

    synchronized Reservation tryReserve() {
        if (closed || occupied != null) return null;
        occupied = new Reservation();
        return occupied;
    }

    synchronized boolean isBusy() { return occupied != null; }

    /** Only a reservation that has never been dispatched may be abandoned. */
    synchronized void abandonUnstarted(Reservation reservation) {
        if (reservation == null || reservation != occupied || reservation.dispatched) return;
        reservation.cancel();
        reservation.finished = true;
        occupied = null;
    }

    synchronized <T> boolean dispatch(Reservation reservation, Work<T> work, Completion<T> completion) {
        if (closed || reservation == null || reservation != occupied || reservation.dispatched) return false;
        if (reservation.isCanceled()) {
            abandonUnstarted(reservation);
            return false;
        }
        reservation.dispatched = true;
        try {
            executor.execute(() -> {
                T result = null;
                Throwable failure = null;
                try {
                    if (!reservation.isCanceled()) result = work.read(reservation);
                } catch (Throwable error) {
                    failure = error;
                } finally {
                    // The source call has actually returned/thrown. Cancellation alone never reaches here.
                    synchronized (ProcessReadCoordinator.this) {
                        reservation.finished = true;
                        if (occupied == reservation) occupied = null;
                    }
                    completion.finished(reservation, result, failure);
                }
            });
            return true;
        } catch (RejectedExecutionException error) {
            // No worker was accepted: the reserved slot may be rolled back.
            reservation.cancel();
            reservation.finished = true;
            if (occupied == reservation) occupied = null;
            return false;
        }
    }

    @Override public synchronized void close() {
        closed = true;
        // Host cleanup only; lifecycle integration never calls close. Do not interrupt or free occupancy.
        if (executor instanceof ExecutorService) ((ExecutorService) executor).shutdown();
    }
}
