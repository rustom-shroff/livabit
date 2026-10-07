package org.liveabit.collector.core;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.liveabit.collector.core.LocalInspectionCore.ClockSample;
import org.liveabit.collector.core.LocalInspectionCore.CommitResult;
import org.liveabit.collector.core.LocalInspectionCore.DiagnosticReport;
import org.liveabit.collector.core.LocalInspectionCore.PackageDiagnostic;
import org.liveabit.collector.core.LocalInspectionCore.ProjectedEvent;
import org.liveabit.collector.core.LocalInspectionCore.QueryTicket;
import org.liveabit.collector.core.LocalInspectionCore.SourceStatus;
import org.liveabit.collector.core.LocalInspectionCore.Type;

/** Dependency-free JVM checks. Passing these does not verify an Android device. */
public final class LocalInspectionCoreTest {
    private static final String APP = "com.example.fixture";
    private static final long WALL = 100_000;
    private static final long ELAPSED = 10_000;
    private static int passed;

    public static void main(String[] args) {
        run("exact scope and half-open consent/query boundaries", LocalInspectionCoreTest::scopeBoundaries);
        run("empty query stays unknown rather than zero", LocalInspectionCoreTest::emptyUnknown);
        run("balanced transitions are diagnostic only", LocalInspectionCoreTest::balancedDiagnostic);
        run("unmatched pause invalidates preceding estimates", LocalInspectionCoreTest::unmatchedPause);
        run("same timestamp ambiguity is order independent", LocalInspectionCoreTest::sameTimestamp);
        run("open and overlapping sequences remain labelled", LocalInspectionCoreTest::overlapOpen);
        run("frequent internal transitions retain real gaps", LocalInspectionCoreTest::fragmentedTransitions);
        run("fragmented transitions cross manual queries without invented boundaries", LocalInspectionCoreTest::fragmentedQueries);
        run("same-millisecond internal handoffs remain ambiguous", LocalInspectionCoreTest::sameTimestampHandoff);
        run("balanced package overlap counts union once and retains uncertainty", LocalInspectionCoreTest::balancedOverlap);
        run("stop clears RAM and invalidates in-flight result", LocalInspectionCoreTest::stopFence);
        run("selection changes start a fresh scope", LocalInspectionCoreTest::selectionFence);
        run("restart restores preferences only, stopped", LocalInspectionCoreTest::restartStopped);
        run("clock jumps and elapsed reversal stop and erase", LocalInspectionCoreTest::clockSafety);
        run("gradual wall-clock skew cannot accumulate beyond the session tolerance", LocalInspectionCoreTest::cumulativeClockSkew);
        run("whole-session clock tolerance includes exactly two seconds", LocalInspectionCoreTest::clockToleranceBoundary);
        run("snapshot clock fence is pure and cannot authorize an inactive session", LocalInspectionCoreTest::clockFencePure);
        run("24-hour session expiry erases activity", LocalInspectionCoreTest::expiry);
        run("unavailable query can retry without inventing coverage", LocalInspectionCoreTest::unavailableRetry);
        run("permission loss, device lock and truncation erase activity", LocalInspectionCoreTest::sourceStops);
        run("invalid projected records fail atomically", LocalInspectionCoreTest::atomicValidation);
        run("bounded session and query prevent partial commits", LocalInspectionCoreTest::boundedEvents);
        run("cancelled and foreign tickets cannot commit", LocalInspectionCoreTest::ticketIdentity);
        run("typed package preferences and snapshots are bounded immutable", LocalInspectionCoreTest::preferences);
        run("generation exhaustion is fail-closed", LocalInspectionCoreTest::generationExhaustion);
        run("recent inspection exposes bounded projected fields only", LocalInspectionCoreTest::recentProjection);
        run("fixture comparison clips only closed intervals and preserves gaps", LocalInspectionCoreTest::comparisonClipping);
        run("fixture comparison remains unknown for absent or open evidence", LocalInspectionCoreTest::comparisonUnknown);
        run("fixture comparison rejects inactive or nonfixture scope", LocalInspectionCoreTest::comparisonScope);
        run("fixture comparison rejects unauthorized or unqueried windows", LocalInspectionCoreTest::comparisonHorizon);
        run("fixture comparison validates bounded windows and manual expectations", LocalInspectionCoreTest::comparisonInputs);
        run("fixture comparison preserves overlap and conflict uncertainty", LocalInspectionCoreTest::comparisonAmbiguity);
        run("fixture comparison is pure and result warnings are immutable", LocalInspectionCoreTest::comparisonPure);
        System.out.println("Native local inspection core: " + passed + " checks passed; Android runtime/device behavior unverified.");
    }

    private static void scopeBoundaries() {
        LocalInspectionCore core = started();
        QueryTicket ticket = core.beginQuery(at(100));
        CommitResult result = core.finishQuery(ticket, at(110), Arrays.asList(
            event(APP, -1, Type.RESUME), event(APP, 0, Type.RESUME),
            event(APP, 50, Type.PAUSE), event(APP, 100, Type.RESUME),
            new ProjectedEvent("com.denied.private", Long.MIN_VALUE, null),
            new ProjectedEvent(null, Long.MIN_VALUE, null)), SourceStatus.AVAILABLE);
        check(result.accepted && result.acceptedEvents == 2, "Only scope and [start,end) records accepted");
        PackageDiagnostic report = core.report(at(120)).packages.get(0);
        check(report.closedEstimates.size() == 1 && report.estimatedDurationMillis == 50L, "Boundary estimate");
        QueryTicket next = core.beginQuery(at(200));
        check(next.startInclusive == WALL + 100, "Successful query cursor");
        check(core.finishQuery(next, at(210), Arrays.asList(event(APP, 100, Type.RESUME), event(APP, 150, Type.PAUSE)), SourceStatus.AVAILABLE).acceptedEvents == 2, "End event enters next query only");
    }

    private static void emptyUnknown() {
        LocalInspectionCore core = started();
        commit(core, 100, Collections.emptyList());
        DiagnosticReport report = core.report(at(110));
        check(report.coverageUnknown && !report.physicalAndroidVerified && !report.oapSummaryEligible, "No fabricated proof");
        check(report.packages.get(0).estimatedDurationMillis == null, "Unknown duration is null");
        check(report.packages.get(0).ambiguityReasons.contains("no_records_usage_unknown"), "Empty explanation");
    }

    private static void balancedDiagnostic() {
        LocalInspectionCore core = started();
        commit(core, 100, Arrays.asList(event(APP, 10, Type.RESUME), event(APP, 40, Type.PAUSE), event(APP, 50, Type.RESUME), event(APP, 80, Type.PAUSE)));
        DiagnosticReport report = core.report(at(110));
        check(report.packages.get(0).closedEstimates.size() == 2 && report.packages.get(0).estimatedDurationMillis == 60L, "Closed diagnostic durations");
        check(report.coverageUnknown && report.packages.get(0).ambiguityReasons.contains("unverified_source_continuity"), "Balanced is not complete");
    }

    private static void unmatchedPause() {
        LocalInspectionCore core = started();
        commit(core, 100, Arrays.asList(event(APP, 10, Type.RESUME), event(APP, 20, Type.PAUSE), event(APP, 50, Type.PAUSE)));
        PackageDiagnostic report = core.report(at(110)).packages.get(0);
        check(report.closedEstimates.isEmpty() && report.estimatedDurationMillis == null, "Missing start can invalidate previous phases");
        check(report.ambiguityReasons.contains("unmatched_pause_invalidates_prior_estimates"), "Reason retained");
    }

    private static void sameTimestamp() {
        for (List<ProjectedEvent> points : Arrays.asList(
                Arrays.asList(event(APP, 50, Type.RESUME), event(APP, 50, Type.PAUSE)),
                Arrays.asList(event(APP, 50, Type.PAUSE), event(APP, 50, Type.RESUME)))) {
            LocalInspectionCore core = started();
            List<ProjectedEvent> records = new ArrayList<>(Arrays.asList(event(APP, 10, Type.RESUME), event(APP, 20, Type.PAUSE)));
            records.addAll(points);
            commit(core, 100, records);
            PackageDiagnostic report = core.report(at(110)).packages.get(0);
            check(report.closedEstimates.isEmpty() && report.ambiguityReasons.contains("ambiguous_same_timestamp_transitions"), "No order guess");
        }
    }

    private static void overlapOpen() {
        LocalInspectionCore core = started();
        commit(core, 100, Arrays.asList(event(APP, 10, Type.RESUME), event(APP, 20, Type.RESUME), event(APP, 40, Type.PAUSE)));
        PackageDiagnostic report = core.report(at(110)).packages.get(0);
        check(report.estimatedDurationMillis == null, "Open sequence cannot close");
        check(report.ambiguityReasons.contains("package_level_overlap_or_missing_pause") && report.ambiguityReasons.contains("open_transition_sequence"), "Ambiguity explicit");
    }

    private static List<ProjectedEvent> fragmented(String app) {
        return Arrays.asList(event(app, 10, Type.RESUME), event(app, 30, Type.PAUSE),
            event(app, 31, Type.RESUME), event(app, 50, Type.PAUSE),
            event(app, 52, Type.RESUME), event(app, 80, Type.PAUSE));
    }

    private static void fragmentedTransitions() {
        LocalInspectionCore core = started();
        commit(core, 100, fragmented(APP));
        DiagnosticReport report = core.report(at(110));
        PackageDiagnostic item = report.packages.get(0);
        check(item.closedEstimates.size() == 3 && item.estimatedDurationMillis == 67L,
            "Internal transitions keep three estimates and exclude 1ms and 2ms pauses");
        check(item.closedEstimates.get(0).endExclusive == WALL + 30
            && item.closedEstimates.get(1).startInclusive == WALL + 31
            && item.closedEstimates.get(2).startInclusive == WALL + 52, "No debounce fills genuine gaps");
        check(report.coverageUnknown && !report.physicalAndroidVerified && !report.oapSummaryEligible,
            "Frequent paired records are not a continuous or verified visit");
    }

    private static void fragmentedQueries() {
        LocalInspectionCore core = started();
        List<ProjectedEvent> points = fragmented(APP);
        commit(core, 40, points.subList(0, 3));
        PackageDiagnostic first = core.report(at(42)).packages.get(0);
        check(first.closedEstimates.size() == 1 && first.estimatedDurationMillis == 20L
            && first.ambiguityReasons.contains("open_transition_sequence"), "Query end does not close resumed interval");
        commit(core, 60, points.subList(3, 5));
        PackageDiagnostic second = core.report(at(62)).packages.get(0);
        check(second.closedEstimates.size() == 2 && second.estimatedDurationMillis == 39L,
            "Only returned pauses close previously retained starts");
        commit(core, 100, points.subList(5, 6));
        PackageDiagnostic complete = core.report(at(110)).packages.get(0);
        check(complete.closedEstimates.size() == 3 && complete.estimatedDurationMillis == 67L,
            "Partitioned manual reads preserve same total and gaps");
    }

    private static void sameTimestampHandoff() {
        for (List<ProjectedEvent> handoff : Arrays.asList(
                Arrays.asList(event(APP, 30, Type.PAUSE), event(APP, 30, Type.RESUME)),
                Arrays.asList(event(APP, 30, Type.RESUME), event(APP, 30, Type.PAUSE)))) {
            LocalInspectionCore core = started();
            List<ProjectedEvent> points = new ArrayList<>();
            points.add(event(APP, 10, Type.RESUME));
            points.addAll(handoff);
            points.add(event(APP, 50, Type.PAUSE));
            commit(core, 100, points);
            PackageDiagnostic item = core.report(at(110)).packages.get(0);
            check(item.estimatedDurationMillis == null && item.closedEstimates.isEmpty(),
                "Same-millisecond handoff cannot establish continuous time in either order");
            check(item.ambiguityReasons.contains("ambiguous_same_timestamp_transitions"),
                "Activity identity/order uncertainty is retained");
        }
    }

    private static void balancedOverlap() {
        LocalInspectionCore core = started();
        commit(core, 100, Arrays.asList(event(APP, 10, Type.RESUME), event(APP, 20, Type.RESUME),
            event(APP, 30, Type.PAUSE), event(APP, 40, Type.PAUSE)));
        DiagnosticReport report = core.report(at(110));
        PackageDiagnostic item = report.packages.get(0);
        check(item.closedEstimates.size() == 1 && item.estimatedDurationMillis == 30L,
            "Balanced same-package overlap is a single candidate union, not two summed activity durations");
        check(item.ambiguityReasons.contains("package_level_overlap_or_missing_pause")
            && report.coverageUnknown && !report.oapSummaryEligible, "Balance does not prove activity matching");
    }

    private static void stopFence() {
        LocalInspectionCore core = started();
        commit(core, 100, Arrays.asList(event(APP, 10, Type.RESUME), event(APP, 20, Type.PAUSE)));
        QueryTicket ticket = core.beginQuery(at(200));
        long generation = core.snapshot().generation;
        core.pause(at(210));
        check(!core.snapshot().active && core.snapshot().eventCount == 0 && core.snapshot().generation > generation, "Pause erases and increments fence");
        check(!core.finishQuery(ticket, at(220), Arrays.asList(event(APP, 150, Type.RESUME)), SourceStatus.AVAILABLE).accepted, "Old read denied");
    }

    private static void selectionFence() {
        LocalInspectionCore core = started();
        QueryTicket old = core.beginQuery(at(100));
        core.start(set("com.other.selected"), at(110));
        check(!core.finishQuery(old, at(120), Arrays.asList(event(APP, 30, Type.RESUME)), SourceStatus.AVAILABLE).accepted, "Old selection rejected");
        QueryTicket next = core.beginQuery(at(200));
        check(next.startInclusive == WALL + 110 && next.selectedPackages.equals(Arrays.asList("com.other.selected")), "Fresh selection time");
    }

    private static void restartStopped() {
        LocalInspectionCore core = started();
        commit(core, 100, Arrays.asList(event(APP, 10, Type.RESUME), event(APP, 20, Type.PAUSE)));
        long prior = core.snapshot().generation;
        core.restart(prior, set(APP), at(110));
        check(!core.snapshot().active && core.snapshot().eventCount == 0 && core.snapshot().generation == prior + 1, "Restart stopped with no activity");
        check(core.beginQuery(at(200)) == null && core.snapshot().selectedPackages.equals(Arrays.asList(APP)), "Preferences only");
    }

    private static void clockSafety() {
        for (ClockSample bad : Arrays.asList(new ClockSample(WALL + 100_000, ELAPSED + 200), new ClockSample(WALL + 200, ELAPSED - 1), new ClockSample(WALL - 1, ELAPSED + 200))) {
            LocalInspectionCore core = started();
            commit(core, 100, Arrays.asList(event(APP, 10, Type.RESUME), event(APP, 20, Type.PAUSE)));
            check(core.beginQuery(bad) == null && !core.snapshot().active && core.snapshot().eventCount == 0, "Clock discontinuity erases");
        }
    }

    private static void cumulativeClockSkew() {
        for (boolean wallAhead : Arrays.asList(true, false)) {
            LocalInspectionCore core = started();
            commit(core, 100, Arrays.asList(event(APP, 10, Type.RESUME), event(APP, 20, Type.PAUSE)));
            ClockSample first = skewed(1, wallAhead);
            ClockSample second = skewed(2, wallAhead);
            ClockSample third = skewed(3, wallAhead);
            check(core.report(first).snapshot.active && core.report(second).snapshot.active,
                "One-second incremental adjustments through the exact total boundary remain diagnostic");
            QueryTicket pending = core.beginQuery(new ClockSample(second.wallMillis + 1, second.elapsedMillis + 1));
            check(pending != null, "A query inside the drift boundary can begin");
            LocalInspectionCore.Snapshot before = core.snapshot();
            check(!LocalInspectionCore.isClockContinuous(before, third),
                "The read predicate detects accumulated drift before ingesting its result");
            CommitResult rejected = core.finishQuery(pending, third, Collections.emptyList(), SourceStatus.AVAILABLE);
            check(!rejected.accepted && !rejected.snapshot.active && rejected.snapshot.eventCount == 0
                    && rejected.snapshot.generation == before.generation + 1
                    && rejected.reason.equals("clock_discontinuity_requires_explicit_start"),
                "Accumulated positive or negative skew invalidates the query and erases prior observations");
            check(core.beginQuery(new ClockSample(third.wallMillis + 1, third.elapsedMillis + 1)) == null,
                "A failed clock fence does not resume inspection");
            core.start(set(APP), third);
            DiagnosticReport fresh = core.report(new ClockSample(third.wallMillis + 100, third.elapsedMillis + 100));
            check(fresh.snapshot.active && fresh.snapshot.eventCount == 0
                    && fresh.packages.get(0).estimatedDurationMillis == null,
                "Only a fresh explicit Start establishes new clock anchors without old activity");
        }
    }

    private static ClockSample skewed(int step, boolean wallAhead) {
        return new ClockSample(WALL + step * (wallAhead ? 2000L : 1000L),
            ELAPSED + step * (wallAhead ? 1000L : 2000L));
    }

    private static void clockToleranceBoundary() {
        for (boolean wallAhead : Arrays.asList(true, false)) {
            LocalInspectionCore core = started();
            commit(core, 100, Arrays.asList(event(APP, 10, Type.RESUME), event(APP, 20, Type.PAUSE)));
            ClockSample boundary = new ClockSample(WALL + (wallAhead ? 3000L : 1000L),
                ELAPSED + (wallAhead ? 1000L : 3000L));
            check(LocalInspectionCore.isClockContinuous(core.snapshot(), boundary),
                "Exactly 2000ms of whole-session drift is within the existing tolerance");
            QueryTicket ticket = core.beginQuery(boundary);
            check(ticket != null && core.finishQuery(ticket,
                new ClockSample(boundary.wallMillis + 1, boundary.elapsedMillis + 1),
                Collections.emptyList(), SourceStatus.AVAILABLE).accepted,
                "The exact boundary can query and commit without erasing retained diagnostics");
            ClockSample outside = new ClockSample(boundary.wallMillis + (wallAhead ? 3 : 2),
                boundary.elapsedMillis + (wallAhead ? 2 : 3));
            check(!LocalInspectionCore.isClockContinuous(core.snapshot(), outside),
                "One millisecond beyond the total boundary fails even when the latest step is tiny");
            DiagnosticReport stopped = core.report(outside);
            check(!stopped.snapshot.active && stopped.snapshot.eventCount == 0
                    && stopped.packages.get(0).estimatedDurationMillis == null,
                "Report reads also stop and erase at the accumulated boundary");
        }
    }

    private static void clockFencePure() {
        LocalInspectionCore core = started();
        commit(core, 100, Arrays.asList(event(APP, 10, Type.RESUME), event(APP, 20, Type.PAUSE)));
        QueryTicket pending = core.beginQuery(at(200));
        LocalInspectionCore.Snapshot before = core.snapshot();
        check(LocalInspectionCore.isClockContinuous(before, at(250))
                && !LocalInspectionCore.isClockContinuous(before, at(199))
                && !LocalInspectionCore.isClockContinuous(null, at(250))
                && !LocalInspectionCore.isClockContinuous(before, null),
            "Pure clock fence accepts a continuous sample and fails closed on unavailable or reversed samples");
        LocalInspectionCore.Snapshot after = core.snapshot();
        check(before.generation == after.generation && before.active == after.active
                && before.lastWallMillis == after.lastWallMillis && before.lastElapsedMillis == after.lastElapsedMillis
                && before.queryCursorWallMillis == after.queryCursorWallMillis && before.eventCount == after.eventCount,
            "Reading the timing fence does not mutate the state or clock anchors");
        check(core.finishQuery(pending, at(260), Collections.emptyList(), SourceStatus.AVAILABLE).accepted,
            "The timing fence cannot cancel an otherwise current query ticket");
        core.pause(at(270));
        check(!LocalInspectionCore.isClockContinuous(core.snapshot(), at(280)),
            "A continuous clock cannot grant authority to an inactive session");
    }

    private static void expiry() {
        LocalInspectionCore core = started();
        commit(core, 100, Arrays.asList(event(APP, 10, Type.RESUME), event(APP, 20, Type.PAUSE)));
        check(core.beginQuery(at(LocalInspectionCore.MAX_SESSION_MILLIS)) == null, "Exact TTL end excluded");
        check(!core.snapshot().active && core.snapshot().eventCount == 0, "TTL erases");
    }

    private static void unavailableRetry() {
        LocalInspectionCore core = started();
        QueryTicket ticket = core.beginQuery(at(100));
        CommitResult failure = core.finishQuery(ticket, at(110), null, SourceStatus.UNAVAILABLE);
        check(!failure.accepted && failure.snapshot.active && failure.snapshot.queryCursorWallMillis == WALL, "Failure does not advance cursor");
        QueryTicket retry = core.beginQuery(at(200));
        check(retry.startInclusive == WALL, "Same interval can retry");
        check(core.finishQuery(retry, at(210), Collections.emptyList(), SourceStatus.AVAILABLE).accepted, "Empty success accepted as diagnostic");
        check(core.report(at(220)).packages.get(0).estimatedDurationMillis == null, "Failure/empty not zero");
    }

    private static void sourceStops() {
        for (SourceStatus status : Arrays.asList(SourceStatus.PERMISSION_DENIED, SourceStatus.DEVICE_LOCKED, SourceStatus.TRUNCATED)) {
            LocalInspectionCore core = started();
            commit(core, 100, Arrays.asList(event(APP, 10, Type.RESUME), event(APP, 20, Type.PAUSE)));
            QueryTicket ticket = core.beginQuery(at(200));
            check(!core.finishQuery(ticket, at(210), Collections.emptyList(), status).accepted, "Unsafe source rejected");
            check(!core.snapshot().active && core.snapshot().eventCount == 0, "Unsafe source erases");
        }
    }

    private static void atomicValidation() {
        LocalInspectionCore core = started();
        QueryTicket ticket = core.beginQuery(at(100));
        CommitResult failure = core.finishQuery(ticket, at(110), Arrays.asList(event(APP, 10, Type.RESUME), event(APP, 20, null)), SourceStatus.AVAILABLE);
        check(!failure.accepted && core.snapshot().eventCount == 0 && core.snapshot().queryCursorWallMillis == WALL, "No partial commit");
    }

    private static void boundedEvents() {
        LocalInspectionCore core = started();
        List<ProjectedEvent> records = new ArrayList<>();
        for (int i = 0; i < LocalInspectionCore.MAX_EVENTS; i++) records.add(event(APP, i, Type.RESUME));
        commit(core, 5000, records);
        check(core.snapshot().eventCount == LocalInspectionCore.MAX_EVENTS, "At-cap accepted");
        QueryTicket ticket = core.beginQuery(at(6000));
        check(!core.finishQuery(ticket, at(6010), Arrays.asList(event(APP, 5500, Type.PAUSE)), SourceStatus.AVAILABLE).accepted, "Over-cap denied");
        check(!core.snapshot().active && core.snapshot().eventCount == 0, "Over-cap erases rather than partial retention");
        LocalInspectionCore other = started();
        records.add(event(APP, 4096, Type.RESUME));
        QueryTicket tooBig = other.beginQuery(at(5000));
        check(!other.finishQuery(tooBig, at(5010), records, SourceStatus.AVAILABLE).accepted && !other.snapshot().active, "Oversized query stopped");
    }

    private static void ticketIdentity() {
        LocalInspectionCore core = started();
        QueryTicket cancelled = core.beginQuery(at(100));
        core.cancelQuery(cancelled);
        check(!core.finishQuery(cancelled, at(110), Collections.emptyList(), SourceStatus.AVAILABLE).accepted, "Cancellation fence");
        QueryTicket current = core.beginQuery(at(200));
        LocalInspectionCore other = started();
        QueryTicket foreign = other.beginQuery(at(200));
        check(!core.finishQuery(foreign, at(210), Collections.emptyList(), SourceStatus.AVAILABLE).accepted, "Reference identity required");
        check(core.finishQuery(current, at(220), Collections.emptyList(), SourceStatus.AVAILABLE).accepted, "Foreign ticket did not destroy pending read");
    }

    private static void preferences() {
        check(LocalInspectionCore.parsePackages(APP + ", " + APP).size() == 1, "Dedup typed values");
        rejects(() -> LocalInspectionCore.parsePackages(""));
        rejects(() -> LocalInspectionCore.parsePackages("com.example fixture"));
        rejects(() -> LocalInspectionCore.parsePackages("com.example.<private>"));
        Set<String> tooMany = new HashSet<>();
        for (int i = 0; i <= LocalInspectionCore.MAX_PACKAGES; i++) tooMany.add("com.example.p" + i);
        rejects(() -> new LocalInspectionCore().start(tooMany, at(0)));
        LocalInspectionCore core = started();
        rejects(() -> core.snapshot().selectedPackages.add("com.other.fake"));
        rejects(() -> core.report(at(0)).packages.clear());
        core.clear(at(10));
        check(core.snapshot().selectedPackages.isEmpty() && !core.snapshot().active, "Clear includes selected preferences");
    }

    private static void generationExhaustion() {
        LocalInspectionCore core = new LocalInspectionCore();
        core.restart(Long.MAX_VALUE - 3, set(APP), at(0));
        core.start(set(APP), at(10));
        QueryTicket ticket = core.beginQuery(at(100));
        core.finishQuery(ticket, at(110), Arrays.asList(event(APP, 20, Type.RESUME), event(APP, 30, Type.PAUSE)), SourceStatus.AVAILABLE);
        core.pause(at(120));
        check(!core.snapshot().active && core.snapshot().eventCount == 0, "Exhaustion still permits Stop to erase");
        rejects(() -> core.start(set(APP), at(130)));
    }

    private static void recentProjection() {
        LocalInspectionCore core = started();
        List<ProjectedEvent> records = new ArrayList<>();
        for (int i = 0; i < 100; i++) records.add(event(APP, i, Type.RESUME));
        records.add(new ProjectedEvent("com.denied.private", Long.MIN_VALUE, null));
        commit(core, 110, records);
        DiagnosticReport report = core.report(at(120));
        check(report.recentEvents.size() == LocalInspectionCore.MAX_RECENT_EVENTS, "Bounded recent projection");
        check(report.recentEvents.get(0).timestampMillis == WALL + 99
            && report.recentEvents.get(63).timestampMillis == WALL + 36, "Latest first");
        for (ProjectedEvent event : report.recentEvents) check(event.packageName.equals(APP), "Selected fields only");
        rejects(() -> report.recentEvents.clear());
    }

    private static LocalInspectionCore fixtureCore() {
        LocalInspectionCore core = new LocalInspectionCore();
        core.start(set(FixtureComparison.FIXTURE_PACKAGE), at(0));
        return core;
    }

    private static FixtureComparison.Result compare(LocalInspectionCore core, long start, long end, long duration) {
        return FixtureComparison.compare(core.report(at(120)), WALL + start, WALL + end, duration);
    }

    private static void comparisonClipping() {
        LocalInspectionCore core = fixtureCore();
        commit(core, 100, fragmented(FixtureComparison.FIXTURE_PACKAGE));
        FixtureComparison.Result result = compare(core, 20, 70, 50);
        check(result.accepted && result.status == FixtureComparison.Status.KNOWN_ESTIMATE
            && result.candidateDurationMillis == 47L && result.signedDifferenceMillis == -3L,
            "Clip both edges and retain intervening 3ms of genuine gaps");
        check(result.fixtureDurationMillis == 50 && result.overlappingClosedIntervals == 3,
            "Manual value and clipped interval count are separate");
        FixtureComparison.Result positive = compare(core, 20, 70, 40);
        check(positive.signedDifferenceMillis == 7L, "Signed difference is candidate minus manual value");
        FixtureComparison.Result exact = compare(core, 20, 70, 47);
        check(exact.signedDifferenceMillis == 0L && exact.coverageUnknown
            && !exact.physicalAndroidVerified && !exact.oapSummaryEligible && !exact.fixtureValueVerified,
            "A zero difference is not an accuracy pass or attestation");
    }

    private static void comparisonUnknown() {
        LocalInspectionCore empty = fixtureCore();
        commit(empty, 100, Collections.emptyList());
        FixtureComparison.Result missing = compare(empty, 20, 70, 0);
        check(missing.accepted && missing.status == FixtureComparison.Status.UNKNOWN
            && missing.reason == FixtureComparison.Reason.NO_CLOSED_ESTIMATE
            && missing.candidateDurationMillis == null && missing.signedDifferenceMillis == null,
            "Missing evidence stays unknown even when manual expectation is zero");
        LocalInspectionCore open = fixtureCore();
        commit(open, 100, Arrays.asList(event(FixtureComparison.FIXTURE_PACKAGE, 10, Type.RESUME)));
        FixtureComparison.Result unfinished = compare(open, 20, 70, 50);
        check(unfinished.status == FixtureComparison.Status.UNKNOWN
            && unfinished.ambiguityReasons.contains("open_transition_sequence"), "No closure at comparison boundary");
        LocalInspectionCore closed = fixtureCore();
        commit(closed, 100, Arrays.asList(event(FixtureComparison.FIXTURE_PACKAGE, 10, Type.RESUME),
            event(FixtureComparison.FIXTURE_PACKAGE, 20, Type.PAUSE)));
        check(compare(closed, 20, 40, 0).status == FixtureComparison.Status.UNKNOWN,
            "Half-open end touching window start is not overlapping evidence");
        check(compare(closed, 0, 10, 0).status == FixtureComparison.Status.UNKNOWN,
            "Window end touching interval start is not overlapping evidence");
    }

    private static void comparisonScope() {
        LocalInspectionCore ordinary = started();
        commit(ordinary, 100, fragmented(APP));
        comparisonInvalid(compare(ordinary, 20, 70, 50), FixtureComparison.Reason.FIXTURE_NOT_SELECTED);
        LocalInspectionCore fixture = fixtureCore();
        commit(fixture, 100, fragmented(FixtureComparison.FIXTURE_PACKAGE));
        fixture.pause(at(110));
        comparisonInvalid(compare(fixture, 20, 70, 50), FixtureComparison.Reason.INACTIVE_SESSION);
        LocalInspectionCore mixed = new LocalInspectionCore();
        mixed.start(new HashSet<>(Arrays.asList(APP, FixtureComparison.FIXTURE_PACKAGE)), at(0));
        List<ProjectedEvent> records = new ArrayList<>(fragmented(FixtureComparison.FIXTURE_PACKAGE));
        records.add(event(APP, 1, Type.RESUME));
        records.add(event(APP, 99, Type.PAUSE));
        commit(mixed, 100, records);
        check(compare(mixed, 20, 70, 50).candidateDurationMillis == 47L,
            "Other selected packages do not contribute to the fixed fixture comparison");
    }

    private static void comparisonHorizon() {
        LocalInspectionCore core = fixtureCore();
        commit(core, 100, fragmented(FixtureComparison.FIXTURE_PACKAGE));
        comparisonInvalid(compare(core, -1, 70, 50), FixtureComparison.Reason.WINDOW_OUTSIDE_SESSION);
        comparisonInvalid(compare(core, 20, 101, 50), FixtureComparison.Reason.WINDOW_NOT_QUERIED);
        check(compare(core, 0, 100, 67).status == FixtureComparison.Status.KNOWN_ESTIMATE,
            "Exact consent start and successful query end are legal comparison boundaries");
        LocalInspectionCore fresh = fixtureCore();
        comparisonInvalid(compare(fresh, 0, 1, 0), FixtureComparison.Reason.WINDOW_NOT_QUERIED);
        core.start(set(FixtureComparison.FIXTURE_PACKAGE), at(125));
        commit(core, 200, Collections.emptyList());
        FixtureComparison.Result oldWindow = FixtureComparison.compare(core.report(at(220)), WALL + 20, WALL + 70, 50);
        comparisonInvalid(oldWindow, FixtureComparison.Reason.WINDOW_OUTSIDE_SESSION);
    }

    private static void comparisonInputs() {
        LocalInspectionCore core = fixtureCore();
        commit(core, 100, fragmented(FixtureComparison.FIXTURE_PACKAGE));
        DiagnosticReport report = core.report(at(120));
        comparisonInvalid(FixtureComparison.compare(null, WALL, WALL + 10, 0), FixtureComparison.Reason.INVALID_REPORT);
        comparisonInvalid(FixtureComparison.compare(report, -1, WALL, 0), FixtureComparison.Reason.INVALID_WINDOW);
        comparisonInvalid(compare(core, 50, 50, 0), FixtureComparison.Reason.INVALID_WINDOW);
        comparisonInvalid(compare(core, 60, 50, 0), FixtureComparison.Reason.INVALID_WINDOW);
        comparisonInvalid(FixtureComparison.compare(report, 0, Long.MAX_VALUE, 0), FixtureComparison.Reason.WINDOW_TOO_LONG);
        comparisonInvalid(compare(core, 20, 70, -1), FixtureComparison.Reason.INVALID_FIXTURE_DURATION);
        comparisonInvalid(compare(core, 20, 70, 2051), FixtureComparison.Reason.INVALID_FIXTURE_DURATION);
        comparisonInvalid(compare(core, 20, 70, Long.MAX_VALUE), FixtureComparison.Reason.INVALID_FIXTURE_DURATION);
        check(compare(core, 20, 70, 2050).accepted, "Exact finite drift tolerance is accepted, not treated as proof");
        LocalInspectionCore limit = fixtureCore();
        commit(limit, FixtureComparison.MAX_WINDOW_MILLIS + 1, Collections.emptyList());
        DiagnosticReport limitReport = limit.report(at(FixtureComparison.MAX_WINDOW_MILLIS + 2));
        check(FixtureComparison.compare(limitReport, WALL, WALL + FixtureComparison.MAX_WINDOW_MILLIS, 0).accepted,
            "Exact ten-minute comparison window is allowed");
        comparisonInvalid(FixtureComparison.compare(limitReport, WALL, WALL + FixtureComparison.MAX_WINDOW_MILLIS + 1, 0),
            FixtureComparison.Reason.WINDOW_TOO_LONG);
    }

    private static void comparisonAmbiguity() {
        LocalInspectionCore overlap = fixtureCore();
        String fixture = FixtureComparison.FIXTURE_PACKAGE;
        commit(overlap, 100, Arrays.asList(event(fixture, 10, Type.RESUME), event(fixture, 20, Type.RESUME),
            event(fixture, 30, Type.PAUSE), event(fixture, 40, Type.PAUSE)));
        FixtureComparison.Result candidate = compare(overlap, 15, 35, 20);
        check(candidate.candidateDurationMillis == 20L && candidate.overlappingClosedIntervals == 1
            && candidate.ambiguityReasons.contains("package_level_overlap_or_missing_pause")
            && candidate.coverageUnknown && !candidate.oapSummaryEligible, "Union once with package matching uncertainty");
        LocalInspectionCore conflict = fixtureCore();
        commit(conflict, 100, Arrays.asList(event(fixture, 10, Type.RESUME), event(fixture, 30, Type.PAUSE),
            event(fixture, 30, Type.RESUME), event(fixture, 50, Type.PAUSE)));
        FixtureComparison.Result unknown = compare(conflict, 20, 40, 20);
        check(unknown.status == FixtureComparison.Status.UNKNOWN && unknown.candidateDurationMillis == null
            && unknown.ambiguityReasons.contains("ambiguous_same_timestamp_transitions"), "Conflicting evidence cannot supply a number");
        LocalInspectionCore missing = fixtureCore();
        commit(missing, 100, Arrays.asList(event(fixture, 10, Type.RESUME), event(fixture, 20, Type.PAUSE),
            event(fixture, 50, Type.PAUSE)));
        check(compare(missing, 10, 20, 10).status == FixtureComparison.Status.UNKNOWN,
            "Unmatched pause cannot resurrect an invalidated old estimate");
    }

    private static void comparisonPure() {
        LocalInspectionCore core = fixtureCore();
        commit(core, 100, fragmented(FixtureComparison.FIXTURE_PACKAGE));
        DiagnosticReport report = core.report(at(110));
        LocalInspectionCore.Snapshot before = core.snapshot();
        FixtureComparison.Result result = FixtureComparison.compare(report, WALL + 20, WALL + 70, 50);
        LocalInspectionCore.Snapshot after = core.snapshot();
        check(before.generation == after.generation && before.queryCursorWallMillis == after.queryCursorWallMillis
            && before.eventCount == after.eventCount && before.lastWallMillis == after.lastWallMillis
            && before.lastElapsedMillis == after.lastElapsedMillis, "Comparison does not query, advance time or mutate controls");
        check(report.packages.get(0).estimatedDurationMillis == 67L && report.packages.get(0).closedEstimates.size() == 3,
            "Clipping does not mutate retained diagnostics");
        rejects(() -> result.ambiguityReasons.clear());
    }

    private static void comparisonInvalid(FixtureComparison.Result result, FixtureComparison.Reason reason) {
        check(!result.accepted && result.status == FixtureComparison.Status.INVALID && result.reason == reason,
            "Expected typed invalid comparison: " + reason);
        check(result.candidateDurationMillis == null && result.signedDifferenceMillis == null
            && result.overlappingClosedIntervals == 0 && result.coverageUnknown && !result.oapSummaryEligible,
            "Invalid inputs cannot return a comparison or attest coverage");
    }

    private static LocalInspectionCore started() {
        LocalInspectionCore core = new LocalInspectionCore();
        core.start(set(APP), at(0));
        return core;
    }
    private static Set<String> set(String value) { return new HashSet<>(Arrays.asList(value)); }
    private static ClockSample at(long offset) { return new ClockSample(WALL + offset, ELAPSED + offset); }
    private static ProjectedEvent event(String app, long offset, Type type) { return new ProjectedEvent(app, WALL + offset, type); }
    private static void commit(LocalInspectionCore core, long end, List<ProjectedEvent> events) {
        QueryTicket ticket = core.beginQuery(at(end));
        check(ticket != null, "Expected query ticket");
        check(core.finishQuery(ticket, at(end + 1), events, SourceStatus.AVAILABLE).accepted, "Expected accepted diagnostic records");
    }
    private static void run(String name, Runnable test) {
        try { test.run(); passed++; System.out.println("PASS " + name); }
        catch (Throwable error) { throw new AssertionError("FAIL " + name, error); }
    }
    private static void check(boolean value, String message) { if (!value) throw new AssertionError(message); }
    private static void rejects(Runnable action) {
        try { action.run(); }
        catch (IllegalArgumentException | IllegalStateException | UnsupportedOperationException expected) { return; }
        throw new AssertionError("Expected bounded input rejection");
    }
}
