package org.liveabit.publish;

import org.json.JSONArray;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeFormatterBuilder;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

/** OAP's draft observation family carries estimates without claiming measured coverage. */
final class OapObservation {
    static final String VERSION = "0.2.0-draft.1", EVENT_NAME = "activity.observation";
    static final int MAX_BYTES = 16_384;
    private static final long MAX_INTEGER = 9_007_199_254_740_991L;
    private static final DateTimeFormatter UTC = new DateTimeFormatterBuilder().appendInstant(3).toFormatter();

    static JSONObject create(JSONObject state, long start, long end, long emitted, JSONArray apps) throws Exception {
        if (start < 0 || end <= start || end - start > 900_000 || emitted < end
            || emitted >= start + 86_400_000 || apps.length() < 1 || apps.length() > 32)
            throw new IllegalArgumentException("Invalid observation window");
        return new JSONObject().put("protocol_version", VERSION).put("event_name", EVENT_NAME)
            .put("event_id", UUID.randomUUID().toString()).put("recipient_id", state.getString("recipient_id"))
            .put("stream_id", state.getString("stream_id")).put("subscription_id", state.getString("subscription_id"))
            .put("scope_revision", state.getLong("scope_revision")).put("sequence", state.getLong("sequence") + 1)
            .put("emitted_at", timestamp(emitted)).put("expires_at", timestamp(start + 86_400_000))
            .put("window", new JSONObject().put("window_id", UUID.randomUUID().toString())
                .put("start", timestamp(start)).put("end", timestamp(end)))
            .put("observation", new JSONObject().put("metric", "foreground_duration").put("unit", "millisecond")
                .put("coverage", "unknown").put("quality", "unverified_estimate").put("apps", apps));
    }
    static String timestamp(long milliseconds) { return UTC.format(Instant.ofEpochMilli(milliseconds)); }
    static String encode(JSONObject event) throws Exception {
        StringBuilder out = new StringBuilder(); append(out, event);
        if (out.toString().getBytes(StandardCharsets.UTF_8).length > MAX_BYTES)
            throw new IllegalArgumentException("Observation exceeds OAP byte limit");
        return out.toString();
    }
    // JCS serialization for the protocol's strings, booleans, nulls and safe integers.
    // Floating-point metrics are not part of this event family.
    private static void append(StringBuilder out, Object value) throws Exception {
        if (value == null || value == JSONObject.NULL) { out.append("null"); return; }
        if (value instanceof JSONObject) {
            JSONObject object = (JSONObject) value; List<String> names = new ArrayList<>();
            object.keys().forEachRemaining(names::add); Collections.sort(names); out.append('{');
            for (int i = 0; i < names.size(); i++) {
                if (i > 0) out.append(','); quote(out, names.get(i)); out.append(':'); append(out, object.get(names.get(i)));
            }
            out.append('}'); return;
        }
        if (value instanceof JSONArray) {
            JSONArray array = (JSONArray) value; out.append('[');
            for (int i = 0; i < array.length(); i++) { if (i > 0) out.append(','); append(out, array.get(i)); }
            out.append(']'); return;
        }
        if (value instanceof String) { quote(out, (String) value); return; }
        if (value instanceof Boolean) { out.append(value); return; }
        if (value instanceof Byte || value instanceof Short || value instanceof Integer || value instanceof Long) {
            long number = ((Number) value).longValue();
            if (number < 0 || number > MAX_INTEGER) throw new IllegalArgumentException("Invalid OAP integer");
            out.append(number); return;
        }
        throw new IllegalArgumentException("Unsupported OAP value");
    }
    private static void quote(StringBuilder out, String text) {
        out.append('"');
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            switch (c) {
                case '"': out.append("\\\""); break;
                case '\\': out.append("\\\\"); break;
                case '\b': out.append("\\b"); break;
                case '\f': out.append("\\f"); break;
                case '\n': out.append("\\n"); break;
                case '\r': out.append("\\r"); break;
                case '\t': out.append("\\t"); break;
                default:
                    if (c < 0x20) {
                        out.append("\\u00").append(Character.forDigit(c >> 4, 16)).append(Character.forDigit(c & 15, 16));
                    } else if (Character.isHighSurrogate(c)) {
                        if (i + 1 >= text.length() || !Character.isLowSurrogate(text.charAt(i + 1)))
                            throw new IllegalArgumentException("Invalid OAP Unicode");
                        out.append(c).append(text.charAt(++i));
                    } else if (Character.isLowSurrogate(c)) throw new IllegalArgumentException("Invalid OAP Unicode");
                    else out.append(c);
            }
        }
        out.append('"');
    }
}
