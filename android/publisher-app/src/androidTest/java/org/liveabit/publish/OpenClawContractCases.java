package org.liveabit.publish;

import android.app.job.JobScheduler;
import android.content.Context;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.TimeUnit;

/** Tests the installed Android sender against a bounded emulator-local HTTP fixture. */
final class OpenClawContractCases {
    private static void check(boolean value, String message) { if (!value) throw new AssertionError(message); }

    static void run(Context context, DeliveryEngine engine, List<String> passed) throws Exception {
        engine.stop();
        try (HookFixture fixture = new HookFixture()) {
            String endpoint = fixture.endpoint(), token = "n".repeat(43);
            String setup = new JSONObject().put("format", OpenClawWebhook.SETUP_FORMAT).put("url", endpoint)
                .put("key", token).put("agent_id", "liveabit").put("warning_minutes", 60).toString();
            ConnectionSetup imported = ConnectionSetup.parse(setup);
            check(imported.url.equals(endpoint) && imported.key.equals(token) && imported.minutes == 60 && imported.agentId.equals("liveabit"),
                "OpenClaw setup changed the connection");
            check(ConnectionSetup.describe(endpoint).startsWith("OpenClaw (liveabit) — USB:"), "OpenClaw connection not identified");
            ConnectionSetup mainSetup = ConnectionSetup.parse(new JSONObject(setup).put("agent_id", "main").toString());
            check(mainSetup.agentId.equals("main") && ConnectionSetup.describe(endpoint, mainSetup.agentId)
                .startsWith("OpenClaw (main) — USB:"), "Main agent setup did not retain its routing identity");
            String[] invalid = {
                new JSONObject(setup).put("agent_id", "Main").toString(),
                new JSONObject(setup).put("agent_id", 42).toString(),
                new JSONObject(setup).put("agent_id", "a".repeat(65)).toString(),
                new JSONObject(setup).put("agent_id", "../main").toString(),
                new JSONObject(setup).put("url", endpoint.replace("/hooks/agent", "/events")).toString(),
                new JSONObject(setup).put("format", "liveabit.receiver.connection.v1").toString(),
                new JSONObject(setup).put("url", "http://example.com/hooks/agent").toString(),
                new JSONObject(setup).put("url", endpoint + "?token=secret").toString()
            };
            for (String value : invalid) {
                boolean refused = false;
                try { ConnectionSetup.parse(value); } catch (Exception expected) { refused = true; }
                check(refused, "Invalid OpenClaw setup was imported");
            }
            passed.add("native_openclaw_setup_and_destination_constraints");

            fixture.respond(503, "{\"ok\":false}");
            engine.configure(endpoint, token, "org.liveabit.fixture", 60);
            context.getSystemService(JobScheduler.class).cancel(DeliveryEngine.PERIODIC_JOB);
            cycle(context, engine, true);
            JSONObject initial = engine.snapshot();
            check(initial.getJSONArray("pending").length() > 0, "OpenClaw failure lost collected activity");
            JSONObject pending = initial.getJSONArray("pending").getJSONObject(0);
            String body = pending.getString("body"), id = pending.getString("event_id");
            Request sent = fixture.request(0);
            check(sent.path.equals("/hooks/agent") && sent.body.equals(body), "Native hook did not send durable wrapper bytes");
            check(sent.headers.get("authorization").equals("Bearer " + token), "Native hook authentication missing");
            check(sent.headers.get("idempotency-key").equals(id), "Native hook retry identity missing");
            JSONObject hook = new JSONObject(body);
            check(hook.length() == 5 && "liveabit".equals(hook.getString("name"))
                && "liveabit".equals(hook.getString("agentId")) && "now".equals(hook.getString("wakeMode"))
                && Boolean.FALSE.equals(hook.opt("deliver")), "Native hook destination or delivery policy changed");
            String message = hook.getString("message");
            check(message.startsWith(OpenClawWebhook.DATA_INTRO), "Native hook lost data-only instructions");
            String canonical = message.substring(OpenClawWebhook.DATA_INTRO.length());
            JSONObject event = new JSONObject(canonical);
            check(OapObservation.encode(event).equals(canonical) && event.getString("event_id").equals(id)
                && OapObservation.VERSION.equals(event.getString("protocol_version")), "Hook changed OAP identity or canonical data");
            check("unknown".equals(event.getJSONObject("observation").getString("coverage"))
                && "unverified_estimate".equals(event.getJSONObject("observation").getString("quality")), "Hook lost uncertainty");
            JSONArray apps = event.getJSONObject("observation").getJSONArray("apps");
            check(apps.length() == 1 && "org.liveabit.fixture".equals(apps.getJSONObject(0)
                .getJSONObject("application").getString("id")), "Hook shared an unselected package");
            passed.add("actual_android_collector_direct_hook_body_auth_and_idempotency");

            DeliveryEngine reopened = new DeliveryEngine(context);
            check(reopened.snapshot().getJSONArray("pending").getJSONObject(0).getString("body").equals(body),
                "Reopening changed the stored hook wrapper");
            PublisherStore store = new PublisherStore(context);
            JSONObject legacyAgent = reopened.snapshot(); legacyAgent.remove("agent_id"); store.write(legacyAgent);
            check(reopened.snapshot().getString("agent_id").equals("liveabit")
                && reopened.snapshot().getJSONArray("pending").getJSONObject(0).getString("body").equals(body),
                "Older OpenClaw storage migration changed the default agent or queued wrapper");
            passed.add("native_openclaw_legacy_agent_migration_preserves_queued_body");
            String[] invalidAcknowledgements = {
                "{\"ok\":\"true\",\"runId\":\"not-a-real-admission\"}",
                "{\"ok\":true}", "{\"ok\":true,\"runId\":\"\"}",
                "{\"ok\":true,\"runId\":42}", "{\"ok\":false,\"runId\":\"refused\"}", "invalid JSON"
            };
            for (String response : invalidAcknowledgements) {
                fixture.respond(200, response); cycle(context, reopened, false);
                JSONObject after = reopened.snapshot();
                check(after.getJSONArray("pending").getJSONObject(0).getString("body").equals(body)
                    && after.getLong("last_ack") == 0 && after.getString("status").contains("incorrect acknowledgement"),
                    "Invalid hook acknowledgement removed pending activity");
            }
            passed.add("native_openclaw_requires_literal_ok_and_nonempty_run_id");

            for (int code : new int[] {202, 401, 403, 503}) {
                fixture.respond(code, "{\"ok\":true,\"runId\":\"not-admitted\"}");
                cycle(context, reopened, false);
                check(reopened.snapshot().getJSONArray("pending").getJSONObject(0).getString("body").equals(body)
                    && reopened.snapshot().getLong("last_ack") == 0, "Rejected HTTP response discarded activity");
            }
            long failureSince = reopened.snapshot().getLong("failure_since");
            reopened.configure(endpoint, token, "org.liveabit.fixture", 60);
            context.getSystemService(JobScheduler.class).cancel(DeliveryEngine.PERIODIC_JOB);
            check(reopened.snapshot().getLong("failure_since") == failureSince, "Repeated Start reset OpenClaw outage");
            fixture.respond(200, "{\"ok\":true,\"runId\":\"liveabit-emulator-accepted-run\"}");
            cycle(context, reopened, false);
            JSONObject admitted = reopened.snapshot();
            check(admitted.getJSONArray("pending").length() == 0 && admitted.getLong("last_ack") > 0
                && admitted.getLong("failure_since") == 0
                && "liveabit-emulator-accepted-run".equals(admitted.getString("last_run_id"))
                && "OpenClaw accepted activity for processing".equals(admitted.getString("status")),
                "Native hook admission or recovery status incorrect");
            Map<String, String> bodiesById = new HashMap<>();
            int originalAttempts = 0;
            for (int i = 0; i < fixture.count(); i++) {
                Request retry = fixture.request(i);
                String requestId = retry.headers.get("idempotency-key");
                JSONObject wrapper = new JSONObject(retry.body);
                String data = wrapper.getString("message");
                check(data.startsWith(OpenClawWebhook.DATA_INTRO), "A queued hook lost its data-only instructions");
                JSONObject observation = new JSONObject(data.substring(OpenClawWebhook.DATA_INTRO.length()));
                check(observation.getString("event_id").equals(requestId), "A hook header changed its OAP identity");
                String firstBody = bodiesById.putIfAbsent(requestId, retry.body);
                check(firstBody == null || firstBody.equals(retry.body), "A retry rebuilt the hook wrapper for the same event");
                if (id.equals(requestId)) {
                    originalAttempts++;
                    check(retry.body.equals(body), "A retry changed the original durable hook bytes");
                }
            }
            check(originalAttempts >= 2, "The original pending hook was not retried");
            fixture.assertHealthy();
            passed.add("native_openclaw_http_refusal_durable_retry_and_admission_recovery");
            mappedLiveabitRouting(context, engine, fixture, endpoint, token, passed);
            agentRouting(context, engine, fixture, endpoint, token, mainSetup.agentId, passed);
        } finally { engine.stop(); }
    }

    private static void mappedLiveabitRouting(Context context, DeliveryEngine engine, HookFixture fixture, String endpoint,
                                          String token, List<String> passed) throws Exception {
        engine.stop(); fixture.respond(503, "{\"ok\":false}");
        String mappedEndpoint = endpoint.replace("/hooks/agent", "/hooks/liveabit");
        JSONObject setup = new JSONObject().put("format", OpenClawWebhook.SETUP_FORMAT).put("url", mappedEndpoint)
            .put("key", token).put("agent_id", "liveabit");
        ConnectionSetup imported = ConnectionSetup.parse(setup.toString());
        check(imported.agentId.equals("liveabit") && ConnectionSetup.describe(mappedEndpoint).startsWith("OpenClaw (liveabit)"),
            "Mapped liveabit setup lost its destination");
        boolean wrongAgentRefused = false;
        try { ConnectionSetup.parse(new JSONObject(setup.toString()).put("agent_id", "main").toString()); }
        catch (IllegalArgumentException expected) { wrongAgentRefused = true; }
        check(wrongAgentRefused, "Mapped liveabit setup accepted another agent");
        engine.configure(imported.url, imported.key, "org.liveabit.fixture", 60, imported.agentId);
        context.getSystemService(JobScheduler.class).cancel(DeliveryEngine.PERIODIC_JOB);
        cycle(context, engine, true);
        JSONObject state = engine.snapshot();
        check(state.getJSONArray("pending").length() > 0 && state.getString("agent_id").equals("liveabit"),
            "Mapped liveabit hook did not queue actual Android activity");
        JSONObject first = state.getJSONArray("pending").getJSONObject(0);
        String id = first.getString("event_id"), body = first.getString("body");
        JSONObject wrapper = new JSONObject(body);
        check(wrapper.getString("agentId").equals("liveabit") && Boolean.FALSE.equals(wrapper.opt("deliver"))
            && !wrapper.has("sessionKey") && !wrapper.has("sessionMode"),
            "Android replaced gateway-owned session routing");
        boolean observed = false;
        for (int i = 0; i < fixture.count(); i++) {
            Request sent = fixture.request(i);
            if (id.equals(sent.headers.get("idempotency-key"))) {
                check(sent.path.equals("/hooks/liveabit") && sent.body.equals(body), "Mapped liveabit hook sent the wrong route or body");
                observed = true;
            }
        }
        check(observed, "Native HTTP fixture received no mapped liveabit hook");
        boolean invalidChangeRefused = false;
        try { engine.configure(mappedEndpoint, token, "org.liveabit.fixture", 60, "main"); }
        catch (IllegalArgumentException expected) { invalidChangeRefused = true; }
        check(invalidChangeRefused && engine.snapshot().getString("stream_id").equals(state.getString("stream_id"))
            && engine.snapshot().getJSONArray("pending").getJSONObject(0).getString("body").equals(body),
            "Wrong mapped agent changed saved sharing");
        passed.add("native_openclaw_mapped_liveabit_hook_and_gateway_owned_session_route");
    }

    private static void agentRouting(Context context, DeliveryEngine engine, HookFixture fixture, String endpoint,
                                     String token, String selectedAgent, List<String> passed) throws Exception {
        engine.stop(); fixture.respond(503, "{\"ok\":false}");
        engine.configure(endpoint, token, "org.liveabit.fixture", 60, selectedAgent);
        context.getSystemService(JobScheduler.class).cancel(DeliveryEngine.PERIODIC_JOB);
        cycle(context, engine, true);
        JSONObject original = engine.snapshot();
        check(original.getString("agent_id").equals("main") && original.getJSONArray("pending").length() > 0,
            "Configured main agent was not persisted with pending activity");
        JSONObject first = original.getJSONArray("pending").getJSONObject(0);
        String body = first.getString("body"), id = first.getString("event_id");
        check(new JSONObject(body).getString("agentId").equals("main"), "Collected activity did not target the selected main agent");
        check(engine.pendingToClear(endpoint, token, "org.liveabit.fixture", 60, "main") == 0
            && engine.pendingToClear(endpoint, token, "org.liveabit.fixture", 60, "liveabit") > 0,
            "Agent switch did not fence the pending queue");
        JSONObject unchanged = engine.snapshot();
        check(unchanged.getString("stream_id").equals(original.getString("stream_id"))
            && unchanged.getString("agent_id").equals("main")
            && unchanged.getJSONArray("pending").getJSONObject(0).getString("body").equals(body),
            "Previewing or cancelling an agent switch changed the original queue");
        cycle(context, engine, false);
        Request retry = fixture.request(fixture.count() - 1);
        check(retry.headers.get("idempotency-key").equals(id) && retry.body.equals(body),
            "Agent switch preview rewrote the original main-agent retry");
        passed.add("native_openclaw_main_agent_routing_and_switch_pending_fence");

        for (String invalid : new String[] {null, "", "Main", "../main", "main\n", "a".repeat(65)}) {
            boolean refused = false;
            try { engine.configure(endpoint, token, "org.liveabit.fixture", 60, invalid); }
            catch (IllegalArgumentException expected) { refused = true; }
            check(refused, "Invalid agent configuration was saved");
            JSONObject after = engine.snapshot();
            check(after.getString("agent_id").equals("main") && after.getString("stream_id").equals(original.getString("stream_id"))
                && after.getJSONArray("pending").getJSONObject(0).getString("body").equals(body),
                "Refused agent configuration changed saved sharing");
        }
        passed.add("native_openclaw_invalid_agent_preserves_current_sharing");

        engine.configure(endpoint, token, "org.liveabit.fixture", 60, "liveabit");
        context.getSystemService(JobScheduler.class).cancel(DeliveryEngine.PERIODIC_JOB);
        cycle(context, engine, true);
        JSONObject switched = engine.snapshot();
        check(switched.getString("agent_id").equals("liveabit")
            && !switched.getString("stream_id").equals(original.getString("stream_id"))
            && switched.getJSONArray("pending").length() > 0, "Confirmed agent switch did not create fresh sharing");
        for (int i = 0; i < switched.getJSONArray("pending").length(); i++) {
            JSONObject item = switched.getJSONArray("pending").getJSONObject(i);
            check(!item.getString("event_id").equals(id) && new JSONObject(item.getString("body")).getString("agentId").equals("liveabit"),
                "Confirmed agent switch forwarded the old agent's activity");
        }
        passed.add("native_openclaw_confirmed_agent_switch_creates_fresh_queue");
    }

    static void live(Context context, DeliveryEngine engine, String endpoint, String token, String agentId, List<String> passed) throws Exception {
        check(OpenClawWebhook.isEndpoint(endpoint), "Live check must target an OpenClaw webhook");
        context.deleteFile("openclaw-failed-request.json");
        context.deleteFile("receiver-http-error.json");
        engine.stop();
        try {
            engine.configure(endpoint, token, "org.liveabit.fixture", 60, agentId);
            context.getSystemService(JobScheduler.class).cancel(DeliveryEngine.PERIODIC_JOB);
            cycle(context, engine, true);
            JSONObject state = engine.snapshot();
            if (state.getJSONArray("pending").length() > 0) {
                // Retain only this synthetic request for replay; never export the key or full sender state.
                JSONObject pending = state.getJSONArray("pending").getJSONObject(0);
                JSONObject diagnostic = new JSONObject().put("endpoint", state.getString("url"))
                    .put("agent_id", state.getString("agent_id")).put("event_id", pending.getString("event_id"))
                    .put("body", pending.getString("body"));
                try (var output = context.openFileOutput("openclaw-failed-request.json", Context.MODE_PRIVATE)) {
                    output.write(diagnostic.toString().getBytes(StandardCharsets.UTF_8));
                }
            }
            check(state.getString("agent_id").equals(agentId) && state.getLong("last_ack") > 0 && state.getJSONArray("pending").length() == 0
                && !state.optString("last_run_id").isEmpty()
                && "OpenClaw accepted activity for processing".equals(state.getString("status")),
                "Installed OpenClaw did not admit the Android activity: " + state.getString("status"));
            passed.add("actual_android_activity_admitted_by_installed_openclaw_gateway");
        } finally { engine.stop(); }
    }

    private static void cycle(Context context, DeliveryEngine engine, boolean collect) throws Exception {
        ((PublisherApplication) context.getApplicationContext()).worker.submit(() -> engine.cycle(collect)).get(30, TimeUnit.SECONDS);
    }

    static final class Request {
        final String path, body;
        final Map<String, String> headers;
        Request(String path, String body, Map<String, String> headers) { this.path = path; this.body = body; this.headers = headers; }
    }

    static final class HookFixture implements AutoCloseable {
        private final ServerSocket server = new ServerSocket(0, 4, InetAddress.getByName("127.0.0.1"));
        private final List<Request> requests = new ArrayList<>();
        private final Thread thread;
        private volatile int responseCode = 503;
        private volatile String responseBody = "{\"ok\":false}";
        private volatile Throwable failure;
        HookFixture() throws Exception {
            thread = new Thread(this::serve, "openclaw-native-hook-fixture"); thread.start();
        }
        String endpoint() { return "http://127.0.0.1:" + server.getLocalPort() + "/hooks/agent"; }
        void respond(int code, String body) { responseCode = code; responseBody = body; }
        synchronized Request request(int index) { check(index < requests.size(), "Native HTTP fixture saw no request"); return requests.get(index); }
        synchronized int count() { return requests.size(); }
        void assertHealthy() { check(failure == null, "Native HTTP fixture failed: " + failure); }
        private void serve() {
            while (!server.isClosed()) {
                try (Socket socket = server.accept()) {
                    socket.setSoTimeout(5000); InputStream input = socket.getInputStream();
                    String first = line(input); String[] parts = first.split(" ");
                    check(parts.length == 3 && "POST".equals(parts[0]), "Unexpected hook HTTP request");
                    Map<String, String> headers = new HashMap<>();
                    for (int i = 0; i < 50; i++) {
                        String header = line(input); if (header.isEmpty()) break;
                        int colon = header.indexOf(':'); check(colon > 0, "Invalid hook HTTP header");
                        headers.put(header.substring(0, colon).toLowerCase(Locale.ROOT), header.substring(colon + 1).trim());
                    }
                    int length = Integer.parseInt(headers.getOrDefault("content-length", "-1"));
                    check(length > 0 && length <= 65_536, "Unexpected hook body length");
                    byte[] bytes = input.readNBytes(length); check(bytes.length == length, "Truncated hook request");
                    synchronized (this) { requests.add(new Request(parts[1], new String(bytes, StandardCharsets.UTF_8), headers)); }
                    byte[] reply = responseBody.getBytes(StandardCharsets.UTF_8);
                    String head = "HTTP/1.1 " + responseCode + " Fixture\r\nContent-Type: application/json\r\nContent-Length: "
                        + reply.length + "\r\nConnection: close\r\n\r\n";
                    socket.getOutputStream().write(head.getBytes(StandardCharsets.US_ASCII));
                    socket.getOutputStream().write(reply); socket.getOutputStream().flush();
                } catch (Throwable error) { if (!server.isClosed()) failure = error; }
            }
        }
        private static String line(InputStream input) throws Exception {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            for (int i = 0; i < 8192; i++) {
                int value = input.read(); check(value >= 0, "Truncated hook HTTP headers");
                if (value == '\n') {
                    String text = bytes.toString(StandardCharsets.US_ASCII);
                    return text.endsWith("\r") ? text.substring(0, text.length() - 1) : text;
                }
                bytes.write(value);
            }
            throw new IllegalArgumentException("Oversized hook HTTP header");
        }
        @Override public void close() throws Exception { server.close(); thread.join(1000); }
    }
}
