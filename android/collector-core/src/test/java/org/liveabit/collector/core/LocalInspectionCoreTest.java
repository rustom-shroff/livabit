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
        run("stop clears RAM and invalidates in-flight result", LocalInspectionCoreTest::stopFence);
        run("selection changes start a fresh scope", LocalInspectionCoreTest::selectionFence);
        run("restart restores preferences only, stopped", LocalInspectionCoreTest::restartStopped);
        run("clock jumps and elapsed reversal stop and erase", LocalInspectionCoreTest::clockSafety);
        run("24-hour session expiry erases activity", LocalInspectionCoreTest::expiry);
        run("unavailable query can retry without inventing coverage", LocalInspectionCoreTest::unavailableRetry);
        run("permission loss, device lock and truncation erase activity", LocalInspectionCoreTest::sourceStops);
        run("invalid projected records fail atomically", LocalInspectionCoreTest::atomicValidation);
        run("bounded session and query prevent partial commits", LocalInspectionCoreTest::boundedEvents);
        run("cancelled and foreign tickets cannot commit", LocalInspectionCoreTest::ticketIdentity);
        run("typed package preferences and snapshots are bounded immutable", LocalInspectionCoreTest::preferences);
        run("generation exhaustion is fail-closed", LocalInspectionCoreTest::generationExhaustion);
        run("recent inspection exposes bounded projected fields only", LocalInspectionCoreTest::recentProjection);
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
