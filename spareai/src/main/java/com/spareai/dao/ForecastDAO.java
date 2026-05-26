package com.spareai.dao;

import com.spareai.model.ForecastCache;
import com.spareai.util.DBConnection;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;

public class ForecastDAO {
    public ForecastCache getCached(String materialCode, int horizonDays) throws SQLException {
        String sql = "SELECT cache_id, material_code, forecast_horizon, forecast_json, generated_at, expires_at " +
                "FROM forecast_cache WHERE material_code = ? AND forecast_horizon = ?";
        try (Connection c = DBConnection.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, materialCode);
            ps.setInt(2, horizonDays);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) return null;
                ForecastCache fc = new ForecastCache();
                fc.setCacheId(rs.getInt("cache_id"));
                fc.setMaterialCode(rs.getString("material_code"));
                fc.setForecastHorizon(rs.getInt("forecast_horizon"));
                fc.setForecastJson(rs.getString("forecast_json"));
                Timestamp gen = rs.getTimestamp("generated_at");
                Timestamp exp = rs.getTimestamp("expires_at");
                if (gen != null) fc.setGeneratedAt(gen.toInstant());
                if (exp != null) fc.setExpiresAt(exp.toInstant());
                return fc;
            }
        }
    }

    public boolean isExpired(ForecastCache cache) {
        if (cache == null) return true;
        Instant exp = cache.getExpiresAt();
        return exp == null || Instant.now().isAfter(exp);
    }

    public int clearAll() throws SQLException {
        String sql = "DELETE FROM forecast_cache";
        try (Connection c = DBConnection.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {
            return ps.executeUpdate();
        }
    }

    public void save(String materialCode, int horizonDays, String forecastJson) throws SQLException {
        Instant now = Instant.now();
        Instant expires = now.plus(24, ChronoUnit.HOURS);

        String sql = "INSERT INTO forecast_cache (material_code, forecast_horizon, forecast_json, generated_at, expires_at) " +
                "VALUES (?, ?, ?, ?, ?) " +
                "ON DUPLICATE KEY UPDATE forecast_json=VALUES(forecast_json), generated_at=VALUES(generated_at), expires_at=VALUES(expires_at)";

        try (Connection c = DBConnection.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, materialCode);
            ps.setInt(2, horizonDays);
            ps.setString(3, forecastJson);
            ps.setTimestamp(4, Timestamp.from(now));
            ps.setTimestamp(5, Timestamp.from(expires));
            ps.executeUpdate();
        }
    }
}
