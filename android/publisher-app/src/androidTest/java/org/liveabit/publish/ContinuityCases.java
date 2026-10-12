package org.liveabit.publish;

import android.app.Instrumentation;
import android.content.Context;
import android.os.SystemClock;
import org.json.JSONObject;
import org.liveabit.collector.core.LocalInspectionCore;
import java.io.FileInputStream;
import java.util.List;
import java.util.Set;
import java.util.concurrent.TimeUnit;

/** Exercises production Android estimation, persisted state, actual usage reads, jobs and HTTP. */
final class ContinuityCases {
    private static final String APP = "org.liveabit.fixture";
    private static void check(boolean value, String message) { if (!value) throw new AssertionError(message); }
    private static LocalInspectionCore.ProjectedEvent resume(long at) {
        return new LocalInspectionCore.ProjectedEvent(APP, at, LocalInspectionCore.Type.RESUME);
    }
    private static LocalInspectionCore.ProjectedEvent pause(long at) {
        return new LocalInspectionCore.ProjectedEvent(APP, at, LocalInspectionCore.Type.PAUSE);
    }
    private static ForegroundContinuity.Result estimate(JSONObject previous, long start, long end,
            List<LocalInspectionCore.ProjectedEvent> events) throws Exception {
        return ForegroundContinuity.estimate(Set.of(APP), events, List.of(), previous, start, end, end, 1, true);
    }
    private static JSONObject app(ForegroundContinuity.Result result) throws Exception { return result.apps.getJSONObject(0); }
    private static long duration(ForegroundContinuity.Result result) throws Exception { return app(result).getLong("foreground_duration_ms"); }
    private static void shell(Instrumentation tests, String command) throws Exception {
        try (var descriptor = tests.getUiAutomation().executeShellCommand(command);
                var input = new FileInputStream(descriptor.getFileDescriptor())) { input.readAllBytes(); }
    }
    private static void automatic(Context context, DeliveryEngine engine) throws Exception {
        JSONObject state = engine.snapshot();
        ((PublisherApplication) context.getApplicationContext()).worker.submit(() ->
            engine.automaticCycle(state.optString("stream_id"), state.optLong("schedule_revision"))).get(30, TimeUnit.SECONDS);
    }
    private static JSONObject observation(OpenClawContractCases.Request request) throws Exception {
        String message = new JSONObject(request.body).getString("message");
        return new JSONObject(message.substring(message.indexOf('{')));
    }
    static void run(Instrumentation tests, Context context, DeliveryEngine engine, List<String> passed) throws Exception {
        ForegroundContinuity.Result first = estimate(null, 100, 1000, List.of(resume(200)));
        ForegroundContinuity.Result second = estimate(new JSONObject(first.boundary.toString()), 1000, 2000, List.of());
        check(duration(first) == 800 && duration(second) == 1000 && app(second).getInt("transition_count") == 0,
            "An uninterrupted session was skipped or counted cumulatively");
        passed.add("native_open_session_continues_without_repeating_transitions_or_previous_duration");

        ForegroundContinuity.Result closed = estimate(second.boundary, 2000, 3000, List.of(pause(2200)));
        check(duration(closed) == 200 && closed.boundary.getJSONObject("apps").length() == 0
            && app(estimate(closed.boundary, 3000, 4000, List.of())).isNull("foreground_duration_ms"), "Pause did not end continued use");
        passed.add("native_cross_window_pause_closes_session_and_following_idle_stays_unknown");

        check(app(estimate(null, 100, 1000, List.of())).isNull("foreground_duration_ms")
            && app(estimate(null, 100, 1000, List.of(pause(200)))).isNull("foreground_duration_ms"), "Unknown usage became an invented duration");
        passed.add("native_initial_empty_and_unmatched_pause_do_not_invent_usage");

        ForegroundContinuity.Result overlap = estimate(null, 100, 1000,
            List.of(resume(200), resume(300), pause(400), pause(500), resume(600)));
        check(duration(overlap) == 700 && app(overlap).getInt("transition_count") == 5,
            "Internal activity changes double-counted package time");
        check(app(estimate(null, 100, 1000, List.of(resume(200), pause(200)))).isNull("foreground_duration_ms"),
            "Ambiguous same-time records established a foreground session");
        passed.add("native_internal_activity_overlap_and_same_timestamp_ambiguity");

        ForegroundContinuity.Result screen = ForegroundContinuity.estimate(Set.of(APP), List.of(pause(1300), resume(1700)),
            List.of(1200L), first.boundary, 1000, 2000, 2000, 1, true);
        check(duration(screen) == 500 && app(screen).getInt("transition_count") == 2,
            "Screen-off time was charged to the open session or became an app transition");
        ForegroundContinuity.Result sleeping = ForegroundContinuity.estimate(Set.of(APP), List.of(), List.of(1200L),
            first.boundary, 1000, 2000, 2000, 1, true);
        check(duration(sleeping) == 200 && sleeping.boundary.getJSONObject("apps").length() == 0,
            "Screen source did not close a retained open session");
        check(ForegroundContinuity.estimate(Set.of(APP), List.of(), List.of(), first.boundary,
            1000, 2000, 2000, 1, false).boundary.getJSONObject("apps").length() == 0, "Screen-off retained an open tail");
        passed.add("native_screen_boundaries_clip_foreground_and_never_become_transitions");

        check(app(estimate(first.boundary, 1100, 2000, List.of())).isNull("foreground_duration_ms"), "Unobserved gap inherited a session");
        JSONObject reboot = new JSONObject(first.boundary.toString()).put("boot", 2);
        JSONObject clock = new JSONObject(first.boundary.toString()).put("elapsed", 10_000);
        check(app(estimate(reboot, 1000, 2000, List.of())).isNull("foreground_duration_ms")
            && app(estimate(clock, 1000, 2000, List.of())).isNull("foreground_duration_ms"), "Reboot or clock break inherited a session");
        JSONObject expired = new JSONObject(first.boundary.toString());
        expired.getJSONObject("apps").getJSONObject(APP).put("since", 0);
        expired.put("wall", 86_400_000L).put("elapsed", 86_400_000L);
        check(app(estimate(expired, 86_400_000L, 86_401_000L, List.of())).isNull("foreground_duration_ms"), "Expired context survived");
        passed.add("native_continuity_resets_on_gaps_boot_clock_changes_and_age_limit");

        var denied = new LocalInspectionCore.ProjectedEvent("org.private.denied", 400, LocalInspectionCore.Type.RESUME);
        ForegroundContinuity.Result scoped = estimate(null, 100, 1000, List.of(denied, resume(200)));
        check(duration(scoped) == 800 && app(scoped).getInt("transition_count") == 1
            && !scoped.apps.toString().contains("denied") && !scoped.boundary.toString().contains("denied"), "Unselected activity entered continuity");
        passed.add("native_continuity_selected_package_redaction");

        engine.stop();
        shell(tests, "input keyevent 224"); shell(tests, "wm dismiss-keyguard");
        try (var fixture = new OpenClawContractCases.HookFixture()) {
            fixture.respond(200, "{\"ok\":true,\"runId\":\"native-continuity-test\"}");
            shell(tests, "am force-stop " + APP);
            engine.configure(fixture.endpoint(), "q".repeat(43), APP, 60);
            // Start this real usage window immediately before the controlled fixture resumes.
            PublisherStore store = new PublisherStore(context); JSONObject state = engine.snapshot();
            state.put("cursor", System.currentTimeMillis()); store.write(state);
            shell(tests, "am start -W -n " + APP + "/.MainActivity"); Thread.sleep(1200);
            automatic(context, engine);
            check(fixture.count() == 1 && engine.snapshot().getJSONObject("foreground_context").getJSONObject("apps").has(APP),
                "Actual foreground activity did not establish a persisted continuation");
            JSONObject one = observation(fixture.request(0));
            check(one.getJSONObject("observation").getJSONArray("apps").getJSONObject(0).getLong("foreground_duration_ms") > 0,
                "Actual open foreground session has no estimate");
            passed.add("actual_android_usage_source_establishes_open_session_and_acknowledges_it");

            // A new engine reads the real AtomicFile; the fixture stays foreground throughout.
            DeliveryEngine reopened = new DeliveryEngine(context);
            Thread.sleep(1200); automatic(context, reopened);
            check(fixture.count() == 2, "A persisted uninterrupted session did not produce its next request");
            JSONObject two = observation(fixture.request(1));
            JSONObject twoApp = two.getJSONObject("observation").getJSONArray("apps").getJSONObject(0);
            long window = java.time.Instant.parse(two.getJSONObject("window").getString("end")).toEpochMilli()
                - java.time.Instant.parse(two.getJSONObject("window").getString("start")).toEpochMilli();
            check(twoApp.getInt("transition_count") == 0 && twoApp.getLong("foreground_duration_ms") == window
                && two.getLong("sequence") == one.getLong("sequence") + 1
                && !two.getString("event_id").equals(one.getString("event_id"))
                && "unknown".equals(two.getJSONObject("observation").getString("coverage")),
                "Uninterrupted delivery repeated old time/transitions or changed estimate quality");
            passed.add("actual_persisted_continuation_sends_a_new_window_with_no_new_transitions");

            shell(tests, "am start -W -n org.liveabit.publish/.MainActivity"); Thread.sleep(1000);
            automatic(context, reopened);
            check(fixture.count() == 3 && !reopened.snapshot().getJSONObject("foreground_context").getJSONObject("apps").has(APP),
                "Actual pause did not close the retained session");
            Thread.sleep(500); automatic(context, reopened);
            check(fixture.count() == 3, "Closed session kept sending idle observations"); fixture.assertHealthy();
            passed.add("actual_android_pause_stops_subsequent_empty_automatic_requests");
        } finally { engine.stop(); }
        check(!engine.snapshot().has("foreground_context"), "Stop retained selected-app activity context");
        passed.add("native_stop_erases_foreground_continuity");
    }
}
