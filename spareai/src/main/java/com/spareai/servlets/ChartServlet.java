package com.spareai.servlets;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.spareai.dao.ConsumptionDAO;
import com.spareai.dao.InventoryDAO;
import com.spareai.model.InventoryItem;
import com.spareai.util.DBConnection;
import com.spareai.util.JsonUtil;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import java.io.IOException;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class ChartServlet extends BaseServlet {
    private final InventoryDAO inventoryDAO = new InventoryDAO();
    private final ConsumptionDAO consumptionDAO = new ConsumptionDAO();

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String p = path(req);
        String[] parts = p.split("/");

        try {
            if (p.equals("/stock-levels")) {
                ok(resp, stockLevels());
                return;
            }

            if (parts.length >= 3 && "consumption-trend".equals(parts[1])) {
                ok(resp, consumptionTrend(parts[2]));
                return;
            }

            if (parts.length >= 3 && "forecast".equals(parts[1])) {
                ok(resp, forecastChart(parts[2]));
                return;
            }

            if (p.equals("/category-distribution")) {
                ok(resp, categoryDistribution());
                return;
            }

            if (p.equals("/department-consumption")) {
                ok(resp, departmentConsumption());
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

    private JsonObject stockLevels() throws SQLException {
        List<InventoryItem> items = inventoryDAO.listAll();
        JsonArray labels = new JsonArray();
        JsonArray data = new JsonArray();
        for (InventoryItem it : items) {
            labels.add(it.getMaterialCode());
            data.add(it.getStockQty() == null ? 0 : it.getStockQty().doubleValue());
        }
        JsonObject ds = new JsonObject();
        ds.addProperty("label", "Stock Qty");
        ds.add("data", data);
        JsonArray datasets = new JsonArray();
        datasets.add(ds);
        JsonObject out = new JsonObject();
        out.add("labels", labels);
        out.add("datasets", datasets);
        return out;
    }

    private JsonObject consumptionTrend(String code) throws SQLException {
        List<Map<String, Object>> monthly = consumptionDAO.monthlyTotals(code);
        JsonArray labels = new JsonArray();
        JsonArray data = new JsonArray();
        for (Map<String, Object> row : monthly) {
            labels.add(String.valueOf(row.get("month")));
            data.add(JsonUtil.GSON.toJsonTree(row.get("total")));
        }
        JsonObject ds = new JsonObject();
        ds.addProperty("label", "Monthly Consumption");
        ds.add("data", data);
        JsonArray datasets = new JsonArray();
        datasets.add(ds);
        JsonObject out = new JsonObject();
        out.add("labels", labels);
        out.add("datasets", datasets);
        return out;
    }

    private JsonObject forecastChart(String code) throws SQLException {
        // Chart endpoint is designed to be Chart.js-ready and lightweight.
        // It reads forecast cache if present; otherwise client should call /api/forecast/{code} first.
        String sql = "SELECT forecast_json FROM forecast_cache WHERE material_code=? AND forecast_horizon=30 AND expires_at > NOW()";
        String raw = null;
        try (Connection c = DBConnection.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, code);
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) raw = rs.getString("forecast_json");
            }
        }
        JsonArray rows = new JsonArray();
        try {
            if (raw != null && !raw.isBlank()) rows = JsonUtil.GSON.fromJson(raw, JsonArray.class);
        } catch (Exception ignored) {}

        JsonArray labels = new JsonArray();
        JsonArray yhat = new JsonArray();
        JsonArray lower = new JsonArray();
        JsonArray upper = new JsonArray();
        for (int i = 0; i < rows.size(); i++) {
            if (!rows.get(i).isJsonObject()) continue;
            JsonObject r = rows.get(i).getAsJsonObject();
            if (r.has("ds")) labels.add(r.get("ds").getAsString());
            yhat.add(r.has("yhat") ? r.get("yhat").getAsDouble() : 0);
            lower.add(r.has("yhat_lower") ? r.get("yhat_lower").getAsDouble() : 0);
            upper.add(r.has("yhat_upper") ? r.get("yhat_upper").getAsDouble() : 0);
        }

        JsonObject ds1 = new JsonObject();
        ds1.addProperty("label", "Forecast (yhat)");
        ds1.add("data", yhat);

        JsonObject ds2 = new JsonObject();
        ds2.addProperty("label", "Lower");
        ds2.add("data", lower);

        JsonObject ds3 = new JsonObject();
        ds3.addProperty("label", "Upper");
        ds3.add("data", upper);

        JsonArray datasets = new JsonArray();
        datasets.add(ds1);
        datasets.add(ds2);
        datasets.add(ds3);

        JsonObject out = new JsonObject();
        out.add("labels", labels);
        out.add("datasets", datasets);
        out.addProperty("cached", raw != null);
        return out;
    }

    private JsonObject categoryDistribution() throws SQLException {
        // Use stock value by category (more useful than pure qty in many dashboards)
        String sql = "SELECT category, COALESCE(SUM(stock_qty * COALESCE(unit_cost,0)),0) AS value " +
                "FROM inventory_items GROUP BY category ORDER BY value DESC";
        JsonArray labels = new JsonArray();
        JsonArray data = new JsonArray();
        try (Connection c = DBConnection.getConnection();
             PreparedStatement ps = c.prepareStatement(sql);
             ResultSet rs = ps.executeQuery()) {
            while (rs.next()) {
                labels.add(rs.getString("category"));
                data.add(rs.getBigDecimal("value"));
            }
        }

        JsonObject ds = new JsonObject();
        ds.addProperty("label", "Stock Value");
        ds.add("data", data);
        JsonArray datasets = new JsonArray();
        datasets.add(ds);

        JsonObject out = new JsonObject();
        out.add("labels", labels);
        out.add("datasets", datasets);
        return out;
    }

    private JsonObject departmentConsumption() throws SQLException {
        // Stacked bar: last 6 months, department-wise totals
        String sql = "SELECT DATE_FORMAT(consumption_date, '%Y-%m') AS month, COALESCE(department,'Unknown') AS dept, " +
                "SUM(consumed_qty) AS total " +
                "FROM consumption_log " +
                "WHERE consumption_date >= (CURDATE() - INTERVAL 180 DAY) " +
                "GROUP BY DATE_FORMAT(consumption_date, '%Y-%m'), COALESCE(department,'Unknown') " +
                "ORDER BY month";

        // month -> (dept -> total)
        Map<String, Map<String, Double>> matrix = new LinkedHashMap<>();
        List<String> depts = new ArrayList<>();

        try (Connection c = DBConnection.getConnection();
             PreparedStatement ps = c.prepareStatement(sql);
             ResultSet rs = ps.executeQuery()) {
            while (rs.next()) {
                String month = rs.getString("month");
                String dept = rs.getString("dept");
                double total = rs.getBigDecimal("total").doubleValue();

                matrix.computeIfAbsent(month, k -> new HashMap<>()).put(dept, total);
                if (!depts.contains(dept)) depts.add(dept);
            }
        }

        JsonArray labels = new JsonArray();
        for (String month : matrix.keySet()) labels.add(month);

        JsonArray datasets = new JsonArray();
        for (String dept : depts) {
            JsonObject ds = new JsonObject();
            ds.addProperty("label", dept);
            JsonArray d = new JsonArray();
            for (String month : matrix.keySet()) {
                Double v = matrix.get(month).get(dept);
                d.add(v == null ? 0 : v);
            }
            ds.add("data", d);
            datasets.add(ds);
        }

        JsonObject out = new JsonObject();
        out.add("labels", labels);
        out.add("datasets", datasets);
        return out;
    }
}
