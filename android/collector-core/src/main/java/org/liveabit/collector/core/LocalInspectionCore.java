package org.liveabit.collector.core;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.regex.Pattern;

/**
 * Local-only, dependency-free inspection state. This is not an OAP publisher.
 * Android callers must project only selected package/time/resume-or-pause fields.
 * Activity stays in memory: only selected scope and generation may be persisted.
 * Every timestamp interval is half-open. No query establishes initial state or
 * completeness; balanced transition estimates are always explicitly unverified.
 */
public final class LocalInspectionCore {
    public static final int MAX_PACKAGES = 32;
    public static final int MAX_EVENTS = 4096;
    public static final int MAX_RECENT_EVENTS = 64;
    public static final long MAX_SESSION_MILLIS = 24L * 60 * 60 * 1000;
    public static final long CLOCK_TOLERANCE_MILLIS = 2000;
    private static final long MAX_WALL_MILLIS = 253402300799999L;
    private static final Pattern PACKAGE = Pattern.compile("[A-Za-z][A-Za-z0-9_]*(?:\\.[A-Za-z][A-Za-z0-9_]*)+");

    public enum Type { RESUME, PAUSE }
    public enum SourceStatus { AVAILABLE, UNAVAILABLE, PERMISSION_DENIED, DEVICE_LOCKED, TRUNCATED }

    public static final class ClockSample {
        public final long wallMillis;
        public final long elapsedMillis;
        public ClockSample(long wallMillis, long elapsedMillis) {
            if (wallMillis < 0 || wallMillis > MAX_WALL_MILLIS || elapsedMillis < 0)
                throw invalid();
            this.wallMillis = wallMillis;
            this.elapsedMillis = elapsedMillis;
        }
    }

    public static final class ProjectedEvent {
        public final String packageName;
        public final long timestampMillis;
        public final Type type;
        public ProjectedEvent(String packageName, long timestampMillis, Type type) {
            // Denied package records are rejected before the other values matter.
            this.packageName = packageName;
            this.timestampMillis = timestampMillis;
            this.type = type;
        }
    }

    public static final class Snapshot {
        public final long generation;
        public final boolean active;
        public final List<String> selectedPackages;
        public final long sessionStartWallMillis;
        public final long sessionStartElapsedMillis;
        public final long lastWallMillis;
        public final long lastElapsedMillis;
        public final long queryCursorWallMillis;
        public final int eventCount;
        public final String statusReason;
        private Snapshot(LocalInspectionCore core) {
            generation = core.generation;
            active = core.active;
            selectedPackages = immutable(core.selectedPackages);
            sessionStartWallMillis = core.sessionStartWallMillis;
            sessionStartElapsedMillis = core.sessionStartElapsedMillis;
            lastWallMillis = core.lastWallMillis;
            lastElapsedMillis = core.lastElapsedMillis;
            queryCursorWallMillis = core.queryCursorWallMillis;
            eventCount = core.events.size();
            statusReason = core.statusReason;
        }
    }

    public static final class QueryTicket {
        public final long generation;
        public final long startInclusive;
        public final long endExclusive;
        public final List<String> selectedPackages;
        private QueryTicket(LocalInspectionCore core, long endExclusive) {
            generation = core.generation;
            startInclusive = core.queryCursorWallMillis;
            this.endExclusive = endExclusive;
            selectedPackages = immutable(core.selectedPackages);
        }
    }

    public static final class CommitResult {
        public final boolean accepted;
        public final String reason;
        public final int acceptedEvents;
        public final Snapshot snapshot;
        private CommitResult(boolean accepted, String reason, int acceptedEvents, LocalInspectionCore core) {
            this.accepted = accepted;
            this.reason = reason;
            this.acceptedEvents = acceptedEvents;
            this.snapshot = new Snapshot(core);
        }
    }

    public static final class ClosedEstimate {
        public final long startInclusive;
        public final long endExclusive;
        public final long durationMillis;
        private ClosedEstimate(long startInclusive, long endExclusive) {
            this.startInclusive = startInclusive;
            this.endExclusive = endExclusive;
            durationMillis = endExclusive - startInclusive;
        }
    }

    public static final class PackageDiagnostic {
        public final String packageName;
        public final int eventCount;
        public final List<ClosedEstimate> closedEstimates;
        /** null means no closed estimate, never proof of zero usage. */
        public final Long estimatedDurationMillis;
        public final boolean emptyQueryIsUnknown = true;
        public final List<String> ambiguityReasons;
        private PackageDiagnostic(String packageName, int eventCount, List<ClosedEstimate> estimates, Set<String> reasons) {
            this.packageName = packageName;
            this.eventCount = eventCount;
            closedEstimates = immutable(estimates);
            long total = 0;
            for (ClosedEstimate estimate : estimates) total += estimate.durationMillis;
            estimatedDurationMillis = estimates.isEmpty() ? null : total;
            ambiguityReasons = immutable(reasons);
        }
    }

    public static final class DiagnosticReport {
        public final Snapshot snapshot;
        public final List<PackageDiagnostic> packages;
        /** Latest selected-package projected fields only, most recent first. */
        public final List<ProjectedEvent> recentEvents;
        public final boolean coverageUnknown = true;
        public final boolean physicalAndroidVerified = false;
        public final boolean oapSummaryEligible = false;
        public final String warning = "Diagnostic transition estimates only. Initial state and source completeness are unknown; absence of records does not mean zero usage.";
        private DiagnosticReport(LocalInspectionCore core, List<PackageDiagnostic> packages) {
            snapshot = new Snapshot(core);
            this.packages = immutable(packages);
            List<ProjectedEvent> recent = new ArrayList<>(core.events);
            recent.sort(Comparator.comparingLong((ProjectedEvent event) -> event.timestampMillis).reversed()
                .thenComparing(event -> event.packageName).thenComparing(event -> event.type));
            recentEvents = immutable(recent.subList(0, Math.min(recent.size(), MAX_RECENT_EVENTS)));
        }
    }

    private long generation;
    private boolean active;
    private Set<String> selectedPackages = new TreeSet<>();
    private long sessionStartWallMillis;
    private long sessionStartElapsedMillis;
    private long lastWallMillis;
    private long lastElapsedMillis;
    private long queryCursorWallMillis;
    private String statusReason = "not_started";
    private final List<ProjectedEvent> events = new ArrayList<>();
    private QueryTicket pending;

    /** Typed package IDs only; no installed-application inventory is needed. */
    public static Set<String> parsePackages(String input) {
        if (input == null || input.length() > MAX_PACKAGES * 130) throw invalid();
        Set<String> result = new TreeSet<>();
        for (String value : input.split("[\\s,]+")) {
            if (!value.isEmpty()) result.add(value);
        }
        return Collections.unmodifiableSet(validatePackages(result, false));
    }

    /** Start/change selection is a fresh explicit session and erases old activity. */
    public synchronized Snapshot start(Set<String> packages, ClockSample now) {
        Set<String> next = validatePackages(packages, false);
        requireClock(now);
        bumpGeneration();
        selectedPackages = next;
        events.clear();
        pending = null;
        active = true;
        sessionStartWallMillis = lastWallMillis = queryCursorWallMillis = now.wallMillis;
        sessionStartElapsedMillis = lastElapsedMillis = now.elapsedMillis;
        statusReason = "active_unknown_coverage";
        return new Snapshot(this);
    }

    /** Stop immediately invalidates reads and erases all activity in memory. */
    public synchronized Snapshot pause(ClockSample now) {
        requireClock(now);
        stop("paused", now);
        return new Snapshot(this);
    }

    public synchronized Snapshot clear(ClockSample now) {
        requireClock(now);
        stop("cleared", now);
        selectedPackages.clear();
        return new Snapshot(this);
    }

    /** Restore preferences only. A process restart never restores active collection. */
    public synchronized Snapshot restart(long persistedGeneration, Set<String> persistedPackages, ClockSample now) {
        requireClock(now);
        if (persistedGeneration < 0 || persistedGeneration >= Long.MAX_VALUE - 1) throw invalid();
        Set<String> next = validatePackages(persistedPackages, true);
        generation = Math.max(generation, persistedGeneration);
        selectedPackages = next;
        stop("restart_requires_explicit_start", now);
        sessionStartWallMillis = sessionStartElapsedMillis = queryCursorWallMillis = 0;
        return new Snapshot(this);
    }

    public synchronized Snapshot snapshot() { return new Snapshot(this); }

    /** null means inactive, discontinuous clock, expired, empty interval, or an in-flight query. */
    public synchronized QueryTicket beginQuery(ClockSample now) {
        requireClock(now);
        if (!maintain(now) || pending != null || now.wallMillis <= queryCursorWallMillis) return null;
        pending = new QueryTicket(this, now.wallMillis);
        return pending;
    }

    /** All validation happens before any projected event becomes visible. */
    public synchronized CommitResult finishQuery(QueryTicket ticket, ClockSample now,
            List<ProjectedEvent> projected, SourceStatus sourceStatus) {
        requireClock(now);
        if (!maintain(now)) return result(false, statusReason, 0);
        if (ticket == null || ticket != pending || ticket.generation != generation)
            return result(false, "stale_or_foreign_query", 0);
        pending = null;
        if (sourceStatus == SourceStatus.PERMISSION_DENIED) {
            stop("usage_access_lost", now);
            return result(false, statusReason, 0);
        }
        if (sourceStatus == SourceStatus.DEVICE_LOCKED) {
            stop("device_locked_requires_explicit_start", now);
            return result(false, statusReason, 0);
        }
        if (sourceStatus == SourceStatus.TRUNCATED || projected != null && projected.size() > MAX_EVENTS) {
            stop("source_limit_exceeded", now);
            return result(false, statusReason, 0);
        }
        if (sourceStatus != SourceStatus.AVAILABLE || projected == null) {
            statusReason = "source_unavailable_usage_unknown";
            return result(false, statusReason, 0);
        }
        List<ProjectedEvent> accepted = new ArrayList<>();
        int scanned = 0;
        for (ProjectedEvent event : projected) {
            if (++scanned > MAX_EVENTS) {
                stop("source_limit_exceeded", now);
                return result(false, statusReason, 0);
            }
            if (event == null) return result(false, "invalid_projected_record", 0);
            if (event.packageName == null || !selectedPackages.contains(event.packageName)) continue;
            if (event.timestampMillis < ticket.startInclusive || event.timestampMillis >= ticket.endExclusive)
                continue;
            if (event.type == null) return result(false, "invalid_projected_record", 0);
            accepted.add(new ProjectedEvent(event.packageName, event.timestampMillis, event.type));
        }
        if (accepted.size() > MAX_EVENTS - events.size()) {
            stop("session_event_limit_exceeded", now);
            return result(false, statusReason, 0);
        }
        events.addAll(accepted);
        queryCursorWallMillis = ticket.endExclusive;
        statusReason = "active_unknown_coverage";
        return result(true, "accepted_diagnostic_only", accepted.size());
    }

    /** Cancellation leaves the cursor unchanged so the same interval can be queried again. */
    public synchronized void cancelQuery(QueryTicket ticket) {
        if (ticket != null && ticket == pending) pending = null;
    }

    public synchronized DiagnosticReport report(ClockSample now) {
        requireClock(now);
        maintain(now);
        Map<String, List<ProjectedEvent>> byPackage = new TreeMap<>();
        for (String selected : selectedPackages) byPackage.put(selected, new ArrayList<>());
        for (ProjectedEvent event : events) byPackage.get(event.packageName).add(event);
        List<PackageDiagnostic> packages = new ArrayList<>();
        for (Map.Entry<String, List<ProjectedEvent>> item : byPackage.entrySet()) {
            List<ProjectedEvent> records = item.getValue();
            records.sort(Comparator.comparingLong(event -> event.timestampMillis));
            List<ClosedEstimate> estimates = new ArrayList<>();
            Set<String> reasons = new LinkedHashSet<>();
            reasons.add("unknown_initial_state");
            reasons.add("unverified_source_continuity");
            int count = 0;
            long opening = -1;
            for (int index = 0; index < records.size();) {
                ProjectedEvent event = records.get(index);
                int end = index + 1;
                while (end < records.size() && records.get(end).timestampMillis == event.timestampMillis) end++;
                if (end - index > 1) {
                    // Duplicate-looking transitions and different activity instances cannot be distinguished.
                    estimates.clear(); count = 0; opening = -1;
                    reasons.add("ambiguous_same_timestamp_transitions");
                } else if (event.type == Type.RESUME) {
                    if (count == 0) opening = event.timestampMillis;
                    else reasons.add("package_level_overlap_or_missing_pause");
                    count++;
                } else if (count == 0) {
                    // A missing start could precede older closed estimates: no independent state bounds it.
                    estimates.clear(); opening = -1;
                    reasons.add("unmatched_pause_invalidates_prior_estimates");
                } else if (--count == 0) {
                    if (opening < event.timestampMillis) estimates.add(new ClosedEstimate(opening, event.timestampMillis));
                    opening = -1;
                }
                index = end;
            }
            if (count > 0) reasons.add("open_transition_sequence");
            if (records.isEmpty()) reasons.add("no_records_usage_unknown");
            packages.add(new PackageDiagnostic(item.getKey(), records.size(), estimates, reasons));
        }
        return new DiagnosticReport(this, packages);
    }

    private boolean maintain(ClockSample now) {
        if (!active) return false;
        long wallDelta = now.wallMillis - lastWallMillis;
        long elapsedDelta = now.elapsedMillis - lastElapsedMillis;
        if (wallDelta < 0 || elapsedDelta < 0 || differenceExceeds(wallDelta, elapsedDelta, CLOCK_TOLERANCE_MILLIS)) {
            stop("clock_discontinuity_requires_explicit_start", now);
            return false;
        }
        if (now.elapsedMillis - sessionStartElapsedMillis >= MAX_SESSION_MILLIS
                || now.wallMillis - sessionStartWallMillis >= MAX_SESSION_MILLIS) {
            stop("session_expired_activity_erased", now);
            return false;
        }
        lastWallMillis = now.wallMillis;
        lastElapsedMillis = now.elapsedMillis;
        return true;
    }

    private void stop(String reason, ClockSample now) {
        // Even an exhausted counter must permit Stop/Clear to erase activity.
        if (generation < Long.MAX_VALUE - 1) generation++;
        else reason = "generation_exhausted_activity_erased";
        active = false;
        events.clear();
        pending = null;
        lastWallMillis = now.wallMillis;
        lastElapsedMillis = now.elapsedMillis;
        statusReason = reason;
    }

    private void bumpGeneration() {
        if (generation >= Long.MAX_VALUE - 1) {
            active = false;
            events.clear();
            pending = null;
            statusReason = "generation_exhausted_activity_erased";
            throw new IllegalStateException("Inspection generation exhausted.");
        }
        generation++;
    }
    private CommitResult result(boolean accepted, String reason, int size) {
        return new CommitResult(accepted, reason, size, this);
    }
    private static void requireClock(ClockSample now) { if (now == null) throw invalid(); }
    private static boolean differenceExceeds(long left, long right, long limit) {
        // Both deltas are nonnegative here; subtraction cannot overflow.
        return left >= right ? left - right > limit : right - left > limit;
    }
    private static Set<String> validatePackages(Set<String> values, boolean allowEmpty) {
        if (values == null || values.size() > MAX_PACKAGES || !allowEmpty && values.isEmpty()) throw invalid();
        Set<String> result = new TreeSet<>();
        int scanned = 0;
        for (String value : values) {
            if (++scanned > MAX_PACKAGES) throw invalid();
            if (value == null || value.length() > 128 || !PACKAGE.matcher(value).matches()) throw invalid();
            result.add(value);
        }
        if (!allowEmpty && result.isEmpty()) throw invalid();
        return result;
    }
    private static IllegalArgumentException invalid() {
        return new IllegalArgumentException("Invalid local inspection input.");
    }
    private static <T> List<T> immutable(Iterable<T> values) {
        List<T> copy = new ArrayList<>();
        for (T value : values) copy.add(value);
        return Collections.unmodifiableList(copy);
    }
}
