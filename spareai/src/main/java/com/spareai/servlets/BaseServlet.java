package com.spareai.servlets;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.spareai.util.JsonUtil;

import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

public abstract class BaseServlet extends HttpServlet {

    protected void writeJson(HttpServletResponse resp, int status, JsonObject payload) throws IOException {
        resp.setStatus(status);
        resp.setCharacterEncoding(StandardCharsets.UTF_8.name());
        resp.setContentType("application/json");
        resp.getWriter().write(JsonUtil.GSON.toJson(payload));
    }

    protected void ok(HttpServletResponse resp, JsonElement data) throws IOException {
        writeJson(resp, HttpServletResponse.SC_OK, JsonUtil.success(data));
    }

    protected void created(HttpServletResponse resp, JsonObject data) throws IOException {
        JsonObject out = new JsonObject();
        out.addProperty("success", true);
        out.add("data", data == null ? new JsonObject() : data);
        writeJson(resp, HttpServletResponse.SC_CREATED, out);
    }

    protected void fail(HttpServletResponse resp, int status, String code, String message) throws IOException {
        writeJson(resp, status, JsonUtil.error(code, message));
    }

    protected String path(HttpServletRequest req) {
        String pi = req.getPathInfo();
        if (pi == null || pi.isBlank()) return "/";
        return pi;
    }

    protected String requirePathSegment(String[] parts, int index, String code, String message) {
        if (parts.length <= index || parts[index] == null || parts[index].isBlank()) {
            throw new IllegalArgumentException(code + ":" + message);
        }
        return parts[index];
    }

    protected int parseInt(String v, int defaultValue) {
        if (v == null || v.isBlank()) return defaultValue;
        try {
            return Integer.parseInt(v.trim());
        } catch (Exception e) {
            return defaultValue;
        }
    }

    protected void handleBadRequest(HttpServletResponse resp, Exception e) throws IOException {
        String msg = e.getMessage() == null ? "Invalid request" : e.getMessage();
        String code = "BAD_REQUEST";
        String outMsg = msg;
        // internal convention: "CODE:Message"
        if (msg.contains(":")) {
            String[] p = msg.split(":", 2);
            if (p.length == 2) {
                code = p[0];
                outMsg = p[1];
            }
        }
        int status = HttpServletResponse.SC_BAD_REQUEST;
        if ("NOT_FOUND".equals(code)) status = HttpServletResponse.SC_NOT_FOUND;
        fail(resp, status, code, outMsg);
    }
}
