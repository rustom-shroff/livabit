package org.liveabit.publish;

import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.net.URI;

/** Receiver setup is imported only after an explicit user action; it never starts sharing. */
final class ConnectionSetup {
    static final int MAX_BYTES = 8192;
    final String url, key;
    final int minutes;
    private ConnectionSetup(String url, String key, int minutes) {
        this.url = url; this.key = key; this.minutes = minutes;
    }
    static ConnectionSetup parse(String text) throws Exception {
        if (text == null || text.length() > MAX_BYTES || text.getBytes(StandardCharsets.UTF_8).length > MAX_BYTES)
            throw new IllegalArgumentException("Setup file is too large.");
        JSONObject value = new JSONObject(text);
        boolean openClaw = OpenClawWebhook.SETUP_FORMAT.equals(value.getString("format"));
        if (!openClaw && !"liveabit.receiver.connection.v1".equals(value.getString("format")))
            throw new IllegalArgumentException("Choose a liveabit receiver or OpenClaw setup.");
        String url = value.getString("url"), key = value.getString("key");
        DeliveryEngine.validateEndpoint(url);
        if (openClaw != OpenClawWebhook.isEndpoint(url)
            || (openClaw && !OpenClawWebhook.AGENT_ID.equals(value.opt("agent_id"))))
            throw new IllegalArgumentException("OpenClaw setup must target the liveabit agent webhook.");
        if (!key.matches("[A-Za-z0-9_-]{32,256}")) throw new IllegalArgumentException("Connection key is invalid.");
        Object interval = value.opt("warning_minutes");
        int minutes = interval == null ? 60 : interval instanceof Integer ? (Integer) interval : 0;
        if (minutes < 1 || minutes > 1440) throw new IllegalArgumentException("Warning interval is invalid.");
        return new ConnectionSetup(url, key, minutes);
    }
    static String describe(String url) {
        if (url == null || url.isEmpty()) return "No receiver configured";
        try {
            DeliveryEngine.validateEndpoint(url);
            URI uri = URI.create(url); String host = uri.getHost();
            String address = host + (uri.getPort() == -1 ? "" : ":" + uri.getPort());
            String profile = OpenClawWebhook.isEndpoint(url) ? "OpenClaw — " : "";
            if ("10.0.2.2".equals(host)) return profile + "Android emulator: " + address;
            if ("localhost".equals(host) || host.startsWith("127.")) return profile + "USB: " + address;
            return profile + ("https".equals(uri.getScheme()) ? "HTTPS receiver: " : "Wi-Fi / local network: ") + address;
        } catch (Exception invalid) { return "Receiver address needs correcting"; }
    }
}
