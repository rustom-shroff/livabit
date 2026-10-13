package org.liveabit.publish;

import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.net.URI;

/** Receiver setup is imported only after an explicit user action; it never starts sharing. */
final class ConnectionSetup {
    static final int MAX_BYTES = 8192;
    final String url, key, agentId;
    final int minutes;
    final boolean legacyAgentMigrated;
    static final class ImportException extends IllegalArgumentException {
        ImportException(String message) { super(message); }
    }
    private ConnectionSetup(String url, String key, int minutes, String agentId, boolean legacyAgentMigrated) {
        this.url = url; this.key = key; this.minutes = minutes; this.agentId = agentId;
        this.legacyAgentMigrated = legacyAgentMigrated;
    }
    static ConnectionSetup parse(String text) throws ImportException {
        if (text == null || text.length() > MAX_BYTES || text.getBytes(StandardCharsets.UTF_8).length > MAX_BYTES)
            throw new ImportException("The connection file must be 8 KB or smaller. Choose the exported Android setup file.");
        JSONObject value;
        try { value = new JSONObject(text); }
        catch (org.json.JSONException invalid) {
            throw new ImportException("The file is not valid JSON. Choose the exported Android Wi-Fi or USB setup file.");
        }
        Object format = value.opt("format");
        if ("liveabit.openclaw.local.v1".equals(format))
            throw new ImportException("connection.json is for the computer. Import android-wifi-setup.json or android-usb-setup.json instead.");
        boolean openClaw = OpenClawWebhook.SETUP_FORMAT.equals(format);
        if (!openClaw && !"liveabit.receiver.connection.v1".equals(format))
            throw new ImportException("Choose an exported Android receiver or OpenClaw connection file, not the computer's configuration.");
        String url = stringField(value, "url", "The file is missing its receiver address. Export the Android setup again.");
        String key = stringField(value, "key", "The file is missing its connection key. Export the Android setup again.");
        try { DeliveryEngine.validateEndpoint(url); }
        catch (IllegalArgumentException invalid) { throw new ImportException("The receiver address is invalid. Export the Android Wi-Fi or USB setup again."); }
        if (openClaw != OpenClawWebhook.isEndpoint(url))
            throw new ImportException("The file's connection type does not match its address. Export the Android setup again.");
        String agentId = OpenClawWebhook.AGENT_ID;
        boolean legacyAgentMigrated = false;
        if (openClaw) {
            agentId = stringField(value, "agent_id", "The OpenClaw file is missing its agent. Export the Android setup again.");
            // Earlier project exports named main on this server-owned route. The user
            // moved that route to liveabit; update only the imported draft, visibly.
            legacyAgentMigrated = OpenClawWebhook.isMainEndpoint(url) && "main".equals(agentId);
            if (legacyAgentMigrated) agentId = OpenClawWebhook.AGENT_ID;
            try { OpenClawWebhook.validateAgentForEndpoint(url, agentId); }
            catch (IllegalArgumentException invalid) {
                throw new ImportException("The OpenClaw agent does not match this hook. Export the current liveabit Android setup again.");
            }
        }
        if (!key.matches("[A-Za-z0-9_-]{32,256}")) throw new ImportException("The connection key is invalid. Export the Android setup again.");
        Object interval = value.opt("warning_minutes");
        int minutes = interval == null ? 60 : interval instanceof Integer ? (Integer) interval : 0;
        if (minutes < 1 || minutes > 1440) throw new ImportException("The warning interval must be a whole number from 1 to 1440 minutes. Export the Android setup again.");
        return new ConnectionSetup(url, key, minutes, agentId, legacyAgentMigrated);
    }
    private static String stringField(JSONObject value, String field, String message) {
        Object result = value.opt(field);
        if (!(result instanceof String) || ((String) result).isEmpty()) throw new ImportException(message);
        return (String) result;
    }
    static String describe(String url) {
        return describe(url, OpenClawWebhook.AGENT_ID);
    }
    static String describe(String url, String agentId) {
        if (url == null || url.isEmpty()) return "No receiver configured";
        try {
            DeliveryEngine.validateEndpoint(url);
            URI uri = URI.create(url); String host = uri.getHost();
            String address = host + (uri.getPort() == -1 ? "" : ":" + uri.getPort());
            String profile = "";
            if (OpenClawWebhook.isEndpoint(url)) {
                OpenClawWebhook.validateAgentForEndpoint(url, agentId); profile = "OpenClaw (" + agentId + ") — ";
            }
            if ("10.0.2.2".equals(host)) return profile + "Android emulator: " + address;
            if ("localhost".equals(host) || host.startsWith("127.")) return profile + "USB: " + address;
            return profile + ("https".equals(uri.getScheme()) ? "HTTPS receiver: " : "Wi-Fi / local network: ") + address;
        } catch (Exception invalid) { return "Receiver address needs correcting"; }
    }
}
