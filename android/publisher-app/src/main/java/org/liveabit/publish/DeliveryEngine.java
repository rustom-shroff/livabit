package org.liveabit.publish;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.SystemClock;
import android.provider.Settings;
import org.json.JSONArray;
import org.json.JSONObject;
import org.liveabit.collector.core.LocalInspectionCore;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Set;
import java.util.UUID;

/** Native Android delivery, durable bounded pending events and OS notifications. */
final class DeliveryEngine {
    static final int PERIODIC_JOB = 310, OUTAGE_JOB = 311, OUTAGE_NOTIFICATION = 312;
    static final String CHANNEL = "receiver-health";
    private final Context context;
    private final PublisherStore store;
    private volatile HttpURLConnection connection;
    private boolean running;
    DeliveryEngine(Context context) { this.context = context.getApplicationContext(); store = new PublisherStore(this.context); }

    synchronized JSONObject snapshot() throws Exception { return store.read(); }
    synchronized void configure(String url, String token, String selection, int minutes) throws Exception {
        Set<String> packages = validateConfiguration(url, token, selection, minutes);
        JSONObject previous = store.read();
        if (matchesConfiguration(previous, url, token, packages)) {
            previous.put("alert_minutes", minutes); store.write(previous);
            restoreScheduling(); return;
        }
        JSONObject state = PublisherStore.empty().put("enabled", true).put("url", url)
            .put("key", LocalSecret.seal(token)).put("packages", new JSONArray(packages))
            .put("alert_minutes", minutes).put("cursor", System.currentTimeMillis() - 900_000)
            .put("status", OpenClawWebhook.isEndpoint(url)
                ? "Sharing enabled — waiting for OpenClaw to accept activity"
                : "Sharing enabled — waiting for receiver acknowledgement");
        store.write(state); disconnect(); cancelAlert(); schedulePeriodic();
    }
    synchronized int pendingToClear(String url, String token, String selection, int minutes) throws Exception {
        Set<String> packages = validateConfiguration(url, token, selection, minutes);
        JSONObject state = store.read();
        return matchesConfiguration(state, url, token, packages) ? 0 : prune(state.getJSONArray("pending")).length();
    }
    private static Set<String> validateConfiguration(String url, String token, String selection, int minutes) {
        validateEndpoint(url);
        if (token == null || !token.matches("[A-Za-z0-9_-]{32,256}")) throw new IllegalArgumentException("Paste the receiver connection key.");
        if (minutes < 1 || minutes > 1440) throw new IllegalArgumentException("Choose between 1 and 1440 minutes.");
        return LocalInspectionCore.parsePackages(selection);
    }
    private static boolean matchesConfiguration(JSONObject state, String url, String token, Set<String> packages) throws Exception {
        return state.getBoolean("enabled") && url.equals(state.getString("url"))
            && packages.equals(LocalInspectionCore.parsePackages(UsageCollector.join(state.getJSONArray("packages"))))
            && token.equals(LocalSecret.open(state.getString("key")));
    }
    synchronized void updateAlert(int minutes) throws Exception {
        if (minutes < 1 || minutes > 1440) throw new IllegalArgumentException("Choose between 1 and 1440 minutes.");
        JSONObject state = store.read(); state.put("alert_minutes", minutes); store.write(state);
        checkHealth();
    }
    synchronized void stop() throws Exception {
        JSONObject state = store.read(); state.put("enabled", false).put("pending", new JSONArray())
            .put("failure_since", 0).put("outage_notified", false).put("status", "Sharing stopped — pending activity cleared");
        store.write(state); disconnect(); cancelAlert();
        JobScheduler jobs = context.getSystemService(JobScheduler.class); jobs.cancel(PERIODIC_JOB); jobs.cancel(OUTAGE_JOB);
    }
    private void disconnect() { HttpURLConnection active = connection; if (active != null) active.disconnect(); }
    void cycle(boolean collect) {
        synchronized (this) { if (running) return; running = true; }
        try {
            JSONObject captured;
            synchronized (this) { captured = store.read(); }
            if (!captured.getBoolean("enabled")) return;
            if (!UsageCollector.permitted(context)) { stop(); setStatus("Usage access is off — sharing stopped"); return; }
            if (collect) {
                JSONObject event = UsageCollector.collect(context, captured, System.currentTimeMillis());
                synchronized (this) {
                    JSONObject state = store.read();
                    if (!sameSession(state, captured)) return;
                    JSONArray pending = prune(state.getJSONArray("pending"));
                    if (event != null && pending.length() < 64) {
                        String observation = OapObservation.encode(event);
                        String body = OpenClawWebhook.isEndpoint(state.getString("url"))
                            ? OpenClawWebhook.wrap(observation) : observation;
                        pending.put(new JSONObject().put("event_id", event.getString("event_id")).put("body", body)
                            .put("expires_at", event.getString("expires_at")));
                        state.put("cursor", Instant.parse(event.getJSONObject("window").getString("end")).toEpochMilli())
                            .put("sequence", event.getLong("sequence"));
                    }
                    state.put("pending", pending); store.write(state);
                }
            }
            // Four pages per wake keep background work bounded; later wakes drain the same identities.
            for (int index = 0; index < 4; index++) {
                JSONObject state, item;
                synchronized (this) {
                    state = store.read(); if (!sameSession(state, captured)) return;
                    JSONArray pending = prune(state.getJSONArray("pending")); state.put("pending", pending); store.write(state);
                    if (pending.length() == 0) break; item = pending.getJSONObject(0);
                }
                Receipt receipt;
                try { receipt = post(state, item); } catch (Exception error) { receipt = new Receipt(Outcome.UNREACHABLE); }
                Outcome outcome = receipt.outcome;
                boolean accepted = outcome == Outcome.ACCEPTED || outcome == Outcome.OPENCLAW_ACCEPTED;
                synchronized (this) {
                    JSONObject latest = store.read(); if (!sameSession(latest, state)) return;
                    if (accepted) {
                        JSONArray remaining = new JSONArray();
                        JSONArray pending = latest.getJSONArray("pending");
                        for (int next = 0; next < pending.length(); next++) {
                            JSONObject value = pending.getJSONObject(next);
                            if (!value.getString("event_id").equals(item.getString("event_id"))) remaining.put(value);
                        }
                        latest.put("pending", remaining).put("last_ack", System.currentTimeMillis())
                            .put("failure_since", 0).put("outage_notified", false).put("status", outcome.message);
                        if (receipt.runId != null) latest.put("last_run_id", receipt.runId);
                        store.write(latest); cancelAlert();
                    } else {
                        if (latest.optLong("failure_since") == 0) latest.put("failure_since", System.currentTimeMillis())
                            .put("failure_elapsed", SystemClock.elapsedRealtime()).put("boot_count", bootCount());
                        latest.put("status", outcome.message + " — activity saved for retry"); store.write(latest);
                    }
                }
                checkHealth(); if (!accepted) break;
            }
        } catch (Exception error) {
            try { setStatus("Unable to read or save activity. Check usage access and try again."); } catch (Exception ignored) {}
        } finally {
            connection = null;
            synchronized (this) { running = false; }
            try { checkHealth(); } catch (Exception ignored) {}
        }
    }
    private enum Outcome {
        ACCEPTED("Receiver acknowledged activity"), OPENCLAW_ACCEPTED("OpenClaw accepted activity for processing"),
        UNREACHABLE("Cannot reach receiver — check the address and connection"),
        BAD_KEY("Receiver refused the connection key"), UNAVAILABLE("Receiver is unavailable"),
        REJECTED("Receiver rejected the activity request"), INVALID_ACK("Receiver sent an incorrect acknowledgement");
        final String message;
        Outcome(String message) { this.message = message; }
    }
    private static final class Receipt {
        final Outcome outcome;
        final String runId;
        Receipt(Outcome outcome) { this(outcome, null); }
        Receipt(Outcome outcome, String runId) { this.outcome = outcome; this.runId = runId; }
    }
    private Receipt post(JSONObject state, JSONObject item) throws Exception {
        if (!UsageCollector.permitted(context)) return new Receipt(Outcome.REJECTED);
        String endpoint = state.getString("url"); validateEndpoint(endpoint);
        boolean openClaw = OpenClawWebhook.isEndpoint(endpoint);
        byte[] body = item.getString("body").getBytes(StandardCharsets.UTF_8);
        HttpURLConnection request = (HttpURLConnection) URI.create(endpoint).toURL().openConnection();
        synchronized (this) {
            if (!sameSession(store.read(), state)) { request.disconnect(); return new Receipt(Outcome.REJECTED); }
            connection = request;
        }
        try {
            request.setConnectTimeout(5000); request.setReadTimeout(openClaw ? 20_000 : 5000); request.setInstanceFollowRedirects(false);
            request.setRequestMethod("POST"); request.setDoOutput(true); request.setFixedLengthStreamingMode(body.length);
            request.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            request.setRequestProperty("Authorization", "Bearer " + LocalSecret.open(state.getString("key")));
            if (openClaw) request.setRequestProperty("Idempotency-Key", item.getString("event_id"));
            try (var output = request.getOutputStream()) { output.write(body); }
            int code = request.getResponseCode();
            if (code == 401 || code == 403) return new Receipt(Outcome.BAD_KEY);
            if (code >= 500) return new Receipt(Outcome.UNAVAILABLE);
            if (code != 200) return new Receipt(Outcome.REJECTED);
            byte[] response;
            try (InputStream input = request.getInputStream()) { response = input.readNBytes(4097); }
            if (response.length > 4096) return new Receipt(Outcome.INVALID_ACK);
            JSONObject ack;
            try { ack = new JSONObject(new String(response, StandardCharsets.UTF_8)); }
            catch (org.json.JSONException malformed) { return new Receipt(Outcome.INVALID_ACK); }
            if (openClaw) {
                String runId = OpenClawWebhook.acceptedRunId(ack);
                return runId == null ? new Receipt(Outcome.INVALID_ACK) : new Receipt(Outcome.OPENCLAW_ACCEPTED, runId);
            }
            return new Receipt(ack.optBoolean("accepted") && "liveabit-test-receiver".equals(ack.optString("receiver"))
                && item.getString("event_id").equals(ack.optString("event_id")) && sha256(body).equals(ack.optString("body_sha256"))
                ? Outcome.ACCEPTED : Outcome.INVALID_ACK);
        } finally { request.disconnect(); connection = null; }
    }
    static String sha256(byte[] body) throws Exception {
        byte[] hash = MessageDigest.getInstance("SHA-256").digest(body); StringBuilder result = new StringBuilder();
        for (byte value : hash) result.append(String.format(java.util.Locale.ROOT, "%02x", value & 255)); return result.toString();
    }
    private JSONArray prune(JSONArray pending) throws Exception {
        JSONArray next = new JSONArray(); long now = System.currentTimeMillis();
        for (int index = 0; index < pending.length(); index++) {
            JSONObject item = pending.getJSONObject(index);
            if (Instant.parse(item.getString("expires_at")).toEpochMilli() > now) next.put(item);
        }
        return next;
    }
    private static boolean sameSession(JSONObject first, JSONObject second) throws Exception {
        return first.getBoolean("enabled") && first.getString("stream_id").equals(second.getString("stream_id"));
    }
    private synchronized void setStatus(String message) throws Exception {
        JSONObject state = store.read(); state.put("status", message); store.write(state);
    }
    private int bootCount() { return Settings.Global.getInt(context.getContentResolver(), Settings.Global.BOOT_COUNT, -1); }
    synchronized void checkHealth() throws Exception {
        JSONObject state = store.read();
        if (!state.getBoolean("enabled") || state.optLong("failure_since") == 0) return;
        long age = state.optInt("boot_count") == bootCount()
            ? Math.max(0, SystemClock.elapsedRealtime() - state.getLong("failure_elapsed"))
            : Math.max(0, System.currentTimeMillis() - state.getLong("failure_since"));
        long threshold = state.getInt("alert_minutes") * 60_000L;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (age >= threshold && !state.optBoolean("outage_notified") && warningsEnabled()) {
            PendingIntent open = PendingIntent.getActivity(context, 0, new Intent(context, MainActivity.class), PendingIntent.FLAG_IMMUTABLE);
            manager.notify(OUTAGE_NOTIFICATION, new Notification.Builder(context, CHANNEL)
                .setSmallIcon(android.R.drawable.stat_notify_error).setContentTitle("Receiver is down")
                .setContentText("No acknowledgement for " + state.getInt("alert_minutes") + " minutes. Check the receiver or connection.")
                .setStyle(new Notification.BigTextStyle().bigText("No acknowledgement for " + state.getInt("alert_minutes")
                    + " minutes. Your activity is saved for retry. Check the receiver or connection."))
                .setContentIntent(open).setAutoCancel(true).setOnlyAlertOnce(true).build());
            state.put("outage_notified", true); store.write(state);
        }
        JobScheduler jobs = context.getSystemService(JobScheduler.class);
        if (age < threshold) jobs.schedule(new JobInfo.Builder(OUTAGE_JOB, new ComponentName(context, DeliveryJobService.class))
            .setMinimumLatency(threshold - age).setPersisted(true).build());
    }
    void createChannel() {
        context.getSystemService(NotificationManager.class).createNotificationChannel(new NotificationChannel(CHANNEL,
            "Receiver connection warnings", NotificationManager.IMPORTANCE_DEFAULT));
    }
    boolean warningsEnabled() {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        NotificationChannel channel = manager.getNotificationChannel(CHANNEL);
        return context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
            && manager.areNotificationsEnabled() && channel != null && channel.getImportance() != NotificationManager.IMPORTANCE_NONE;
    }
    synchronized void restoreScheduling() throws Exception {
        if (!store.read().getBoolean("enabled")) return;
        JobScheduler jobs = context.getSystemService(JobScheduler.class);
        if (jobs.getPendingJob(PERIODIC_JOB) == null) schedulePeriodic();
        checkHealth();
    }
    private void cancelAlert() {
        context.getSystemService(NotificationManager.class).cancel(OUTAGE_NOTIFICATION);
        context.getSystemService(JobScheduler.class).cancel(OUTAGE_JOB);
    }
    private void schedulePeriodic() {
        int result = context.getSystemService(JobScheduler.class).schedule(new JobInfo.Builder(PERIODIC_JOB,
            new ComponentName(context, DeliveryJobService.class)).setPeriodic(900_000).setPersisted(true).build());
        if (result != JobScheduler.RESULT_SUCCESS) throw new IllegalStateException("Background delivery could not be scheduled.");
    }
    static void validateEndpoint(String endpoint) {
        try {
            URI uri = new URI(endpoint); String host = uri.getHost();
            if (host == null || uri.getUserInfo() != null || uri.getFragment() != null || uri.getQuery() != null
                || !("/events".equals(uri.getPath()) || "/hooks/agent".equals(uri.getPath()))) throw new IllegalArgumentException();
            if ("https".equals(uri.getScheme())) return;
            if (!"http".equals(uri.getScheme())) throw new IllegalArgumentException();
            boolean local = "localhost".equals(host) || host.matches("127\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}")
                || host.matches("10\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}")
                || host.matches("192\\.168\\.\\d{1,3}\\.\\d{1,3}")
                || host.matches("172\\.(?:1[6-9]|2\\d|3[01])\\.\\d{1,3}\\.\\d{1,3}");
            if (!local) throw new IllegalArgumentException();
        } catch (Exception error) { throw new IllegalArgumentException("Use the receiver /events or OpenClaw /hooks/agent URL. HTTP is limited to your local network."); }
    }
}
