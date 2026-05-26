package com.spareai.servlets;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.spareai.dao.ConsumptionDAO;
import com.spareai.dao.ForecastDAO;
import com.spareai.dao.InventoryDAO;
import com.spareai.model.ForecastCache;
import com.spareai.model.InventoryItem;
import com.spareai.util.DBConnection;
import com.spareai.util.FlaskClient;
import com.spareai.util.JsonUtil;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import java.io.IOException;
import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Duration;
import java.time.LocalDate;
import java.math.RoundingMode;
import java.util.List;
import java.util.Map;

public class ForecastServlet extends BaseServlet {
    private final ForecastDAO forecastDAO = new ForecastDAO();
    private final ConsumptionDAO consumptionDAO = new ConsumptionDAO();
    private final InventoryDAO inventoryDAO = new InventoryDAO();
    private final FlaskClient flaskClient = new FlaskClient();

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String p = path(req);
        String[] parts = p.split("/");

        try {
            if (parts.length >= 2 && "all".equals(parts[1])) {
                int horizon = parseHorizon(req.getParameter("horizon"), 30);
                handleAll(req, resp, horizon);
                return;
            }

            if (parts.length >= 3 && "reorder".equals(parts[1])) {
                String code = parts[2];
                handleReorder(req, resp, code);
                return;
            }

            if (parts.length >= 2 && "critical".equals(parts[1])) {
                handleCritical(req, resp);
                return;
            }

            // GET /{code}?horizon=30
            if (parts.length >= 2 && parts[1] != null && !parts[1].isBlank()) {
                String code = parts[1];
                int horizon = parseHorizon(req.getParameter("horizon"), 30);
                JsonObject data = getForecastForCode(code, horizon, false);
                ok(resp, data);
                return;
            }

            fail(resp, HttpServletResponse.SC_NOT_FOUND, "NOT_FOUND", "Unknown route");
        } catch (IllegalArgumentException e) {
            handleBadRequest(resp, e);
        } catch (SQLException e) {
            fail(resp, HttpServletResponse.SC_INTERNAL_SERVER_ERROR, "DB_ERROR", e.getMessage());
        } catch (IOException e) {
            fail(resp, HttpServletResponse.SC_INTERNAL_SERVER_ERROR, "FORECAST_SERVICE_ERROR", e.getMessage());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            fail(resp, HttpServletResponse.SC_INTERNAL_SERVER_ERROR, "FORECAST_SERVICE_ERROR", "Forecast service call interrupted");
        } catch (Exception e) {
            fail(resp, HttpServletResponse.SC_INTERNAL_SERVER_ERROR, "SERVER_ERROR", e.getMessage());
        }
    }

    @Override
    protected void doPost(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String p = path(req);
        String[] parts = p.split("/");
        // POST /refresh/{code}
        if (parts.length < 3 || !"refresh".equals(parts[1])) {
            fail(resp, HttpServletResponse.SC_NOT_FOUND, "NOT_FOUND", "Unknown route");
            return;
        }

        String code = parts[2];
        int horizon = parseHorizon(req.getParameter("horizon"), 30);
        try {
            JsonObject data = getForecastForCode(code, horizon, true);
            ok(resp, data);
        } catch (IllegalArgumentException e) {
            handleBadRequest(resp, e);
        } catch (SQLException e) {
            fail(resp, HttpServletResponse.SC_INTERNAL_SERVER_ERROR, "DB_ERROR", e.getMessage());
        } catch (IOException e) {
            fail(resp, HttpServletResponse.SC_INTERNAL_SERVER_ERROR, "FORECAST_SERVICE_ERROR", e.getMessage());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            fail(resp, HttpServletResponse.SC_INTERNAL_SERVER_ERROR, "FORECAST_SERVICE_ERROR", "Forecast service call interrupted");
        } catch (Exception e) {
            fail(resp, HttpServletResponse.SC_INTERNAL_SERVER_ERROR, "SERVER_ERROR", e.getMessage());
        }
    }

    private int parseHorizon(String v, int def) {
        int h = parseInt(v, def);
        if (h != 30 && h != 60 && h != 90) {
            throw new IllegalArgumentException("VALIDATION_ERROR:horizon must be 30, 60, or 90");
        }
        return h;
    }

    private JsonObject getForecastForCode(String code, int horizonDays, boolean forceRefresh)
            throws SQLException, IOException, InterruptedException {
        InventoryItem item = inventoryDAO.getByCode(code);
        if (item == null) {
            throw new IllegalArgumentException("NOT_FOUND:Item not found: " + code);
        }

        ForecastCache cached = forecastDAO.getCached(code, horizonDays);
        boolean useCache = !forceRefresh && cached != null && !forecastDAO.isExpired(cached);

        JsonArray forecast;
        String forecastMethod = null;
        String materialCategory = null;
        String forecastGranularity = "monthly";
        boolean cachedFlag;
        if (useCache) {
            JsonObject envelope = parseForecastEnvelope(cached.getForecastJson());
            forecast = envelopeForecast(envelope);
            forecastMethod = envelopeString(envelope, "forecast_method");
            materialCategory = envelopeString(envelope, "material_category");
            String g = envelopeString(envelope, "forecast_granularity");
            if (g != null) forecastGranularity = g;
            cachedFlag = true;
        } else {
            List<Map<String, Object>> series = consumptionDAO.prophetMonthlySeries(code);
            if (series.size() < 6) {
                forecast = movingAverageForecast(series, horizonDays);
                forecastMethod = "moving_average";
                materialCategory = "INSUFFICIENT_HISTORY";
                forecastDAO.save(code, horizonDays,
                        buildEnvelope(forecast, forecastMethod, materialCategory, forecastGranularity).toString());
                cachedFlag = false;
            } else {
                JsonObject body = new JsonObject();
                body.add("data", JsonUtil.GSON.toJsonTree(series));
                body.addProperty("periods", horizonDays);
                JsonObject flask = flaskClient.postJson("/forecast", body, Duration.ofSeconds(60));
                forecast = flask.has("forecast") && flask.get("forecast").isJsonArray()
                        ? flask.getAsJsonArray("forecast")
                        : new JsonArray();
                forecastMethod = flask.has("forecast_method") ? flask.get("forecast_method").getAsString() : null;
                materialCategory = flask.has("material_category") ? flask.get("material_category").getAsString() : null;
                if (flask.has("forecast_granularity")) {
                    forecastGranularity = flask.get("forecast_granularity").getAsString();
                }

                forecastDAO.save(code, horizonDays,
                        buildEnvelope(forecast, forecastMethod, materialCategory, forecastGranularity).toString());
                cachedFlag = false;
            }
        }

        JsonObject data = new JsonObject();
        data.addProperty("material_code", code);
        data.addProperty("horizon_days", horizonDays);
        data.addProperty("cached", cachedFlag);
        data.add("forecast", forecast);
        data.addProperty("forecast_granularity", forecastGranularity);
        if (forecastMethod != null) data.addProperty("forecast_method", forecastMethod);
        if (materialCategory != null) data.addProperty("material_category", materialCategory);
        data.addProperty("current_stock_qty", item.getStockQty() == null ? 0 : item.getStockQty().doubleValue());
        data.addProperty("reorder_level", item.getReorderLevel() == null ? 0 : item.getReorderLevel().doubleValue());
        return data;
    }

    private JsonObject buildEnvelope(JsonArray forecast, String forecastMethod, String materialCategory,
                                     String forecastGranularity) {
        JsonObject envelope = new JsonObject();
        envelope.add("forecast", forecast);
        if (forecastMethod != null) envelope.addProperty("forecast_method", forecastMethod);
        if (materialCategory != null) envelope.addProperty("material_category", materialCategory);
        if (forecastGranularity != null) envelope.addProperty("forecast_granularity", forecastGranularity);
        return envelope;
    }

    private static int horizonDaysToMonths(int horizonDays) {
        return Math.max(1, (int) Math.round(horizonDays / 30.0));
    }

    private JsonObject parseForecastEnvelope(String raw) {
        if (raw == null || raw.isBlank()) return new JsonObject();
        try {
            JsonElement el = JsonParser.parseString(raw);
            if (el != null && el.isJsonObject()) return el.getAsJsonObject();
            if (el != null && el.isJsonArray()) {
                JsonObject legacy = new JsonObject();
                legacy.add("forecast", el.getAsJsonArray());
                return legacy;
            }
        } catch (Exception ignored) {}
        return new JsonObject();
    }

    private JsonArray envelopeForecast(JsonObject envelope) {
        if (envelope != null && envelope.has("forecast") && envelope.get("forecast").isJsonArray()) {
            return envelope.getAsJsonArray("forecast");
        }
        return new JsonArray();
    }

    private String envelopeString(JsonObject envelope, String key) {
        return envelope != null && envelope.has(key) ? envelope.get(key).getAsString() : null;
    }

    private JsonArray parseForecastArray(String raw) {
        return envelopeForecast(parseForecastEnvelope(raw));
    }

    private JsonArray movingAverageForecast(List<Map<String, Object>> series, int horizonDays) {
        BigDecimal sum = BigDecimal.ZERO;
        int n = 0;
        for (int i = Math.max(0, series.size() - 3); i < series.size(); i++) {
            Object y = series.get(i).get("y");
            if (y instanceof BigDecimal) {
                sum = sum.add((BigDecimal) y);
                n++;
            }
        }
        BigDecimal avgMonthly = n == 0 ? BigDecimal.ZERO : sum.divide(BigDecimal.valueOf(n), 6, RoundingMode.HALF_UP);
        double yhat = avgMonthly.doubleValue();
        int horizonMonths = horizonDaysToMonths(horizonDays);
        LocalDate start = LocalDate.now().withDayOfMonth(1).plusMonths(1);

        JsonArray out = new JsonArray();
        for (int i = 0; i < horizonMonths; i++) {
            LocalDate ds = start.plusMonths(i);
            JsonObject row = new JsonObject();
            row.addProperty("ds", ds.toString());
            row.addProperty("yhat", yhat);
            row.addProperty("yhat_lower", yhat * 0.8);
            row.addProperty("yhat_upper", yhat * 1.2);
            out.add(row);
        }
        return out;
    }

    private void handleAll(HttpServletRequest req, HttpServletResponse resp, int horizonDays)
            throws SQLException, IOException {
        List<InventoryItem> items = inventoryDAO.listAll();
        JsonObject forecasts = new JsonObject();
        JsonArray errors = new JsonArray();

        for (InventoryItem it : items) {
            String code = it.getMaterialCode();
            try {
                // For batch: prefer cached only; avoid running Prophet for thousands of items.
                ForecastCache cached = forecastDAO.getCached(code, horizonDays);
                if (cached != null && !forecastDAO.isExpired(cached)) {
                    forecasts.add(code, parseForecastArray(cached.getForecastJson()));
                }
            } catch (Exception e) {
                JsonObject err = new JsonObject();
                err.addProperty("material_code", code);
                err.addProperty("message", e.getMessage());
                errors.add(err);
            }
        }

        JsonObject data = new JsonObject();
        data.addProperty("horizon_days", horizonDays);
        data.add("forecasts", forecasts);
        data.add("errors", errors);
        ok(resp, data);
    }

    private void handleReorder(HttpServletRequest req, HttpServletResponse resp, String code)
            throws SQLException, IOException, InterruptedException {
        int horizon = parseHorizon(req.getParameter("horizon"), 30);
        InventoryItem item = inventoryDAO.getByCode(code);
        if (item == null) {
            fail(resp, HttpServletResponse.SC_NOT_FOUND, "NOT_FOUND", "Item not found: " + code);
            return;
        }

        JsonObject forecastData = getForecastForCode(code, horizon, false);
        JsonArray forecast = forecastData.getAsJsonArray("forecast");

        BigDecimal stock = item.getStockQty() == null ? BigDecimal.ZERO : item.getStockQty();
        BigDecimal reorderLevel = item.getReorderLevel() == null ? BigDecimal.ZERO : item.getReorderLevel();

        BigDecimal totalDemand = BigDecimal.ZERO;
        LocalDate reorderBy = null;
        BigDecimal running = BigDecimal.ZERO;
        for (JsonElement el : forecast) {
            if (!el.isJsonObject()) continue;
            JsonObject row = el.getAsJsonObject();
            BigDecimal yhat = row.has("yhat") ? BigDecimal.valueOf(row.get("yhat").getAsDouble()) : BigDecimal.ZERO;
            totalDemand = totalDemand.add(yhat);
            running = running.add(yhat);
            if (reorderBy == null && running.compareTo(stock) >= 0 && row.has("ds")) {
                reorderBy = LocalDate.parse(row.get("ds").getAsString());
            }
        }

        BigDecimal reorderQty = totalDemand.add(reorderLevel).subtract(stock);
        if (reorderQty.signum() < 0) reorderQty = BigDecimal.ZERO;

        JsonObject data = new JsonObject();
        data.addProperty("material_code", code);
        data.addProperty("horizon_days", horizon);
        data.addProperty("reorder_qty", reorderQty.doubleValue());
        data.addProperty("reorder_by_date", reorderBy == null ? null : reorderBy.toString());
        data.addProperty("current_stock_qty", stock.doubleValue());
        data.addProperty("reorder_level", reorderLevel.doubleValue());
        ok(resp, data);
    }

    private void handleCritical(HttpServletRequest req, HttpServletResponse resp) throws SQLException, IOException {
        List<InventoryItem> items = inventoryDAO.listAll();
        JsonArray critical = new JsonArray();
        for (InventoryItem it : items) {
            String code = it.getMaterialCode();
            BigDecimal stock = it.getStockQty() == null ? BigDecimal.ZERO : it.getStockQty();
            BigDecimal avgDaily = consumptionDAO.avgDailyConsumption(
                    code, ConsumptionDAO.CONSUMPTION_RATE_LOOKBACK_DAYS);
            if (avgDaily.signum() <= 0) continue;

            BigDecimal daysToZero = stock.divide(avgDaily, 2, RoundingMode.HALF_UP);
            if (daysToZero.compareTo(BigDecimal.valueOf(30)) <= 0) {
                JsonObject row = new JsonObject();
                row.addProperty("material_code", code);
                row.addProperty("item_name", it.getItemName());
                row.addProperty("material_description", it.getItemName());
                row.addProperty("stock_qty", stock.doubleValue());
                row.addProperty("avg_daily_consumption", avgDaily.doubleValue());
                row.addProperty("days_to_zero_estimate", daysToZero.doubleValue());
                critical.add(row);
            }
        }
        JsonObject data = new JsonObject();
        data.add("critical", critical);
        ok(resp, data);
    }

}
