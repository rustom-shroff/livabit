package org.liveabit.publish;

import org.json.JSONObject;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.SocketTimeoutException;
import java.net.URI;
import java.nio.charset.StandardCharsets;

/** Checks a draft OpenClaw connection without configuring sharing or admitting an agent run. */
final class ConnectionProbe {
    static final class Result {
        final boolean connected;
        final String message;
        Result(boolean connected, String message) { this.connected = connected; this.message = message; }
    }
    static Result check(String url, String token, String agentId) {
        try {
            DeliveryEngine.validateEndpoint(url);
            if (!OpenClawWebhook.isEndpoint(url))
                return failure("Choose an OpenClaw webhook address to check this connection.");
            OpenClawWebhook.validateAgentForEndpoint(url, agentId);
            if (token == null || !token.matches("[A-Za-z0-9_-]{32,256}"))
                return failure("Enter or import the OpenClaw connection key.");
        } catch (IllegalArgumentException invalid) { return failure(invalid.getMessage()); }

        HttpURLConnection request = null;
        try {
            request = (HttpURLConnection) URI.create(url).toURL().openConnection();
            request.setConnectTimeout(5000); request.setReadTimeout(5000); request.setInstanceFollowRedirects(false);
            request.setRequestMethod("POST"); request.setDoOutput(true); request.setFixedLengthStreamingMode(2);
            request.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            request.setRequestProperty("Authorization", "Bearer " + token);
            // The installed OpenClaw validates authentication and matches the hook before
            // rejecting this missing-message object. No activity or runnable message is sent.
            try (var output = request.getOutputStream()) { output.write(new byte[] {'{', '}'}); }
            int code = request.getResponseCode();
            if (code == 401 || code == 403) return failure("OpenClaw refused the connection key. Import a current setup file.");
            if (code == 404) return failure("OpenClaw was reached, but this webhook address is not configured.");
            if (code >= 500) return failure("OpenClaw was reached, but its server is unavailable. Check that it is running.");
            if (code != 400) return failure("The server did not confirm an OpenClaw webhook at this address.");
            byte[] body;
            try (InputStream input = request.getErrorStream()) {
                body = input == null ? new byte[0] : input.readNBytes(4097);
            }
            if (body.length > 4096) return failure("The server returned an unexpected connection-check response.");
            JSONObject response;
            try { response = new JSONObject(new String(body, StandardCharsets.UTF_8)); }
            catch (Exception malformed) { return failure("The server returned an unexpected connection-check response."); }
            if (Boolean.FALSE.equals(response.opt("ok")) && knownMissingMessage(url, response.opt("error"))
                && (!OpenClawWebhook.isReceiptEndpoint(url) || OpenClawWebhook.RECEIPT_FORMAT.equals(response.opt("format"))))
                return new Result(true, "OpenClaw connection verified — address, webhook and connection key are working.");
            return failure("The server returned an unexpected connection-check response.");
        } catch (SocketTimeoutException timeout) {
            return failure("OpenClaw connection check timed out. Check Wi-Fi, the address and the computer's firewall.");
        } catch (Exception unreachable) {
            return failure("Cannot reach OpenClaw. Check the address, shared Wi-Fi, firewall and that OpenClaw is running.");
        } finally { if (request != null) request.disconnect(); }
    }
    private static boolean knownMissingMessage(String url, Object error) {
        if (OpenClawWebhook.isReceiptEndpoint(url)) return "activity_message_required".equals(error);
        return OpenClawWebhook.isMainEndpoint(url) ? "hook mapping requires message".equals(error)
            : "message required".equals(error);
    }
    private static Result failure(String message) { return new Result(false, message); }
}
