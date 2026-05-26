package com.spareai.servlets;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.spareai.dao.ConsumptionDAO;
import com.spareai.dao.InventoryDAO;
import com.spareai.model.InventoryItem;
import com.spareai.util.JsonUtil;
import com.spareai.util.MaterialParamDefaults;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import java.io.IOException;
import java.math.BigDecimal;
import java.sql.SQLException;
import java.util.List;
import java.util.Map;

public class ParametersServlet extends BaseServlet {
    private final InventoryDAO inventoryDAO = new InventoryDAO();
    private final ConsumptionDAO consumptionDAO = new ConsumptionDAO();

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String p = path(req);
        try {
            if (p.equals("/") || p.equals("/list")) {
                List<InventoryItem> items = inventoryDAO.listAll();
                Map<String, BigDecimal> avgDaily = consumptionDAO.avgDailyByAllMaterials(
                        ConsumptionDAO.CONSUMPTION_RATE_LOOKBACK_DAYS);
                for (InventoryItem it : items) {
                    BigDecimal rate = avgDaily.get(it.getMaterialCode());
                    if (rate != null) it.setAvgDailyConsumption(rate);
                }
                JsonObject data = new JsonObject();
                data.add("items", JsonUtil.GSON.toJsonTree(items));
                data.addProperty("total", items.size());
                ok(resp, data);
                return;
            }
            fail(resp, HttpServletResponse.SC_NOT_FOUND, "NOT_FOUND", "Unknown route");
        } catch (SQLException e) {
            fail(resp, HttpServletResponse.SC_INTERNAL_SERVER_ERROR, "DB_ERROR", e.getMessage());
        }
    }

    @Override
    protected void doPut(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String p = path(req);
        String[] parts = p.split("/");
        if (parts.length < 2 || parts[1].isBlank()) {
            fail(resp, HttpServletResponse.SC_NOT_FOUND, "NOT_FOUND", "Material code required");
            return;
        }
        String code = parts[1];
        try {
            InventoryItem existing = inventoryDAO.getByCode(code);
            if (existing == null) {
                fail(resp, HttpServletResponse.SC_NOT_FOUND, "NOT_FOUND", "Item not found: " + code);
                return;
            }
            JsonObject body = JsonUtil.parseBody(req);
            InventoryItem params = mergeParameters(existing, body);
            validateParameters(params);
            inventoryDAO.updateParametersByCode(code, params);
            JsonObject data = new JsonObject();
            data.addProperty("updated", true);
            data.addProperty("material_code", code);
            ok(resp, data);
        } catch (IllegalArgumentException e) {
            handleBadRequest(resp, e);
        } catch (SQLException e) {
            fail(resp, HttpServletResponse.SC_INTERNAL_SERVER_ERROR, "DB_ERROR", e.getMessage());
        }
    }

    @Override
    protected void doPost(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String p = path(req);
        if (!"/bulk".equals(p)) {
            fail(resp, HttpServletResponse.SC_NOT_FOUND, "NOT_FOUND", "Unknown route");
            return;
        }
        try {
            JsonObject body = JsonUtil.parseBody(req);
            if (!body.has("updates") || !body.get("updates").isJsonArray()) {
                throw new IllegalArgumentException("VALIDATION_ERROR:updates array is required");
            }
            JsonArray updates = body.getAsJsonArray("updates");
            int updated = 0;
            JsonArray errors = new JsonArray();
            for (JsonElement el : updates) {
                if (!el.isJsonObject()) continue;
                JsonObject row = el.getAsJsonObject();
                String code = row.has("material_code")
                        ? row.get("material_code").getAsString()
                        : row.has("materialCode") ? row.get("materialCode").getAsString() : null;
                if (code == null || code.isBlank()) {
                    JsonObject err = new JsonObject();
                    err.addProperty("message", "material_code is required");
                    errors.add(err);
                    continue;
                }
                try {
                    InventoryItem existing = inventoryDAO.getByCode(code);
                    if (existing == null) {
                        JsonObject err = new JsonObject();
                        err.addProperty("material_code", code);
                        err.addProperty("message", "Item not found");
                        errors.add(err);
                        continue;
                    }
                    InventoryItem params = mergeParameters(existing, row);
                    validateParameters(params);
                    inventoryDAO.updateParametersByCode(code, params);
                    updated++;
                } catch (IllegalArgumentException e) {
                    JsonObject err = new JsonObject();
                    err.addProperty("material_code", code);
                    err.addProperty("message", e.getMessage());
                    errors.add(err);
                }
            }
            JsonObject data = new JsonObject();
            data.addProperty("updated", updated);
            data.add("errors", errors);
            ok(resp, data);
        } catch (IllegalArgumentException e) {
            handleBadRequest(resp, e);
        } catch (SQLException e) {
            fail(resp, HttpServletResponse.SC_INTERNAL_SERVER_ERROR, "DB_ERROR", e.getMessage());
        }
    }

    static InventoryItem mergeParameters(InventoryItem existing, JsonObject body) {
        InventoryItem it = new InventoryItem();
        it.setMaterialCode(existing.getMaterialCode());
        it.setReorderLevel(jsonDecimal(body, "reorder_level", "reorderLevel", existing.getReorderLevel()));
        it.setSafetyStock(jsonNullableDecimal(body, "safety_stock", "safetyStock", existing.getSafetyStock()));
        it.setCriticalPct(jsonDecimal(body, "critical_pct", "criticalPct", existing.getCriticalPct()));
        it.setUrgentDays(jsonInt(body, "urgent_days", "urgentDays", existing.getUrgentDays()));
        it.setWarningDays(jsonInt(body, "warning_days", "warningDays", existing.getWarningDays()));
        it.setOverstockMultiplier(jsonDecimal(body, "overstock_multiplier", "overstockMultiplier", existing.getOverstockMultiplier()));
        it.setReorderQtyFactor(jsonDecimal(body, "reorder_qty_factor", "reorderQtyFactor", existing.getReorderQtyFactor()));
        it.setLeadTimeDays(jsonNullableInt(body, "lead_time_days", "leadTimeDays", existing.getLeadTimeDays()));
        it.setMaxStock(jsonNullableDecimal(body, "max_stock", "maxStock", existing.getMaxStock()));
        it.setMinOrderQty(jsonNullableDecimal(body, "min_order_qty", "minOrderQty", existing.getMinOrderQty()));
        it.setAlertsEnabled(jsonBoolean(body, "alerts_enabled", "alertsEnabled", existing.getAlertsEnabled()));
        it.setPriority(jsonInt(body, "priority", "priority", existing.getPriority()));
        it.setParamNotes(jsonString(body, "param_notes", "paramNotes", existing.getParamNotes()));
        return it;
    }

    static void validateParameters(InventoryItem it) {
        BigDecimal criticalPct = it.getCriticalPct() == null ? MaterialParamDefaults.CRITICAL_PCT : it.getCriticalPct();
        if (criticalPct.compareTo(BigDecimal.ZERO) < 0 || criticalPct.compareTo(BigDecimal.ONE) > 0) {
            throw new IllegalArgumentException("VALIDATION_ERROR:critical_pct must be between 0 and 1");
        }
        int urgent = it.getUrgentDays() == null ? MaterialParamDefaults.URGENT_DAYS : it.getUrgentDays();
        int warning = it.getWarningDays() == null ? MaterialParamDefaults.WARNING_DAYS : it.getWarningDays();
        if (urgent < 1) {
            throw new IllegalArgumentException("VALIDATION_ERROR:urgent_days must be at least 1");
        }
        if (warning <= urgent) {
            throw new IllegalArgumentException("VALIDATION_ERROR:warning_days must be greater than urgent_days");
        }
        BigDecimal overstock = it.getOverstockMultiplier() == null ? MaterialParamDefaults.OVERSTOCK_MULTIPLIER : it.getOverstockMultiplier();
        if (overstock.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("VALIDATION_ERROR:overstock_multiplier must be positive");
        }
        BigDecimal reorderFactor = it.getReorderQtyFactor() == null ? MaterialParamDefaults.REORDER_QTY_FACTOR : it.getReorderQtyFactor();
        if (reorderFactor.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("VALIDATION_ERROR:reorder_qty_factor must be positive");
        }
        if (it.getReorderLevel() != null && it.getReorderLevel().compareTo(BigDecimal.ZERO) < 0) {
            throw new IllegalArgumentException("VALIDATION_ERROR:reorder_level cannot be negative");
        }
    }

    private static BigDecimal jsonDecimal(JsonObject body, String snake, String camel, BigDecimal fallback) {
        if (body.has(snake) && !body.get(snake).isJsonNull()) return body.get(snake).getAsBigDecimal();
        if (body.has(camel) && !body.get(camel).isJsonNull()) return body.get(camel).getAsBigDecimal();
        return fallback;
    }

    private static BigDecimal jsonNullableDecimal(JsonObject body, String snake, String camel, BigDecimal fallback) {
        if (body.has(snake)) {
            return body.get(snake).isJsonNull() ? null : body.get(snake).getAsBigDecimal();
        }
        if (body.has(camel)) {
            return body.get(camel).isJsonNull() ? null : body.get(camel).getAsBigDecimal();
        }
        return fallback;
    }

    private static Integer jsonInt(JsonObject body, String snake, String camel, Integer fallback) {
        if (body.has(snake) && !body.get(snake).isJsonNull()) return body.get(snake).getAsInt();
        if (body.has(camel) && !body.get(camel).isJsonNull()) return body.get(camel).getAsInt();
        return fallback;
    }

    private static Integer jsonNullableInt(JsonObject body, String snake, String camel, Integer fallback) {
        if (body.has(snake)) {
            return body.get(snake).isJsonNull() ? null : body.get(snake).getAsInt();
        }
        if (body.has(camel)) {
            return body.get(camel).isJsonNull() ? null : body.get(camel).getAsInt();
        }
        return fallback;
    }

    private static Boolean jsonBoolean(JsonObject body, String snake, String camel, Boolean fallback) {
        if (body.has(snake) && !body.get(snake).isJsonNull()) return body.get(snake).getAsBoolean();
        if (body.has(camel) && !body.get(camel).isJsonNull()) return body.get(camel).getAsBoolean();
        return fallback;
    }

    private static String jsonString(JsonObject body, String snake, String camel, String fallback) {
        if (body.has(snake)) {
            return body.get(snake).isJsonNull() ? null : body.get(snake).getAsString();
        }
        if (body.has(camel)) {
            return body.get(camel).isJsonNull() ? null : body.get(camel).getAsString();
        }
        return fallback;
    }
}
