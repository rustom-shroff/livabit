package org.liveabit.fixture.core;

import java.util.List;

/** Dependency-free regression cases for the owned fixture, not evidence of Android runtime behavior. */
public final class LifecycleFixtureCoreTest {
    private static final long WALL = 1700000000000L;
    private static final long ELAPSED = 1000L;
    private static int checks;

    public static void main(String[] args) {
        check("interior markers exclude setup", LifecycleFixtureCoreTest::markersExcludeSetup);
        check("handoffs preserve genuine gaps", LifecycleFixtureCoreTest::handoffsPreserveGaps);
        check("overlap contributes a union once", LifecycleFixtureCoreTest::overlapUnion);
        check("active report is provisional", LifecycleFixtureCoreTest::provisionalReport);
        check("duplicate resume erases the run", LifecycleFixtureCoreTest::duplicateResume);
        check("unmatched pause erases the run", LifecycleFixtureCoreTest::unmatchedPause);
        check("Begin requires resumed caller", LifecycleFixtureCoreTest::beginRequiresCaller);
        check("Finish requires resumed caller", LifecycleFixtureCoreTest::finishRequiresCaller);
        check("invalid samples fail closed", LifecycleFixtureCoreTest::invalidSamples);
        check("128 callbacks allowed", LifecycleFixtureCoreTest::capacityAllowed);
        check("129th callback erases the run", LifecycleFixtureCoreTest::capacityRejected);
        check("ten-minute boundary expires", LifecycleFixtureCoreTest::expiry);
        check("just under boundary can finish", LifecycleFixtureCoreTest::beforeExpiry);
        check("wall rollback fails closed", LifecycleFixtureCoreTest::wallRollback);
        check("elapsed rollback fails closed", LifecycleFixtureCoreTest::elapsedRollback);
        check("two-second drift tolerance is inclusive", LifecycleFixtureCoreTest::driftTolerance);
        check("incremental drift cannot evade full-window check", LifecycleFixtureCoreTest::cumulativeDrift);
        check("Clear removes trace and markers", LifecycleFixtureCoreTest::clear);
        check("fresh Begin replaces old run", LifecycleFixtureCoreTest::freshBegin);
        check("finished values freeze during navigation", LifecycleFixtureCoreTest::finishedFrozen);
        check("finished clock discontinuity erases values", LifecycleFixtureCoreTest::finishedClockFailure);
        check("process reset is empty and stopped", LifecycleFixtureCoreTest::processReset);
        check("reports are immutable and contain no tokens", LifecycleFixtureCoreTest::immutableReports);
        check("opaque tokens use identity equality", LifecycleFixtureCoreTest::identityTokens);
        check("fresh Begin recovers invalid run", LifecycleFixtureCoreTest::recoverInvalid);
        System.out.println("PASS LifecycleFixtureCoreTest: " + checks + " checks");
    }

    private static void markersExcludeSetup() {
        Object token = new Object(); LifecycleFixtureCore core = started(token, 10);
        LifecycleFixtureCore.Report report = core.finish(token, at(40));
        finished(report, 30);
        eq(WALL + 10, report.beginWallMillis, "interior start");
        eq(WALL + 40, report.finishWallMillis, "interior end");
        eq(0, report.callbackCount, "markers are not fabricated callback records");
    }
    private static void handoffsPreserveGaps() {
        Object a = new Object(), b = new Object(); LifecycleFixtureCore core = started(a, 10);
        core.pause(a, at(30)); core.resume(b, at(35)); core.pause(b, at(50)); core.resume(a, at(55));
        LifecycleFixtureCore.Report report = core.finish(a, at(70));
        finished(report, 50); eq(4, report.callbackCount, "handoff callbacks retained");
        eq(LifecycleFixtureCore.Type.PAUSE, report.records.get(0).type, "first owned callback");
    }
    private static void overlapUnion() {
        Object a = new Object(), b = new Object(); LifecycleFixtureCore core = started(a, 10);
        core.resume(b, at(15)); core.pause(a, at(20)); core.pause(b, at(30)); core.resume(a, at(40));
        finished(core.finish(a, at(60)), 40);
    }
    private static void provisionalReport() {
        Object token = new Object(); LifecycleFixtureCore core = started(token, 10);
        LifecycleFixtureCore.Report report = core.report(at(20));
        eq(LifecycleFixtureCore.State.ACTIVE, report.state, "active");
        eq(10L, report.unionDurationMillis, "known open fixture state only");
        yes(!report.comparisonAvailable, "open window not comparison-ready");
        yes(report.finishWallMillis == null, "no invented finish marker");
        finished(core.finish(token, at(30)), 20);
    }
    private static void duplicateResume() {
        Object token = new Object(); LifecycleFixtureCore core = started(token, 10);
        invalid(core.resume(token, at(20)), LifecycleFixtureCore.Reason.DUPLICATE_RESUME);
    }
    private static void unmatchedPause() {
        Object token = new Object(); LifecycleFixtureCore core = started(token, 10);
        core.pause(token, at(20));
        invalid(core.pause(token, at(30)), LifecycleFixtureCore.Reason.UNMATCHED_PAUSE);
    }
    private static void beginRequiresCaller() {
        LifecycleFixtureCore core = new LifecycleFixtureCore(); Object a = new Object(), b = new Object();
        core.resume(a, at(0));
        invalid(core.begin(b, at(10)), LifecycleFixtureCore.Reason.CALLER_NOT_RESUMED);
    }
    private static void finishRequiresCaller() {
        Object token = new Object(); LifecycleFixtureCore core = started(token, 10);
        core.pause(token, at(20));
        invalid(core.finish(token, at(30)), LifecycleFixtureCore.Reason.CALLER_NOT_RESUMED);
    }
    private static void invalidSamples() {
        Object token = new Object(); LifecycleFixtureCore core = started(token, 10);
        invalid(core.report(new LifecycleFixtureCore.Sample(-1, 0)), LifecycleFixtureCore.Reason.INVALID_SAMPLE);
        invalid(core.begin(token, new LifecycleFixtureCore.Sample(253402300800000L, 0)),
            LifecycleFixtureCore.Reason.INVALID_SAMPLE);
        invalid(core.report(null), LifecycleFixtureCore.Reason.INVALID_SAMPLE);
        invalid(core.clear(new LifecycleFixtureCore.Sample(0, -1)), LifecycleFixtureCore.Reason.INVALID_SAMPLE);
        invalid(core.resume(null, at(20)), LifecycleFixtureCore.Reason.INVALID_SAMPLE);
    }
    private static void capacityAllowed() {
        Object token = new Object(); LifecycleFixtureCore core = started(token, 0);
        fill(core, token);
        LifecycleFixtureCore.Report report = core.finish(token, at(130));
        finished(report, 66); eq(128, report.callbackCount, "full bounded trace");
    }
    private static void capacityRejected() {
        Object token = new Object(); LifecycleFixtureCore core = started(token, 0);
        fill(core, token);
        invalid(core.pause(token, at(129)), LifecycleFixtureCore.Reason.RECORD_LIMIT);
    }
    private static void expiry() {
        Object token = new Object(); LifecycleFixtureCore core = started(token, 0);
        invalid(core.report(at(LifecycleFixtureCore.MAX_RUN_MILLIS)), LifecycleFixtureCore.Reason.RUN_EXPIRED);
    }
    private static void beforeExpiry() {
        Object token = new Object(); LifecycleFixtureCore core = started(token, 0);
        finished(core.finish(token, at(LifecycleFixtureCore.MAX_RUN_MILLIS - 1)),
            LifecycleFixtureCore.MAX_RUN_MILLIS - 1);
    }
    private static void wallRollback() {
        Object token = new Object(); LifecycleFixtureCore core = started(token, 10);
        invalid(core.report(new LifecycleFixtureCore.Sample(WALL + 9, ELAPSED + 20)),
            LifecycleFixtureCore.Reason.CLOCK_DISCONTINUITY);
    }
    private static void elapsedRollback() {
        Object token = new Object(); LifecycleFixtureCore core = started(token, 10);
        invalid(core.report(new LifecycleFixtureCore.Sample(WALL + 20, ELAPSED + 9)),
            LifecycleFixtureCore.Reason.CLOCK_DISCONTINUITY);
    }
    private static void driftTolerance() {
        Object token = new Object(); LifecycleFixtureCore core = started(token, 0);
        finished(core.finish(token, new LifecycleFixtureCore.Sample(WALL + 2020, ELAPSED + 20)), 20);
        core = started(token, 0);
        invalid(core.report(new LifecycleFixtureCore.Sample(WALL + 2021, ELAPSED + 20)),
            LifecycleFixtureCore.Reason.CLOCK_DISCONTINUITY);
    }
    private static void cumulativeDrift() {
        Object token = new Object(); LifecycleFixtureCore core = started(token, 0);
        core.report(new LifecycleFixtureCore.Sample(WALL + 2000, ELAPSED + 1000));
        core.report(new LifecycleFixtureCore.Sample(WALL + 4000, ELAPSED + 2000));
        invalid(core.report(new LifecycleFixtureCore.Sample(WALL + 6000, ELAPSED + 3000)),
            LifecycleFixtureCore.Reason.CLOCK_DISCONTINUITY);
    }
    private static void clear() {
        Object token = new Object(); LifecycleFixtureCore core = started(token, 0);
        core.pause(token, at(10)); core.resume(token, at(20));
        LifecycleFixtureCore.Report report = core.clear(at(30));
        eq(LifecycleFixtureCore.State.IDLE, report.state, "clear stops run"); erased(report);
        core.begin(token, at(40)); finished(core.finish(token, at(50)), 10);
    }
    private static void freshBegin() {
        Object token = new Object(); LifecycleFixtureCore core = started(token, 0);
        core.pause(token, at(10)); core.resume(token, at(20)); core.begin(token, at(30));
        LifecycleFixtureCore.Report report = core.finish(token, at(40));
        finished(report, 10); eq(0, report.callbackCount, "fresh start removes old callbacks");
        core.begin(token, at(50)); finished(core.finish(token, at(60)), 10);
    }
    private static void finishedFrozen() {
        Object token = new Object(); LifecycleFixtureCore core = started(token, 10);
        core.finish(token, at(20)); core.pause(token, at(30)); core.resume(token, at(40));
        LifecycleFixtureCore.Report report = core.report(at(3600000));
        finished(report, 10); eq(WALL + 20, report.finishWallMillis, "finish remains fixed");
        eq(0, report.callbackCount, "post-window callbacks not retained");
    }
    private static void finishedClockFailure() {
        Object token = new Object(); LifecycleFixtureCore core = started(token, 10);
        core.finish(token, at(20));
        invalid(core.report(new LifecycleFixtureCore.Sample(WALL + 4000, ELAPSED + 30)),
            LifecycleFixtureCore.Reason.CLOCK_DISCONTINUITY);
    }
    private static void processReset() {
        Object token = new Object(); LifecycleFixtureCore old = started(token, 10);
        old.finish(token, at(20)); LifecycleFixtureCore next = new LifecycleFixtureCore();
        LifecycleFixtureCore.Report report = next.report(at(30));
        eq(LifecycleFixtureCore.State.IDLE, report.state, "new process is stopped"); erased(report);
        invalid(next.begin(token, at(40)), LifecycleFixtureCore.Reason.CALLER_NOT_RESUMED);
        next.resume(token, at(50)); next.begin(token, at(60)); finished(next.finish(token, at(70)), 10);
    }
    private static void immutableReports() {
        Object token = new Object(); LifecycleFixtureCore core = started(token, 10);
        core.pause(token, at(20)); core.resume(token, at(30));
        LifecycleFixtureCore.Report report = core.finish(token, at(40));
        try { report.records.clear(); throw new AssertionError("records must be immutable"); }
        catch (UnsupportedOperationException expected) { }
        eq(List.of("type", "wallMillis", "elapsedMillis"),
            java.util.Arrays.stream(LifecycleFixtureCore.Record.class.getFields()).map(field -> field.getName()).toList(),
            "callback record has no own token identity");
        yes(!report.collectorCoverageAttested && !report.physicalAndroidVerified,
            "fixture cannot attest collector/device evidence");
    }
    private static void identityTokens() {
        Object a = new String("same"), b = new String("same");
        LifecycleFixtureCore core = started(a, 10); core.resume(b, at(15));
        core.pause(a, at(20)); finished(core.finish(b, at(30)), 20);
    }
    private static void recoverInvalid() {
        Object token = new Object(); LifecycleFixtureCore core = started(token, 10);
        core.resume(token, at(20)); core.begin(token, at(30));
        finished(core.finish(token, at(40)), 10);
    }

    private static LifecycleFixtureCore started(Object token, long begin) {
        LifecycleFixtureCore core = new LifecycleFixtureCore();
        core.resume(token, at(0)); core.begin(token, at(begin)); return core;
    }
    private static void fill(LifecycleFixtureCore core, Object token) {
        for (int index = 0; index < 64; index++) {
            core.pause(token, at(index * 2L + 1)); core.resume(token, at(index * 2L + 2));
        }
    }
    private static LifecycleFixtureCore.Sample at(long delta) {
        return new LifecycleFixtureCore.Sample(WALL + delta, ELAPSED + delta);
    }
    private static void finished(LifecycleFixtureCore.Report report, long duration) {
        eq(LifecycleFixtureCore.State.FINISHED, report.state, "valid finished state");
        eq(duration, report.unionDurationMillis, "fixture callback union");
        yes(report.comparisonAvailable, "finished window provides comparison value");
        yes(!report.collectorCoverageAttested, "no production coverage attestation");
    }
    private static void invalid(LifecycleFixtureCore.Report report, LifecycleFixtureCore.Reason reason) {
        eq(LifecycleFixtureCore.State.INVALID, report.state, "invalid state");
        eq(reason, report.reason, "safe failure reason"); erased(report);
    }
    private static void erased(LifecycleFixtureCore.Report report) {
        yes(report.unionDurationMillis == null && report.beginWallMillis == null && report.beginElapsedMillis == null
            && report.finishWallMillis == null && report.finishElapsedMillis == null, "erase values and boundaries");
        eq(0, report.callbackCount, "erase trace"); yes(!report.comparisonAvailable, "no comparison after erase");
    }
    private static void check(String label, Runnable test) {
        try { test.run(); checks++; }
        catch (RuntimeException | AssertionError failure) { throw new AssertionError(label, failure); }
    }
    private static void yes(boolean value, String message) { if (!value) throw new AssertionError(message); }
    private static void eq(Object expected, Object actual, String message) {
        if (!java.util.Objects.equals(expected, actual))
            throw new AssertionError(message + ": expected " + expected + ", got " + actual);
    }
}
