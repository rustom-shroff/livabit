package org.liveabit.publish;

import android.content.Context;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.util.List;

/** Exercises the installed Android connection probe against native HTTP replies. */
final class ConnectionProbeCases {
    private static void check(boolean value, String message) { if (!value) throw new AssertionError(message); }
    static void run(Context context, DeliveryEngine engine, List<String> passed) throws Exception {
        engine.stop();
        String token = "q".repeat(43), before = engine.snapshot().toString();
        try (var fixture = new OpenClawContractCases.HookFixture()) {
            fixture.respond(400, "{\"ok\":false,\"error\":\"message required\"}");
            ConnectionProbe.Result result = engine.checkConnection(fixture.endpoint(), token, "liveabit");
            check(result.connected && fixture.count() == 1 && fixture.request(0).body.equals("{}")
                && fixture.request(0).headers.get("authorization").equals("Bearer " + token)
                && !fixture.request(0).headers.containsKey("idempotency-key")
                && engine.snapshot().toString().equals(before), "Connection check submitted activity or changed sharing state");
            passed.add("native_openclaw_connection_probe_verifies_auth_route_without_activity_or_state_changes");

            fixture.respond(400, "{\"ok\":false,\"error\":\"hook mapping requires message\"}");
            String mapped = fixture.endpoint().replace("/hooks/agent", "/hooks/liveabit");
            check(engine.checkConnection(mapped, token, OpenClawWebhook.AGENT_ID).connected,
                "Mapped liveabit hook was not verified by its exact missing-message reply");
            passed.add("native_mapped_liveabit_probe_requires_recognizable_route_validation_reply");

            String durable = fixture.endpoint().replace("/hooks/agent", "/liveabit/activity");
            fixture.respond(400, "{\"ok\":false,\"format\":\"liveabit.activity-receipt.v1\",\"error\":\"activity_message_required\"}");
            check(engine.checkConnection(durable, token, "main").connected && engine.snapshot().toString().equals(before),
                "Durable receiver probe failed or changed current sharing");
            fixture.respond(400, "{\"ok\":false,\"error\":\"activity_message_required\"}");
            check(!engine.checkConnection(durable, token, "main").connected, "Unidentified receipt route was accepted");
            passed.add("native_durable_activity_probe_identifies_storage_endpoint_without_packet_or_model_run");

            String[] badReplies = {"{\"ok\":false,\"error\":\"unrelated bad request\"}",
                "{\"ok\":\"false\",\"error\":\"message required\"}",
                "{\"ok\":false,\"error\":\"hook mapping requires message\"}", "not JSON"};
            for (String reply : badReplies) {
                fixture.respond(400, reply);
                check(!engine.checkConnection(fixture.endpoint(), token, "liveabit").connected,
                    "An arbitrary 400 response was accepted as a verified OpenClaw connection");
            }
            for (int code : new int[] {200, 202, 204, 301}) {
                fixture.respond(code, "{\"ok\":true,\"runId\":\"not-a-probe\"}");
                check(!engine.checkConnection(fixture.endpoint(), token, "liveabit").connected,
                    "An admission or redirect response was accepted as a safe connection check");
            }
            passed.add("native_probe_rejects_arbitrary_errors_admission_responses_and_redirects");

            for (int code : new int[] {401, 403, 404, 503}) {
                fixture.respond(code, "{\"ok\":false}");
                ConnectionProbe.Result failed = engine.checkConnection(fixture.endpoint(), token, "liveabit");
                String expected = code == 401 || code == 403 ? "connection key" : code == 404 ? "not configured" : "unavailable";
                check(!failed.connected && failed.message.contains(expected) && !failed.message.contains(token),
                    "Connection failure was hidden or leaked the connection key");
            }
            passed.add("native_connection_probe_flags_key_route_and_server_failures_immediately");

            int requests = fixture.count();
            check(!engine.checkConnection(fixture.endpoint(), "bad-key", "liveabit").connected
                && !engine.checkConnection(fixture.endpoint(), token, "../invalid").connected
                && fixture.count() == requests, "Invalid connection input made a network request");
            fixture.assertHealthy();
            passed.add("native_invalid_connection_draft_is_flagged_before_network");
        }
        int closedPort;
        try (var closed = new ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"))) { closedPort = closed.getLocalPort(); }
        ConnectionProbe.Result unreachable = engine.checkConnection("http://127.0.0.1:" + closedPort + "/hooks/agent", token, "liveabit");
        check(!unreachable.connected && unreachable.message.contains("Cannot reach") && engine.snapshot().toString().equals(before),
            "Unavailable receiver was silently connected or changed state");
        passed.add("native_connection_probe_flags_unreachable_server_without_starting_sharing");
        try (var silent = new ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"))) {
            Thread stalled = new Thread(() -> {
                try (var socket = silent.accept()) { Thread.sleep(8000); }
                catch (Exception ignored) { }
            }, "native-connection-probe-timeout");
            stalled.start();
            try {
                ConnectionProbe.Result timeout = engine.checkConnection("http://127.0.0.1:" + silent.getLocalPort()
                    + "/hooks/agent", token, "liveabit");
                check(!timeout.connected && timeout.message.contains("timed out")
                    && engine.snapshot().toString().equals(before), "An unresponsive server did not report a bounded timeout");
                passed.add("native_connection_probe_flags_unresponsive_server_timeout_without_state_changes");
            } finally { silent.close(); stalled.interrupt(); stalled.join(1000); }
        }
    }
}
