package org.liveabit.collector.core;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;

/**
 * Pure comparison of retained diagnostic intervals with manually entered owned-fixture values.
 * Callers must supply a fresh checked report; this performs no query or state mutation.
 * A candidate is still unverified and never attests source completeness or fixture authenticity.
 */
public final class FixtureComparison {
    public static final String FIXTURE_PACKAGE = "org.liveabit.fixture";
    public static final long MAX_WINDOW_MILLIS = 10L * 60 * 1000;

    public enum Status { KNOWN_ESTIMATE, UNKNOWN, INVALID }
    public enum Reason {
        INVALID_REPORT, INACTIVE_SESSION, FIXTURE_NOT_SELECTED, INVALID_WINDOW,
        WINDOW_TOO_LONG, WINDOW_OUTSIDE_SESSION, WINDOW_NOT_QUERIED,
        INVALID_FIXTURE_DURATION, NO_CLOSED_ESTIMATE, COMPARISON_AVAILABLE
    }

    public static final class Result {
        public final Status status;
        public final Reason reason;
        public final boolean accepted;
        /** null means unknown or invalid, never evidence of zero use. */
        public final Long candidateDurationMillis;
        /** Candidate minus the manually entered value; null when the candidate is unknown. */
        public final Long signedDifferenceMillis;
        /** Validated manual input for accepted results; unused zero for invalid input. */
        public final long fixtureDurationMillis;
        public final int overlappingClosedIntervals;
        public final List<String> ambiguityReasons;
        public final boolean coverageUnknown = true;
        public final boolean physicalAndroidVerified = false;
        public final boolean oapSummaryEligible = false;
        public final boolean fixtureValueVerified = false;

        private Result(Status status, Reason reason, Long candidate, long fixtureDuration,
                int count, List<String> ambiguityReasons) {
            this.status = status;
            this.reason = reason;
            accepted = status != Status.INVALID;
            candidateDurationMillis = candidate;
            signedDifferenceMillis = candidate == null ? null : candidate - fixtureDuration;
            fixtureDurationMillis = fixtureDuration;
            overlappingClosedIntervals = count;
            this.ambiguityReasons = Collections.unmodifiableList(new ArrayList<>(ambiguityReasons));
        }
    }

    private FixtureComparison() { }

    public static Result compare(LocalInspectionCore.DiagnosticReport report,
            long startInclusive, long endExclusive, long fixtureDurationMillis) {
        if (report == null) return invalid(Reason.INVALID_REPORT);
        LocalInspectionCore.Snapshot snapshot = report.snapshot;
        if (!snapshot.active) return invalid(Reason.INACTIVE_SESSION);
        if (!snapshot.selectedPackages.contains(FIXTURE_PACKAGE)) return invalid(Reason.FIXTURE_NOT_SELECTED);
        if (startInclusive < 0 || endExclusive <= startInclusive) return invalid(Reason.INVALID_WINDOW);
        // Nonnegative ordered endpoints make subtraction safe even for rejected long inputs.
        long span = endExclusive - startInclusive;
        if (span > MAX_WINDOW_MILLIS) return invalid(Reason.WINDOW_TOO_LONG);
        if (startInclusive < snapshot.sessionStartWallMillis) return invalid(Reason.WINDOW_OUTSIDE_SESSION);
        if (endExclusive > snapshot.queryCursorWallMillis) return invalid(Reason.WINDOW_NOT_QUERIED);
        if (fixtureDurationMillis < 0
                || fixtureDurationMillis > span + LocalInspectionCore.CLOCK_TOLERANCE_MILLIS)
            return invalid(Reason.INVALID_FIXTURE_DURATION);

        LocalInspectionCore.PackageDiagnostic fixture = null;
        for (LocalInspectionCore.PackageDiagnostic item : report.packages) {
            if (FIXTURE_PACKAGE.equals(item.packageName)) {
                fixture = item;
                break;
            }
        }
        if (fixture == null) return invalid(Reason.INVALID_REPORT);

        List<long[]> clipped = new ArrayList<>();
        for (LocalInspectionCore.ClosedEstimate interval : fixture.closedEstimates) {
            long start = Math.max(startInclusive, interval.startInclusive);
            long end = Math.min(endExclusive, interval.endExclusive);
            if (start < end) clipped.add(new long[] { start, end });
        }
        if (clipped.isEmpty()) return new Result(Status.UNKNOWN, Reason.NO_CLOSED_ESTIMATE,
                null, fixtureDurationMillis, 0, fixture.ambiguityReasons);

        clipped.sort(Comparator.comparingLong((long[] interval) -> interval[0])
                .thenComparingLong(interval -> interval[1]));
        long total = 0;
        long unionStart = clipped.get(0)[0];
        long unionEnd = clipped.get(0)[1];
        for (int index = 1; index < clipped.size(); index++) {
            long[] interval = clipped.get(index);
            if (interval[0] <= unionEnd) {
                unionEnd = Math.max(unionEnd, interval[1]);
            } else {
                total += unionEnd - unionStart;
                unionStart = interval[0];
                unionEnd = interval[1];
            }
        }
        total += unionEnd - unionStart;
        return new Result(Status.KNOWN_ESTIMATE, Reason.COMPARISON_AVAILABLE,
                total, fixtureDurationMillis, clipped.size(), fixture.ambiguityReasons);
    }

    private static Result invalid(Reason reason) {
        return new Result(Status.INVALID, reason, null, 0, 0, Collections.emptyList());
    }
}
