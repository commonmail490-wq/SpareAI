package com.spareai.util;

import com.google.gson.*;
import jakarta.servlet.http.HttpServletRequest;

import java.io.BufferedReader;
import java.io.IOException;
import java.lang.reflect.Type;
import java.time.Instant;
import java.util.stream.Collectors;

public final class JsonUtil {

    public static final Gson GSON = new GsonBuilder()
            .registerTypeAdapter(Instant.class, new JsonSerializer<Instant>() {
                @Override
                public JsonElement serialize(Instant src, Type typeOfSrc, JsonSerializationContext ctx) {
                    return new JsonPrimitive(src.toString());
                }
            })
            .registerTypeAdapter(Instant.class, new JsonDeserializer<Instant>() {
                @Override
                public Instant deserialize(JsonElement json, Type typeOfT, JsonDeserializationContext ctx)
                        throws JsonParseException {
                    return Instant.parse(json.getAsString());
                }
            })
            .registerTypeAdapter(java.time.LocalDate.class, new JsonSerializer<java.time.LocalDate>() {
                @Override
                public JsonElement serialize(java.time.LocalDate src, Type typeOfSrc, JsonSerializationContext ctx) {
                    return new JsonPrimitive(src.toString());
                }
            })
            .registerTypeAdapter(java.time.LocalDate.class, new JsonDeserializer<java.time.LocalDate>() {
                @Override
                public java.time.LocalDate deserialize(JsonElement json, Type typeOfT, JsonDeserializationContext ctx)
                        throws JsonParseException {
                    return java.time.LocalDate.parse(json.getAsString());
                }
            })
            .registerTypeAdapter(java.time.LocalDateTime.class, new JsonSerializer<java.time.LocalDateTime>() {
                @Override
                public JsonElement serialize(java.time.LocalDateTime src, Type typeOfSrc, JsonSerializationContext ctx) {
                    return new JsonPrimitive(src.toString());
                }
            })
            .registerTypeAdapter(java.time.LocalDateTime.class, new JsonDeserializer<java.time.LocalDateTime>() {
                @Override
                public java.time.LocalDateTime deserialize(JsonElement json, Type typeOfT, JsonDeserializationContext ctx)
                        throws JsonParseException {
                    return java.time.LocalDateTime.parse(json.getAsString());
                }
            })
            .create();

    private JsonUtil() {}

    public static JsonObject parseBody(HttpServletRequest req) throws IOException {
        try (BufferedReader br = req.getReader()) {
            String raw = br.lines().collect(Collectors.joining("\n")).trim();
            if (raw.isEmpty()) return new JsonObject();
            JsonElement el = JsonParser.parseString(raw);
            if (el != null && el.isJsonObject()) return el.getAsJsonObject();
            return new JsonObject();
        }
    }

    public static JsonObject success(JsonElement data) {
        JsonObject out = new JsonObject();
        out.addProperty("success", true);
        out.add("data", data == null ? new JsonObject() : data);
        return out;
    }

    public static JsonObject successObject(JsonObject data) {
        JsonObject out = new JsonObject();
        out.addProperty("success", true);
        out.add("data", data == null ? new JsonObject() : data);
        return out;
    }

    public static JsonObject error(String code, String message) {
        JsonObject out = new JsonObject();
        out.addProperty("success", false);
        JsonObject err = new JsonObject();
        err.addProperty("code", code);
        err.addProperty("message", message);
        out.add("error", err);
        return out;
    }
}