package com.spareai.servlets;

import com.google.gson.JsonObject;
import com.spareai.dao.ForecastDAO;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import java.io.IOException;
import java.sql.SQLException;

public class AdminForecastServlet extends BaseServlet {
    private final ForecastDAO forecastDAO = new ForecastDAO();

    @Override
    protected void doPost(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String p = path(req);
        if (!"/clear-all-cache".equals(p)) {
            fail(resp, HttpServletResponse.SC_NOT_FOUND, "NOT_FOUND", "Unknown route");
            return;
        }
        try {
            int deleted = forecastDAO.clearAll();
            JsonObject data = new JsonObject();
            data.addProperty("deleted_rows", deleted);
            ok(resp, data);
        } catch (SQLException e) {
            fail(resp, HttpServletResponse.SC_INTERNAL_SERVER_ERROR, "DB_ERROR", e.getMessage());
        }
    }
}
