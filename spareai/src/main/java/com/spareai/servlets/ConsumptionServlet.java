package com.spareai.servlets;

import com.google.gson.JsonObject;
import com.spareai.dao.ConsumptionDAO;
import com.spareai.model.ConsumptionLog;
import com.spareai.util.JsonUtil;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import java.io.IOException;
import java.math.BigDecimal;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

public class ConsumptionServlet extends BaseServlet {
    private final ConsumptionDAO consumptionDAO = new ConsumptionDAO();

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String p = path(req);
        String[] parts = p.split("/");
        try {
            if (p.equals("/") || p.equals("/history")) {
                String code = req.getParameter("code");
                LocalDate from = parseDate(req.getParameter("from"));
                LocalDate to = parseDate(req.getParameter("to"));
                int page = parseInt(req.getParameter("page"), 1);
                int pageSize = parseInt(req.getParameter("page_size"), 50);

                Map<String, Object> data = consumptionDAO.history(code, from, to, page, pageSize);
                ok(resp, JsonUtil.GSON.toJsonTree(data));
                return;
            }

            // GET /monthly/{code}
            if (parts.length >= 3 && "monthly".equals(parts[1])) {
                String code = parts[2];
                List<Map<String, Object>> monthly = consumptionDAO.monthlyTotals(code);
                JsonObject data = new JsonObject();
                data.add("monthly", JsonUtil.GSON.toJsonTree(monthly));
                ok(resp, data);
                return;
            }

            fail(resp, HttpServletResponse.SC_NOT_FOUND, "NOT_FOUND", "Unknown route");
        } catch (IllegalArgumentException e) {
            handleBadRequest(resp, e);
        } catch (SQLException e) {
            fail(resp, HttpServletResponse.SC_INTERNAL_SERVER_ERROR, "DB_ERROR", e.getMessage());
        } catch (Exception e) {
            fail(resp, HttpServletResponse.SC_INTERNAL_SERVER_ERROR, "SERVER_ERROR", e.getMessage());
        }
    }

    @Override
    protected void doPost(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String p = path(req);
        if (!p.equals("/record")) {
            fail(resp, HttpServletResponse.SC_NOT_FOUND, "NOT_FOUND", "Unknown route");
            return;
        }

        try {
            JsonObject body = JsonUtil.parseBody(req);
            ConsumptionLog log = parseConsumption(body);
            String sourceIp = req.getRemoteAddr();
            int logId = consumptionDAO.record(log, sourceIp);
            JsonObject data = new JsonObject();
            data.addProperty("log_id", logId);
            created(resp, data);
        } catch (IllegalArgumentException e) {
            handleBadRequest(resp, e);
        } catch (SQLException e) {
            String msg = e.getMessage() == null ? "Database error" : e.getMessage();
            if (msg.toLowerCase().contains("not found")) {
                fail(resp, HttpServletResponse.SC_NOT_FOUND, "NOT_FOUND", msg);
            } else {
                fail(resp, HttpServletResponse.SC_INTERNAL_SERVER_ERROR, "DB_ERROR", msg);
            }
        } catch (Exception e) {
            fail(resp, HttpServletResponse.SC_INTERNAL_SERVER_ERROR, "SERVER_ERROR", e.getMessage());
        }
    }

    @Override
    protected void doPut(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String p = path(req);
        String[] parts = p.split("/");
        // PUT /edit/{log_id}
        if (parts.length < 3 || !"edit".equals(parts[1])) {
            fail(resp, HttpServletResponse.SC_NOT_FOUND, "NOT_FOUND", "Unknown route");
            return;
        }

        int logId = parseInt(parts[2], -1);
        if (logId <= 0) {
            fail(resp, HttpServletResponse.SC_BAD_REQUEST, "VALIDATION_ERROR", "log_id must be a positive integer");
            return;
        }

        try {
            JsonObject body = JsonUtil.parseBody(req);
            ConsumptionLog updates = parseConsumption(body);
            String reason = body.has("reason") ? body.get("reason").getAsString() : null;
            String sourceIp = req.getRemoteAddr();

            boolean ok = consumptionDAO.edit(logId, updates, reason, sourceIp);
            if (!ok) {
                fail(resp, HttpServletResponse.SC_NOT_FOUND, "NOT_FOUND", "Consumption log not found: " + logId);
                return;
            }
            JsonObject data = new JsonObject();
            data.addProperty("updated", true);
            ok(resp, data);
        } catch (IllegalArgumentException e) {
            handleBadRequest(resp, e);
        } catch (SQLException e) {
            fail(resp, HttpServletResponse.SC_INTERNAL_SERVER_ERROR, "DB_ERROR", e.getMessage());
        } catch (Exception e) {
            fail(resp, HttpServletResponse.SC_INTERNAL_SERVER_ERROR, "SERVER_ERROR", e.getMessage());
        }
    }

    @Override
    protected void doDelete(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String p = path(req);
        String[] parts = p.split("/");
        // DELETE /delete/{log_id}
        if (parts.length < 3 || !"delete".equals(parts[1])) {
            fail(resp, HttpServletResponse.SC_NOT_FOUND, "NOT_FOUND", "Unknown route");
            return;
        }

        int logId = parseInt(parts[2], -1);
        if (logId <= 0) {
            fail(resp, HttpServletResponse.SC_BAD_REQUEST, "VALIDATION_ERROR", "log_id must be a positive integer");
            return;
        }

        try {
            String reason = req.getParameter("reason");
            String sourceIp = req.getRemoteAddr();
            boolean ok = consumptionDAO.delete(logId, reason, sourceIp);
            if (!ok) {
                fail(resp, HttpServletResponse.SC_NOT_FOUND, "NOT_FOUND", "Consumption log not found: " + logId);
                return;
            }
            JsonObject data = new JsonObject();
            data.addProperty("deleted", true);
            ok(resp, data);
        } catch (SQLException e) {
            fail(resp, HttpServletResponse.SC_INTERNAL_SERVER_ERROR, "DB_ERROR", e.getMessage());
        } catch (Exception e) {
            fail(resp, HttpServletResponse.SC_INTERNAL_SERVER_ERROR, "SERVER_ERROR", e.getMessage());
        }
    }

    private ConsumptionLog parseConsumption(JsonObject body) {
        String code = body.has("material_code") ? body.get("material_code").getAsString() : null;
        if (code == null || code.isBlank()) throw new IllegalArgumentException("VALIDATION_ERROR:material_code is required");

        BigDecimal qty = body.has("consumed_qty") ? body.get("consumed_qty").getAsBigDecimal() : null;
        if (qty == null || qty.signum() <= 0) throw new IllegalArgumentException("VALIDATION_ERROR:consumed_qty must be > 0");

        String dateStr = body.has("consumption_date") ? body.get("consumption_date").getAsString() : null;
        LocalDate date = parseDate(dateStr);
        if (date == null) throw new IllegalArgumentException("VALIDATION_ERROR:consumption_date is required (YYYY-MM-DD)");

        ConsumptionLog log = new ConsumptionLog();
        log.setMaterialCode(code.trim());
        log.setConsumedQty(qty);
        log.setConsumptionDate(date);
        log.setDepartment(body.has("department") && !body.get("department").isJsonNull() ? body.get("department").getAsString() : null);
        log.setRemarks(body.has("remarks") && !body.get("remarks").isJsonNull() ? body.get("remarks").getAsString() : null);
        return log;
    }

    private LocalDate parseDate(String v) {
        if (v == null || v.isBlank()) return null;
        try {
            return LocalDate.parse(v.trim());
        } catch (Exception e) {
            return null;
        }
    }
}
