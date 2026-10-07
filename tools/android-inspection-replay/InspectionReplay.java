import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.liveabit.collector.core.FixtureComparison;
import org.liveabit.collector.core.LocalInspectionCore;

/** Host-only replay of projected owned-fixture observations through the actual native core. */
public final class InspectionReplay {
    private static final long BASE = 1_000_000L;
    private static final long START_ELAPSED = 1_000L;
    private static final long MAX_OFFSET = 3_600_000L;
    private static final int MAX_INPUT_BYTES = 16_384;
    private static final int MAX_EVENTS = 64;
    private static final int MAX_EXHAUSTIVE_PAIR_GROUPS = 12;
    private static final String FIXTURE = FixtureComparison.FIXTURE_PACKAGE;

    private static final class Event {
        final long offset;
        final LocalInspectionCore.Type type;
        Event(long offset, LocalInspectionCore.Type type) {
            this.offset = offset;
            this.type = type;
        }
    }

    private static final class Input {
        final List<Event> events;
        final long comparisonStart;
        final long comparisonEnd;
        final long fixtureDuration;
        final long queryEnd;
        Input(List<Event> events, long start, long end, long duration) {
            this.events = events;
            comparisonStart = start;
            comparisonEnd = end;
            fixtureDuration = duration;
            long last = events.isEmpty() ? 0 : events.get(events.size() - 1).offset;
            queryEnd = Math.max(last + 1, end + 1);
        }
    }

    private InspectionReplay() { }

    public static void main(String[] args) {
        try {
            if (args.length != 0) throw invalid("No arguments are accepted; provide ASCII replay TSV on standard input.");
            Input input = parse(readAscii());
            System.out.println(json(run(input)));
        } catch (Exception exception) {
            System.err.println("Inspection replay failed: " + exception.getMessage());
            System.exit(1);
        }
    }

    private static String readAscii() throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        byte[] buffer = new byte[1024];
        int count;
        while ((count = System.in.read(buffer)) != -1) {
            if (bytes.size() + count > MAX_INPUT_BYTES) throw invalid("Input exceeds 16384 bytes.");
            for (int index = 0; index < count; index++) {
                int value = buffer[index] & 255;
                if (value > 127 || value < 32 && value != 9 && value != 10 && value != 13)
                    throw invalid("Input must contain printable ASCII, tabs and line endings only.");
            }
            bytes.write(buffer, 0, count);
        }
        return new String(bytes.toByteArray(), StandardCharsets.US_ASCII);
    }

    private static Input parse(String raw) {
        String[] all = raw.replace("\r\n", "\n").split("\n", -1);
        int length = all.length;
        if (length > 0 && all[length - 1].isEmpty()) length--;
        if (length < 2 || !all[0].equals("OAP_OWNED_REPLAY_V1"))
            throw invalid("First line must be OAP_OWNED_REPLAY_V1, followed by the four-field header.");
        String[] header = all[1].split("\t", -1);
        if (header.length != 4) throw invalid("Header must contain eventCount, comparisonStartOffset, comparisonEndOffset and fixtureDuration separated by tabs.");
        long count = number(header[0], "eventCount");
        if (count > MAX_EVENTS) throw invalid("eventCount must be between 0 and 64.");
        if (length != count + 2) throw invalid("Expected exactly " + count + " event lines; found " + (length - 2) + ".");
        long start = boundedOffset(header[1], "comparisonStartOffset");
        long end = boundedOffset(header[2], "comparisonEndOffset");
        if (end <= start) throw invalid("Comparison window must be nonempty and ordered.");
        if (end - start > FixtureComparison.MAX_WINDOW_MILLIS) throw invalid("Comparison window must not exceed 600000 ms.");
        long duration = number(header[3], "fixtureDuration");
        if (duration > end - start + LocalInspectionCore.CLOCK_TOLERANCE_MILLIS)
            throw invalid("fixtureDuration exceeds the native comparator's window plus clock tolerance.");
        List<Event> events = new ArrayList<>();
        long previous = -1;
        for (int index = 0; index < count; index++) {
            String[] fields = all[index + 2].split("\t", -1);
            if (fields.length != 2) throw invalid("Event line " + (index + 3) + " must contain offset and RESUME or PAUSE separated by one tab.");
            long offset = boundedOffset(fields[0], "event offset on line " + (index + 3));
            if (offset < previous) throw invalid("Event offsets must be sorted; line " + (index + 3) + " goes backwards.");
            LocalInspectionCore.Type type;
            try {
                type = LocalInspectionCore.Type.valueOf(fields[1]);
            } catch (IllegalArgumentException exception) {
                throw invalid("Event type on line " + (index + 3) + " must be RESUME or PAUSE.");
            }
            events.add(new Event(offset, type));
            previous = offset;
        }
        return new Input(events, start, end, duration);
    }

    private static long number(String text, String field) {
        if (!text.matches("[0-9]{1,19}")) throw invalid(field + " must be a nonnegative ASCII integer.");
        try {
            return Long.parseLong(text);
        } catch (NumberFormatException exception) {
            throw invalid(field + " is too large.");
        }
    }

    private static long boundedOffset(String text, String field) {
        long value = number(text, field);
        if (value > MAX_OFFSET) throw invalid(field + " exceeds the one-hour offset limit (3600000 ms).");
        return value;
    }

    private static Map<String, Object> run(Input input) {
        LocalInspectionCore.DiagnosticReport full = replay(input.events, input.queryEnd);
        Map<String, Object> result = result(full, input);
        List<Map<String, Object>> steps = prefixSteps(input);
        Map<String, Object> permutations = checkPermutations(input, result);
        Map<String, Object> partition = checkPartition(input, full, result);
        Map<String, Object> gap = checkGenuineGap();
        return map(
            "schema", "OAP_OWNED_REPLAY_RESULT_V1",
            "replay_kind", "host_only_actual_native_core_with_synthetic_authority_and_clock",
            "package_name", FIXTURE,
            "synthetic_clock", map("wall_base_millis", BASE, "session_start_wall_millis", BASE - 1,
                "session_start_elapsed_millis", START_ELAPSED, "query_end_offset", input.queryEnd,
                "clock_deltas_paired", true, "actual_android_query_replayed", false),
            "input", map("event_count", input.events.size(), "events", inputEvents(input.events),
                "comparison_start_offset", input.comparisonStart, "comparison_end_offset", input.comparisonEnd,
                "fixture_duration_millis", input.fixtureDuration, "fixture_value_verified", false),
            "result", result,
            "prefix_steps", steps,
            "checks", map("same_time_permutations", permutations, "complete_group_query_partition", partition,
                "genuine_pause_gap_no_fill", gap),
            "limitations", Arrays.asList("Offsets and consent/query/clock anchors are synthetic replay inputs, not authenticated Android observations.",
                "This runner does not read an Android device, establish source completeness, or validate an APK.",
                "Retained durations remain unverified diagnostics; null is unknown rather than zero use.",
                "Replay checks do not establish timing accuracy, current attention, lower bounds, or OAP eligibility."));
    }

    private static LocalInspectionCore started() {
        LocalInspectionCore core = new LocalInspectionCore();
        core.start(Collections.singleton(FIXTURE), new LocalInspectionCore.ClockSample(BASE - 1, START_ELAPSED));
        return core;
    }

    private static LocalInspectionCore.ClockSample clock(long offset) {
        return new LocalInspectionCore.ClockSample(BASE + offset, START_ELAPSED + offset + 1);
    }

    private static void commit(LocalInspectionCore core, List<Event> events, long end) {
        LocalInspectionCore.QueryTicket ticket = core.beginQuery(clock(end));
        check(ticket != null, "Synthetic query ticket was unavailable.");
        List<LocalInspectionCore.ProjectedEvent> projected = new ArrayList<>();
        for (Event event : events) projected.add(new LocalInspectionCore.ProjectedEvent(FIXTURE, BASE + event.offset, event.type));
        LocalInspectionCore.CommitResult accepted = core.finishQuery(ticket, clock(end), projected, LocalInspectionCore.SourceStatus.AVAILABLE);
        check(accepted.accepted && accepted.acceptedEvents == events.size(), "Native core rejected or filtered the synthetic projected query.");
    }

    private static LocalInspectionCore.DiagnosticReport replay(List<Event> events, long end) {
        LocalInspectionCore core = started();
        commit(core, events, end);
        return core.report(clock(end));
    }

    private static List<Map<String, Object>> prefixSteps(Input input) {
        LocalInspectionCore core = started();
        LocalInspectionCore.DiagnosticReport previous = core.report(new LocalInspectionCore.ClockSample(BASE - 1, START_ELAPSED));
        List<Map<String, Object>> steps = new ArrayList<>();
        for (int first = 0; first < input.events.size();) {
            int end = groupEnd(input.events, first);
            List<Event> group = input.events.subList(first, end);
            long cutoff = group.get(0).offset + 1;
            commit(core, group, cutoff);
            LocalInspectionCore.DiagnosticReport current = core.report(clock(cutoff));
            LocalInspectionCore.PackageDiagnostic before = packageDiagnostic(previous);
            LocalInspectionCore.PackageDiagnostic after = packageDiagnostic(current);
            List<Map<String, Object>> beforeIntervals = intervals(before.closedEstimates);
            List<Map<String, Object>> afterIntervals = intervals(after.closedEstimates);
            List<Map<String, Object>> discarded = difference(beforeIntervals, afterIntervals);
            List<Map<String, Object>> added = difference(afterIntervals, beforeIntervals);
            String action;
            String explanation;
            if (group.size() > 1) {
                check(after.ambiguityReasons.contains("ambiguous_same_timestamp_transitions"), "Native same-time ambiguity reason missing.");
                action = "discard_and_reset_for_same_timestamp_group";
                explanation = "The native policy treats every multi-record timestamp group as ambiguous, clears earlier closed estimates and resets pairing state without ordering its records.";
            } else if (group.get(0).type == LocalInspectionCore.Type.RESUME) {
                action = before.ambiguityReasons.contains("open_transition_sequence") ? "resume_while_sequence_open" : "open_sequence";
                explanation = "The native policy records a resume; any package-level overlap remains ambiguous.";
            } else if (!before.ambiguityReasons.contains("open_transition_sequence")) {
                check(after.ambiguityReasons.contains("unmatched_pause_invalidates_prior_estimates"), "Native unmatched-pause reason missing.");
                action = "discard_for_unmatched_pause";
                explanation = "The native policy has no matching open resume; a missing start can precede earlier phases, so earlier closed estimates are discarded.";
            } else if (!added.isEmpty()) {
                action = "close_inferred_interval";
                explanation = "A returned pause closes the native package-level sequence; its duration remains an unverified diagnostic.";
            } else {
                action = "pause_with_sequence_still_open";
                explanation = "The native package-level overlap count remains open; no query boundary is fabricated as a closing event.";
            }
            steps.add(map("group_offset", group.get(0).offset, "group_complete", true,
                "input", inputEvents(group), "native_event_count", current.snapshot.eventCount,
                "action", action, "explanation", explanation,
                "retained_intervals", afterIntervals, "discarded_intervals", discarded,
                "newly_retained_intervals", added, "retained_duration_millis", after.estimatedDurationMillis,
                "native_reasons", after.ambiguityReasons,
                "coverage_unknown", current.coverageUnknown, "duration_verified", false));
            previous = current;
            first = end;
        }
        return steps;
    }

    private static Map<String, Object> checkPermutations(Input input, Map<String, Object> expected) {
        List<Integer> pairStarts = new ArrayList<>();
        int multiRecordGroups = 0;
        int largerGroups = 0;
        for (int first = 0; first < input.events.size();) {
            int end = groupEnd(input.events, first);
            if (end - first > 1) multiRecordGroups++;
            if (end - first == 2 && input.events.get(first).type != input.events.get(first + 1).type) pairStarts.add(first);
            if (end - first > 2) largerGroups++;
            first = end;
        }
        boolean exhaustive = pairStarts.size() <= MAX_EXHAUSTIVE_PAIR_GROUPS;
        int checked = 0;
        if (exhaustive) {
            int combinations = 1 << pairStarts.size();
            for (int mask = 0; mask < combinations; mask++) {
                List<Event> permuted = new ArrayList<>(input.events);
                for (int pair = 0; pair < pairStarts.size(); pair++) if ((mask & 1 << pair) != 0) swap(permuted, pairStarts.get(pair));
                checkEquivalent(input, expected, permuted);
                checked++;
            }
        } else {
            checkEquivalent(input, expected, input.events);
            checked++;
            for (int first = 0; first < pairStarts.size(); first++) {
                List<Event> single = new ArrayList<>(input.events);
                swap(single, pairStarts.get(first));
                checkEquivalent(input, expected, single);
                checked++;
                for (int second = first + 1; second < pairStarts.size(); second++) {
                    List<Event> pair = new ArrayList<>(single);
                    swap(pair, pairStarts.get(second));
                    checkEquivalent(input, expected, pair);
                    checked++;
                }
            }
        }
        int largerGroupReversals = 0;
        for (int first = 0; first < input.events.size();) {
            int end = groupEnd(input.events, first);
            if (end - first > 2) {
                List<Event> reversed = new ArrayList<>(input.events);
                Collections.reverse(reversed.subList(first, end));
                checkEquivalent(input, expected, reversed);
                largerGroupReversals++;
            }
            first = end;
        }
        return map("passed", true, "multi_record_groups", multiRecordGroups,
            "mixed_pair_groups", pairStarts.size(), "pair_group_combinations_checked", checked,
            "all_mixed_pair_combinations_checked", exhaustive,
            "pair_check_strategy", exhaustive ? "all_combinations" : "baseline_every_single_and_every_two_pair_reversal",
            "exhaustive_pair_group_limit", MAX_EXHAUSTIVE_PAIR_GROUPS,
            "larger_groups", largerGroups, "larger_group_reversals_checked", largerGroupReversals,
            "all_larger_group_permutations_checked", largerGroups == 0,
            "ordering_is_not_trusted", true);
    }

    private static void checkEquivalent(Input input, Map<String, Object> expected, List<Event> events) {
        Map<String, Object> actual = result(replay(events, input.queryEnd), input);
        check(expected.equals(actual), "Same-time permutation changed the native diagnostic or comparison result.");
    }

    private static void swap(List<Event> events, int first) {
        Collections.swap(events, first, first + 1);
    }

    private static Map<String, Object> checkPartition(Input input, LocalInspectionCore.DiagnosticReport full, Map<String, Object> expected) {
        int groups = 0;
        for (int first = 0; first < input.events.size();) {
            groups++;
            first = groupEnd(input.events, first);
        }
        List<Map<String, Object>> strategies = new ArrayList<>();
        for (int batch : Arrays.asList(1, 2, 3)) {
            LocalInspectionCore core = started();
            long lastEnd = -1;
            int queries = 0;
            for (int first = 0; first < input.events.size();) {
                int end = first;
                for (int consumed = 0; consumed < batch && end < input.events.size(); consumed++) end = groupEnd(input.events, end);
                lastEnd = input.events.get(end - 1).offset + 1;
                commit(core, input.events.subList(first, end), lastEnd);
                queries++;
                first = end;
            }
            if (lastEnd < input.queryEnd) {
                commit(core, Collections.emptyList(), input.queryEnd);
                queries++;
            }
            LocalInspectionCore.DiagnosticReport partitioned = core.report(clock(input.queryEnd));
            check(expected.equals(result(partitioned, input)), "Complete timestamp-group query partition changed native diagnostics or comparison.");
            check(full.snapshot.eventCount == partitioned.snapshot.eventCount
                && full.snapshot.queryCursorWallMillis == partitioned.snapshot.queryCursorWallMillis,
                "Complete-group partition changed event retention or final query cursor.");
            strategies.add(map("complete_groups_per_query", batch, "queries", queries, "passed", true));
        }
        return map("passed", true, "complete_timestamp_groups", groups,
            "strategies", strategies,
            "same_timestamp_group_never_split", true, "report_and_comparison_equal", true,
            "retained_event_count_equal", true, "final_query_cursor_equal", true,
            "actual_android_query_partition_verified", false);
    }

    private static Map<String, Object> checkGenuineGap() {
        List<Event> events = Arrays.asList(new Event(0, LocalInspectionCore.Type.RESUME), new Event(10, LocalInspectionCore.Type.PAUSE),
            new Event(20, LocalInspectionCore.Type.RESUME), new Event(30, LocalInspectionCore.Type.PAUSE));
        LocalInspectionCore.PackageDiagnostic item = packageDiagnostic(replay(events, 100));
        List<Map<String, Object>> expected = Arrays.asList(interval(0, 10), interval(20, 30));
        check(intervals(item.closedEstimates).equals(expected) && Objects.equals(item.estimatedDurationMillis, 20L),
            "Native core filled a genuine 10 ms pause gap.");
        return map("passed", true, "synthetic_intervals", expected, "retained_duration_millis", item.estimatedDurationMillis,
            "excluded_pause_gaps_millis", Arrays.asList(10), "synthetic_check_only", true);
    }

    private static Map<String, Object> result(LocalInspectionCore.DiagnosticReport report, Input input) {
        LocalInspectionCore.PackageDiagnostic item = packageDiagnostic(report);
        FixtureComparison.Result comparison = FixtureComparison.compare(report, BASE + input.comparisonStart,
            BASE + input.comparisonEnd, input.fixtureDuration);
        check(comparison.status != FixtureComparison.Status.INVALID, "Validated replay window failed native comparison: " + comparison.reason);
        return map("retained_event_count", report.snapshot.eventCount, "intervals", intervals(item.closedEstimates),
            "estimated_duration_millis", item.estimatedDurationMillis, "reasons", item.ambiguityReasons,
            "coverage_unknown", report.coverageUnknown, "physical_android_verified", report.physicalAndroidVerified,
            "oap_summary_eligible", report.oapSummaryEligible, "duration_verified", false,
            "comparison", map("status", comparison.status.name(), "reason", comparison.reason.name(), "accepted", comparison.accepted,
                "candidate_duration_millis", comparison.candidateDurationMillis, "signed_difference_millis", comparison.signedDifferenceMillis,
                "fixture_duration_millis", comparison.fixtureDurationMillis, "overlapping_closed_intervals", comparison.overlappingClosedIntervals,
                "native_reasons", comparison.ambiguityReasons, "coverage_unknown", comparison.coverageUnknown,
                "physical_android_verified", comparison.physicalAndroidVerified, "physical_device_tested", false,
                "oap_summary_eligible", comparison.oapSummaryEligible,
                "fixture_value_verified", comparison.fixtureValueVerified, "duration_verified", false));
    }

    private static LocalInspectionCore.PackageDiagnostic packageDiagnostic(LocalInspectionCore.DiagnosticReport report) {
        check(report.packages.size() == 1 && FIXTURE.equals(report.packages.get(0).packageName), "Replay scope drifted from the fixed owned fixture.");
        return report.packages.get(0);
    }

    private static int groupEnd(List<Event> events, int first) {
        int end = first + 1;
        while (end < events.size() && events.get(end).offset == events.get(first).offset) end++;
        return end;
    }

    private static List<Map<String, Object>> inputEvents(List<Event> events) {
        List<Map<String, Object>> values = new ArrayList<>();
        for (Event event : events) values.add(map("offset", event.offset, "type", event.type.name()));
        return values;
    }

    private static List<Map<String, Object>> intervals(List<LocalInspectionCore.ClosedEstimate> estimates) {
        List<Map<String, Object>> values = new ArrayList<>();
        for (LocalInspectionCore.ClosedEstimate estimate : estimates)
            values.add(interval(estimate.startInclusive - BASE, estimate.endExclusive - BASE));
        return values;
    }

    private static Map<String, Object> interval(long start, long end) {
        return map("start_offset_millis", start, "end_offset_millis", end, "duration_millis", end - start);
    }

    private static List<Map<String, Object>> difference(List<Map<String, Object>> first, List<Map<String, Object>> second) {
        List<Map<String, Object>> values = new ArrayList<>();
        for (Map<String, Object> value : first) if (!second.contains(value)) values.add(value);
        return values;
    }

    private static Map<String, Object> map(Object... pairs) {
        Map<String, Object> value = new LinkedHashMap<>();
        for (int index = 0; index < pairs.length; index += 2) value.put((String) pairs[index], pairs[index + 1]);
        return value;
    }

    private static String json(Object value) {
        if (value == null) return "null";
        if (value instanceof String) {
            StringBuilder out = new StringBuilder("\"");
            for (char character : ((String) value).toCharArray()) {
                if (character == '\\' || character == '"') out.append('\\').append(character);
                else if (character < 32) out.append(String.format("\\u%04x", (int) character));
                else out.append(character);
            }
            return out.append('"').toString();
        }
        if (value instanceof Number || value instanceof Boolean) return value.toString();
        if (value instanceof Map) {
            StringBuilder out = new StringBuilder("{");
            boolean comma = false;
            for (Map.Entry<?, ?> entry : ((Map<?, ?>) value).entrySet()) {
                if (comma) out.append(',');
                out.append(json(entry.getKey())).append(':').append(json(entry.getValue()));
                comma = true;
            }
            return out.append('}').toString();
        }
        if (value instanceof Iterable) {
            StringBuilder out = new StringBuilder("[");
            boolean comma = false;
            for (Object item : (Iterable<?>) value) {
                if (comma) out.append(',');
                out.append(json(item));
                comma = true;
            }
            return out.append(']').toString();
        }
        throw invalid("Unsupported JSON output value.");
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new IllegalStateException(message);
    }

    private static IllegalArgumentException invalid(String message) {
        return new IllegalArgumentException(message);
    }
}
