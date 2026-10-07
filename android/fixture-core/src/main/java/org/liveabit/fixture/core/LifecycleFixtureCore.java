package org.liveabit.fixture.core;

import java.util.ArrayList;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Set;

/** Independent ledger for this authored fixture's callbacks, never an Android coverage attestation. */
public final class LifecycleFixtureCore {
    public static final int MAX_RECORDS = 128;
    public static final long MAX_RUN_MILLIS = 10L * 60 * 1000;
    public static final long CLOCK_TOLERANCE_MILLIS = 2000;
    private static final long MAX_WALL_MILLIS = 253402300799999L;

    public enum State { IDLE, ACTIVE, FINISHED, INVALID }
    public enum Type { RESUME, PAUSE }
    public enum Reason {
        EMPTY, RUNNING, FINISHED, CLEARED,
        INVALID_SAMPLE, CALLER_NOT_RESUMED, DUPLICATE_RESUME, UNMATCHED_PAUSE,
        RECORD_LIMIT, RUN_EXPIRED, CLOCK_DISCONTINUITY
    }

    /** Raw paired clock sample. The ledger validates it before recording or reporting a run. */
    public static final class Sample {
        public final long wallMillis;
        public final long elapsedMillis;
        public Sample(long wallMillis, long elapsedMillis) {
            this.wallMillis = wallMillis;
            this.elapsedMillis = elapsedMillis;
        }
    }

    /** No Activity token or identity is retained in a record. */
    public static final class Record {
        public final Type type;
        public final long wallMillis;
        public final long elapsedMillis;
        private Record(Type type, Sample now) {
            this.type = type;
            wallMillis = now.wallMillis;
            elapsedMillis = now.elapsedMillis;
        }
    }

    public static final class Report {
        public final State state;
        public final Reason reason;
        public final Long beginWallMillis;
        public final Long beginElapsedMillis;
        public final Long finishWallMillis;
        public final Long finishElapsedMillis;
        /** Active values are provisional; only a finished valid window is a comparison value. */
        public final Long unionDurationMillis;
        public final boolean comparisonAvailable;
        public final boolean collectorCoverageAttested = false;
        public final boolean physicalAndroidVerified = false;
        public final int callbackCount;
        public final List<Record> records;
        private Report(LifecycleFixtureCore core, Sample now) {
            state = core.state;
            reason = core.reason;
            boolean hasWindow = state == State.ACTIVE || state == State.FINISHED;
            beginWallMillis = hasWindow ? core.begin.wallMillis : null;
            beginElapsedMillis = hasWindow ? core.begin.elapsedMillis : null;
            finishWallMillis = state == State.FINISHED ? core.finish.wallMillis : null;
            finishElapsedMillis = state == State.FINISHED ? core.finish.elapsedMillis : null;
            comparisonAvailable = state == State.FINISHED;
            unionDurationMillis = hasWindow ? core.unionMillis
                + (state == State.ACTIVE && core.unionOpening >= 0
                    ? now.elapsedMillis - core.unionOpening : 0) : null;
            records = Collections.unmodifiableList(new ArrayList<>(core.records));
            callbackCount = records.size();
        }
    }

    // Tokens identify only our own resumed callbacks, by reference equality, and remain in RAM.
    private final Set<Object> resumed = Collections.newSetFromMap(new IdentityHashMap<>());
    private final List<Record> records = new ArrayList<>();
    private State state = State.IDLE;
    private Reason reason = Reason.EMPTY;
    private Sample begin;
    private Sample finish;
    private Sample last;
    private long unionMillis;
    private long unionOpening = -1;

    /** Call from the owned Activity's onResume; no class or other-app metadata is accepted. */
    public synchronized Report resume(Object token, Sample now) {
        if (!valid(now) || token == null) return invalidate(Reason.INVALID_SAMPLE, now);
        if (resumed.contains(token)) return invalidate(Reason.DUPLICATE_RESUME, now);
        boolean wasEmpty = resumed.isEmpty();
        if (resumed.size() >= MAX_RECORDS) return invalidate(Reason.RECORD_LIMIT, now);
        resumed.add(token);
        if ((state == State.ACTIVE || state == State.FINISHED) && !maintain(now)) return snapshot(now);
        if (state == State.ACTIVE) {
            if (!room()) return invalidate(Reason.RECORD_LIMIT, now);
            records.add(new Record(Type.RESUME, now));
            if (wasEmpty) unionOpening = now.elapsedMillis;
        }
        return snapshot(now);
    }

    /** Call from the owned Activity's onPause; true gaps are preserved. */
    public synchronized Report pause(Object token, Sample now) {
        if (!valid(now) || token == null) return invalidate(Reason.INVALID_SAMPLE, now);
        if (!resumed.remove(token)) return invalidate(Reason.UNMATCHED_PAUSE, now);
        if ((state == State.ACTIVE || state == State.FINISHED) && !maintain(now)) return snapshot(now);
        if (state == State.ACTIVE) {
            if (!room()) return invalidate(Reason.RECORD_LIMIT, now);
            records.add(new Record(Type.PAUSE, now));
            if (resumed.isEmpty()) {
                unionMillis += now.elapsedMillis - unionOpening;
                unionOpening = -1;
            }
        }
        return snapshot(now);
    }

    /** Fresh interior marker: the caller must be one of our known resumed Activity tokens. */
    public synchronized Report begin(Object currentResumedToken, Sample now) {
        if (!valid(now)) return invalidate(Reason.INVALID_SAMPLE, now);
        if (currentResumedToken == null || !resumed.contains(currentResumedToken))
            return invalidate(Reason.CALLER_NOT_RESUMED, now);
        eraseWindow();
        state = State.ACTIVE;
        reason = Reason.RUNNING;
        begin = last = now;
        unionOpening = now.elapsedMillis;
        return snapshot(now);
    }

    /** Closes at our known owned state, not at an inferred usage-history query boundary. */
    public synchronized Report finish(Object currentResumedToken, Sample now) {
        if (!valid(now)) return invalidate(Reason.INVALID_SAMPLE, now);
        if (currentResumedToken == null || !resumed.contains(currentResumedToken))
            return invalidate(Reason.CALLER_NOT_RESUMED, now);
        if (state == State.FINISHED) maintain(now);
        if (state != State.ACTIVE) return snapshot(now);
        if (!maintain(now)) return snapshot(now);
        unionMillis += now.elapsedMillis - unionOpening;
        unionOpening = -1;
        finish = now;
        state = State.FINISHED;
        reason = Reason.FINISHED;
        return snapshot(now);
    }

    /** Clear erases every measurement; current own callback state is not a retained trace. */
    public synchronized Report clear(Sample now) {
        eraseWindow();
        state = State.IDLE;
        reason = Reason.CLEARED;
        if (!valid(now)) return invalidate(Reason.INVALID_SAMPLE, now);
        return snapshot(now);
    }

    /** Reads sample clocks but never schedules a background timer. */
    public synchronized Report report(Sample now) {
        if (!valid(now)) return invalidate(Reason.INVALID_SAMPLE, now);
        if (state == State.ACTIVE || state == State.FINISHED) maintain(now);
        return snapshot(now);
    }

    private boolean maintain(Sample now) {
        long wallDelta = now.wallMillis - last.wallMillis;
        long elapsedDelta = now.elapsedMillis - last.elapsedMillis;
        long wholeWallDelta = now.wallMillis - begin.wallMillis;
        long wholeElapsedDelta = now.elapsedMillis - begin.elapsedMillis;
        if (wallDelta < 0 || elapsedDelta < 0
                || differenceExceeds(wallDelta, elapsedDelta, CLOCK_TOLERANCE_MILLIS)
                || differenceExceeds(wholeWallDelta, wholeElapsedDelta, CLOCK_TOLERANCE_MILLIS)) {
            invalidate(Reason.CLOCK_DISCONTINUITY, now);
            return false;
        }
        if (state == State.ACTIVE
                && (wholeElapsedDelta >= MAX_RUN_MILLIS || wholeWallDelta >= MAX_RUN_MILLIS)) {
            invalidate(Reason.RUN_EXPIRED, now);
            return false;
        }
        last = now;
        return true;
    }

    private boolean room() { return records.size() < MAX_RECORDS; }
    private Report invalidate(Reason nextReason, Sample now) {
        eraseWindow();
        state = State.INVALID;
        reason = nextReason;
        return snapshot(now);
    }
    private void eraseWindow() {
        records.clear();
        begin = finish = last = null;
        unionMillis = 0;
        unionOpening = -1;
    }
    private Report snapshot(Sample now) { return new Report(this, now); }
    private static boolean valid(Sample value) {
        return value != null && value.wallMillis >= 0 && value.wallMillis <= MAX_WALL_MILLIS
            && value.elapsedMillis >= 0;
    }
    private static boolean differenceExceeds(long left, long right, long limit) {
        // Called only after ruling out negative deltas; subtraction cannot overflow.
        return left >= right ? left - right > limit : right - left > limit;
    }
}
