package org.liveabit.publish;

import android.content.Context;
import android.util.AtomicFile;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

/** One process owns this file; writes are atomic and activity is never backed up. */
final class PublisherStore {
    private final AtomicFile file;
    PublisherStore(Context context) { file = new AtomicFile(new File(context.getFilesDir(), "sender.json")); }
    JSONObject read() throws Exception {
        if (!file.getBaseFile().exists()) return empty();
        byte[] bytes = file.readFully();
        if (bytes.length > 1_048_576) throw new IllegalStateException("Sender storage unavailable.");
        JSONObject state = new JSONObject(new String(bytes, StandardCharsets.UTF_8));
        if (state.getInt("version") != 1) throw new IllegalStateException("Sender storage unavailable.");
        // Older senders retain their original queued bodies. Add identities only for future observations.
        boolean migrated = false;
        for (String field : new String[] {"recipient_id", "subscription_id"}) {
            if (!state.has(field)) { state.put(field, UUID.randomUUID().toString()); migrated = true; }
        }
        if (!state.has("scope_revision")) { state.put("scope_revision", 1); migrated = true; }
        if (!state.has("agent_id")) { state.put("agent_id", OpenClawWebhook.AGENT_ID); migrated = true; }
        if (migrated) write(state);
        return state;
    }
    void write(JSONObject state) throws Exception {
        byte[] bytes = state.toString().getBytes(StandardCharsets.UTF_8);
        if (bytes.length > 1_048_576) throw new IllegalStateException("Pending activity is full.");
        FileOutputStream output = file.startWrite();
        try { output.write(bytes); file.finishWrite(output); }
        catch (Exception error) { file.failWrite(output); throw error; }
    }
    static JSONObject empty() throws Exception {
        return new JSONObject().put("version", 1).put("enabled", false).put("url", "")
            .put("agent_id", OpenClawWebhook.AGENT_ID)
            .put("key", "").put("packages", new JSONArray()).put("alert_minutes", 60)
            .put("stream_id", UUID.randomUUID().toString()).put("sequence", 0)
            .put("recipient_id", UUID.randomUUID().toString()).put("subscription_id", UUID.randomUUID().toString()).put("scope_revision", 1)
            .put("cursor", 0).put("pending", new JSONArray()).put("last_ack", 0).put("last_run_id", "")
            .put("failure_since", 0).put("failure_elapsed", 0).put("boot_count", -1)
            .put("outage_notified", false).put("status", "Ready to connect");
    }
}
