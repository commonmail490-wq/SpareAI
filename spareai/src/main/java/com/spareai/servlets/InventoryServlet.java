package com.spareai.servlets;

import com.google.gson.JsonObject;
import com.spareai.dao.ConsumptionDAO;
import com.spareai.dao.InventoryDAO;
import com.spareai.model.InventoryItem;
import com.spareai.util.JsonUtil;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import java.io.IOException;
import java.math.BigDecimal;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.sql.SQLException;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;

public class InventoryServlet extends BaseServlet {
    private final InventoryDAO inventoryDAO = new InventoryDAO();
    private final ConsumptionDAO consumptionDAO = new ConsumptionDAO();

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String p = path(req);
        String[] parts = p.split("/");

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

            if (p.equals("/low-stock")) {
                List<InventoryItem> critical = inventoryDAO.lowStockList();
                JsonObject data = new JsonObject();
                data.add("critical", JsonUtil.GSON.toJsonTree(critical));
                ok(resp, data);
                return;
            }

            if (p.equals("/summary")) {
                Map<String, Object> kpis = inventoryDAO.summaryKpis();
                ok(resp, JsonUtil.GSON.toJsonTree(kpis));
                return;
            }

            if (p.equals("/export-csv")) {
                exportCsv(resp);
                return;
            }

            // GET /{code}
            if (parts.length >= 2 && !parts[1].isBlank()) {
                String code = parts[1];
                InventoryItem item = inventoryDAO.getByCode(code);
                if (item == null) {
                    fail(resp, HttpServletResponse.SC_NOT_FOUND, "NOT_FOUND", "Item not found: " + code);
                    return;
                }
                JsonObject data = new JsonObject();
                data.add("item", JsonUtil.GSON.toJsonTree(item));
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
        if (!p.equals("/add")) {
            fail(resp, HttpServletResponse.SC_NOT_FOUND, "NOT_FOUND", "Unknown route");
            return;
        }

        try {
            JsonObject body = JsonUtil.parseBody(req);
            InventoryItem item = parseItem(body, true);
            int id = inventoryDAO.add(item);
            JsonObject data = new JsonObject();
            data.addProperty("item_id", id);
            created(resp, data);
        } catch (IllegalArgumentException e) {
            handleBadRequest(resp, e);
        } catch (SQLException e) {
            String msg = e.getMessage() == null ? "Database error" : e.getMessage();
            fail(resp, HttpServletResponse.SC_INTERNAL_SERVER_ERROR, "DB_ERROR", msg);
        } catch (Exception e) {
            fail(resp, HttpServletResponse.SC_INTERNAL_SERVER_ERROR, "SERVER_ERROR", e.getMessage());
        }
    }

    @Override
    protected void doPut(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String p = path(req);
        String[] parts = p.split("/");
        // PUT /update/{code}
        if (parts.length < 3 || !"/update".equals("/" + parts[1])) {
            fail(resp, HttpServletResponse.SC_NOT_FOUND, "NOT_FOUND", "Unknown route");
            return;
        }

        String code = parts[2];
        try {
            InventoryItem existing = inventoryDAO.getByCode(code);
            if (existing == null) {
                fail(resp, HttpServletResponse.SC_NOT_FOUND, "NOT_FOUND", "Item not found: " + code);
                return;
            }
            JsonObject body = JsonUtil.parseBody(req);
            InventoryItem updates = mergeUpdates(existing, body);
            ParametersServlet.validateParameters(updates);
            inventoryDAO.updateByCode(code, updates);
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

    private InventoryItem parseItem(JsonObject body, boolean requireCode) {
        String code = body.has("material_code") ? body.get("material_code").getAsString() : null;
        if (requireCode && (code == null || code.isBlank())) {
            throw new IllegalArgumentException("VALIDATION_ERROR:material_code is required");
        }

        String itemName = body.has("item_name") ? body.get("item_name").getAsString() : null;
        String category = body.has("category") ? body.get("category").getAsString() : null;
        String unit = body.has("unit") ? body.get("unit").getAsString() : null;

        if (itemName == null || itemName.isBlank()) throw new IllegalArgumentException("VALIDATION_ERROR:item_name is required");
        if (category == null || category.isBlank()) throw new IllegalArgumentException("VALIDATION_ERROR:category is required");
        if (unit == null || unit.isBlank()) throw new IllegalArgumentException("VALIDATION_ERROR:unit is required");

        InventoryItem it = new InventoryItem();
        it.setMaterialCode(code);
        it.setItemName(itemName.trim());
        it.setCategory(category.trim());
        it.setUnit(unit.trim());
        it.setLocation(body.has("location") && !body.get("location").isJsonNull() ? body.get("location").getAsString() : null);
        it.setStockQty(body.has("stock_qty") ? body.get("stock_qty").getAsBigDecimal() : BigDecimal.ZERO);
        it.setReorderLevel(body.has("reorder_level") ? body.get("reorder_level").getAsBigDecimal() : BigDecimal.ZERO);
        it.setUnitCost(body.has("unit_cost") ? body.get("unit_cost").getAsBigDecimal() : BigDecimal.ZERO);
        return it;
    }

    private InventoryItem mergeUpdates(InventoryItem existing, JsonObject body) {
        if (body == null || body.entrySet().isEmpty()) {
            throw new IllegalArgumentException("VALIDATION_ERROR:Request body cannot be empty for update");
        }

        InventoryItem it = new InventoryItem();
        it.setMaterialCode(existing.getMaterialCode());

        String itemName = body.has("item_name") ? body.get("item_name").getAsString() : existing.getItemName();
        String category = body.has("category") ? body.get("category").getAsString() : existing.getCategory();
        String unit = body.has("unit") ? body.get("unit").getAsString() : existing.getUnit();

        if (itemName == null || itemName.isBlank()) throw new IllegalArgumentException("VALIDATION_ERROR:item_name is required");
        if (category == null || category.isBlank()) throw new IllegalArgumentException("VALIDATION_ERROR:category is required");
        if (unit == null || unit.isBlank()) throw new IllegalArgumentException("VALIDATION_ERROR:unit is required");

        it.setItemName(itemName.trim());
        it.setCategory(category.trim());
        it.setUnit(unit.trim());
        it.setLocation(body.has("location")
                ? (body.get("location").isJsonNull() ? null : body.get("location").getAsString())
                : existing.getLocation());

        it.setStockQty(body.has("stock_qty") ? body.get("stock_qty").getAsBigDecimal() : existing.getStockQty());
        it.setUnitCost(body.has("unit_cost") ? body.get("unit_cost").getAsBigDecimal() : existing.getUnitCost());
        InventoryItem withParams = ParametersServlet.mergeParameters(existing, body);
        it.setReorderLevel(withParams.getReorderLevel());
        it.setSafetyStock(withParams.getSafetyStock());
        it.setCriticalPct(withParams.getCriticalPct());
        it.setUrgentDays(withParams.getUrgentDays());
        it.setWarningDays(withParams.getWarningDays());
        it.setOverstockMultiplier(withParams.getOverstockMultiplier());
        it.setReorderQtyFactor(withParams.getReorderQtyFactor());
        it.setLeadTimeDays(withParams.getLeadTimeDays());
        it.setMaxStock(withParams.getMaxStock());
        it.setMinOrderQty(withParams.getMinOrderQty());
        it.setAlertsEnabled(withParams.getAlertsEnabled());
        it.setPriority(withParams.getPriority());
        it.setParamNotes(withParams.getParamNotes());
        return it;
    }

    private void exportCsv(HttpServletResponse resp) throws SQLException, IOException {
        List<InventoryItem> items = inventoryDAO.listAll();

        String fileName = "spareai-inventory.csv";
        resp.setStatus(HttpServletResponse.SC_OK);
        resp.setCharacterEncoding(StandardCharsets.UTF_8.name());
        resp.setContentType("text/csv");
        resp.setHeader("Content-Disposition", "attachment; filename=\"" + URLEncoder.encode(fileName, StandardCharsets.UTF_8) + "\"");

        StringBuilder sb = new StringBuilder();
        sb.append("material_code,item_name,category,unit,location,stock_qty,reorder_level,unit_cost,last_updated\n");
        DateTimeFormatter fmt = DateTimeFormatter.ISO_INSTANT;
        for (InventoryItem it : items) {
            sb.append(escape(it.getMaterialCode())).append(',')
              .append(escape(it.getItemName())).append(',')
              .append(escape(it.getCategory())).append(',')
              .append(escape(it.getUnit())).append(',')
              .append(escape(it.getLocation())).append(',')
              .append(num(it.getStockQty())).append(',')
              .append(num(it.getReorderLevel())).append(',')
              .append(num(it.getUnitCost())).append(',');
            sb.append(it.getLastUpdated() == null ? "" : fmt.format(it.getLastUpdated()));
            sb.append('\n');
        }
        resp.getWriter().write(sb.toString());
    }

    private String num(BigDecimal v) {
        return v == null ? "0" : v.toPlainString();
    }

    private String escape(String s) {
        if (s == null) return "";
        String v = s.replace("\"", "\"\"");
        if (v.contains(",") || v.contains("\n") || v.contains("\r") || v.contains("\"")) {
            return "\"" + v + "\"";
        }
        return v;
    }
}
