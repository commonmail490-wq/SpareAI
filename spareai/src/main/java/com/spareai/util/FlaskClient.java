package com.spareai.util;

import com.google.gson.Gson;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

public class FlaskClient {
    private static final Gson GSON = new Gson();

    private final HttpClient httpClient;
    private final String baseUrl;

    public FlaskClient() {
        this.baseUrl = getSetting("SPAREAI_FLASK_URL", "spareai.flask.url", "http://localhost:5001");
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(3))
                .build();
    }

    private static String getSetting(String envKey, String sysPropKey, String defaultValue) {
        String v = System.getenv(envKey);
        if (v != null && !v.isBlank()) return v;
        v = System.getProperty(sysPropKey);
        if (v != null && !v.isBlank()) return v;
        return defaultValue;
    }

    public JsonObject postJson(String path, JsonObject body, Duration timeout) throws IOException, InterruptedException {
        String url = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        String fullUrl = url + (path.startsWith("/") ? path : ("/" + path));

        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(fullUrl))
                .timeout(timeout)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(GSON.toJson(body)))
                .build();

        HttpResponse<String> res = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
        int status = res.statusCode();
        String raw = res.body() == null ? "" : res.body();

        JsonObject parsed;
        try {
            JsonElement el = JsonParser.parseString(raw);
            parsed = el != null && el.isJsonObject() ? el.getAsJsonObject() : new JsonObject();
        } catch (Exception e) {
            parsed = new JsonObject();
        }

        if (status < 200 || status >= 300) {
            String msg = parsed.has("error") ? parsed.get("error").toString() : raw;
            throw new IOException("Flask service error " + status + ": " + msg);
        }

        return parsed;
    }
}
