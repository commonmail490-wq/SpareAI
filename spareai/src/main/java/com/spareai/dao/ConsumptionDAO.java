package com.spareai.dao;

import com.spareai.model.AuditLog;
import com.spareai.model.ConsumptionLog;
import com.spareai.util.DBConnection;
import com.spareai.util.JsonUtil;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Connection;
import java.sql.Date;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class ConsumptionDAO {
    /** Rolling window for avg daily rate (covers seed data through ~12 months). */
    public static final int CONSUMPTION_RATE_LOOKBACK_DAYS = 365;
    /** Window for overview "monthly consumption" KPI. */
    public static final int MONTHLY_TOTAL_LOOKBACK_DAYS = 30;

    private final InventoryDAO inventoryDAO = new InventoryDAO();

    private ConsumptionLog mapRow(ResultSet rs) throws SQLException {
        ConsumptionLog log = new ConsumptionLog();
        log.setLogId(rs.getInt("log_id"));
        log.setMaterialCode(rs.getString("material_code"));
        log.setConsumedQty(rs.getBigDecimal("consumed_qty"));
        Date d = rs.getDate("consumption_date");
        if (d != null) log.setConsumptionDate(d.toLocalDate());
        log.setDepartment(rs.getString("department"));
        log.setRemarks(rs.getString("remarks"));
        Timestamp ts = rs.getTimestamp("created_at");
        if (ts != null) log.setCreatedAt(ts.toInstant());
        return log;
    }

    public int record(ConsumptionLog log, String sourceIp) throws SQLException {
        String insert = "INSERT INTO consumption_log (material_code, consumed_qty, consumption_date, department, remarks) " +
                "VALUES (?, ?, ?, ?, ?)";

        try (Connection c = DBConnection.getConnection()) {
            c.setAutoCommit(false);
            try (PreparedStatement ps = c.prepareStatement(insert, Statement.RETURN_GENERATED_KEYS)) {
                ps.setString(1, log.getMaterialCode());
                ps.setBigDecimal(2, log.getConsumedQty());
                ps.setDate(3, Date.valueOf(log.getConsumptionDate()));
                ps.setString(4, log.getDepartment());
                ps.setString(5, log.getRemarks());
                ps.executeUpdate();

                int logId;
                try (ResultSet keys = ps.getGeneratedKeys()) {
                    logId = keys.next() ? keys.getInt(1) : 0;
                }

                boolean updated = inventoryDAO.decrementStock(c, log.getMaterialCode(), log.getConsumedQty());
                if (!updated) {
                    c.rollback();
                    throw new SQLException("Material code not found: " + log.getMaterialCode());
                }

                AuditLog audit = new AuditLog();
                audit.setEntityType("consumption_log");
                audit.setEntityId(logId);
                audit.setAction("INSERT");
                audit.setOldValues(null);
                audit.setNewValues(JsonUtil.GSON.toJson(log));
                audit.setSourceIp(sourceIp);
                insertAuditInSameConnection(c, audit);

                c.commit();
                return logId;
            } catch (SQLException e) {
                c.rollback();
                throw e;
            } finally {
                c.setAutoCommit(true);
            }
        }
    }

    private void insertAuditInSameConnection(Connection c, AuditLog audit) throws SQLException {
        String sql = "INSERT INTO audit_log (entity_type, entity_id, action, old_values, new_values, source_ip) " +
                "VALUES (?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), ?)";
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, audit.getEntityType());
            ps.setInt(2, audit.getEntityId());
            ps.setString(3, audit.getAction());
            ps.setString(4, audit.getOldValues());
            ps.setString(5, audit.getNewValues());
            ps.setString(6, audit.getSourceIp());
            ps.executeUpdate();
        }
    }

    public Map<String, Object> history(String materialCode, LocalDate from, LocalDate to, int page, int pageSize)
            throws SQLException {
        page = Math.max(1, page);
        pageSize = Math.max(1, Math.min(500, pageSize));

        List<Object> params = new ArrayList<>();
        StringBuilder where = new StringBuilder(" WHERE 1=1 ");
        if (materialCode != null && !materialCode.isBlank()) {
            where.append(" AND material_code = ? ");
            params.add(materialCode);
        }
        if (from != null) {
            where.append(" AND consumption_date >= ? ");
            params.add(Date.valueOf(from));
        }
        if (to != null) {
            where.append(" AND consumption_date <= ? ");
            params.add(Date.valueOf(to));
        }

        String countSql = "SELECT COUNT(*) AS total FROM consumption_log " + where;
        long total;
        try (Connection c = DBConnection.getConnection();
             PreparedStatement ps = c.prepareStatement(countSql)) {
            for (int i = 0; i < params.size(); i++) ps.setObject(i + 1, params.get(i));
            try (ResultSet rs = ps.executeQuery()) {
                total = rs.next() ? rs.getLong("total") : 0;
            }
        }

        int offset = (page - 1) * pageSize;
        String listSql = "SELECT log_id, material_code, consumed_qty, consumption_date, department, remarks, created_at " +
                "FROM consumption_log " + where + " ORDER BY consumption_date DESC, log_id DESC LIMIT ? OFFSET ?";

        List<ConsumptionLog> records = new ArrayList<>();
        try (Connection c = DBConnection.getConnection();
             PreparedStatement ps = c.prepareStatement(listSql)) {
            int idx = 1;
            for (Object p : params) ps.setObject(idx++, p);
            ps.setInt(idx++, pageSize);
            ps.setInt(idx, offset);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) records.add(mapRow(rs));
            }
        }

        Map<String, Object> out = new HashMap<>();
        out.put("records", records);
        Map<String, Object> pagination = new HashMap<>();
        pagination.put("page", page);
        pagination.put("page_size", pageSize);
        pagination.put("total_records", total);
        pagination.put("total_pages", (long) Math.ceil(total / (double) pageSize));
        out.put("pagination", pagination);
        return out;
    }

    public List<Map<String, Object>> monthlyTotals(String materialCode) throws SQLException {
        String sql = "SELECT DATE_FORMAT(consumption_date, '%Y-%m') AS month, SUM(consumed_qty) AS total " +
                "FROM consumption_log WHERE material_code = ? GROUP BY DATE_FORMAT(consumption_date, '%Y-%m') " +
                "ORDER BY month";
        List<Map<String, Object>> out = new ArrayList<>();
        try (Connection c = DBConnection.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, materialCode);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    Map<String, Object> row = new HashMap<>();
                    row.put("month", rs.getString("month"));
                    row.put("total", rs.getBigDecimal("total"));
                    out.add(row);
                }
            }
        }
        return out;
    }

    public ConsumptionLog getById(int logId) throws SQLException {
        String sql = "SELECT log_id, material_code, consumed_qty, consumption_date, department, remarks, created_at " +
                "FROM consumption_log WHERE log_id = ?";
        try (Connection c = DBConnection.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setInt(1, logId);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? mapRow(rs) : null;
            }
        }
    }

    public boolean edit(int logId, ConsumptionLog updates, String reason, String sourceIp) throws SQLException {
        ConsumptionLog existing = getById(logId);
        if (existing == null) return false;

        BigDecimal oldQty = existing.getConsumedQty() == null ? BigDecimal.ZERO : existing.getConsumedQty();
        BigDecimal newQty = updates.getConsumedQty() == null ? BigDecimal.ZERO : updates.getConsumedQty();
        BigDecimal delta = newQty.subtract(oldQty); // + means consume more; - means consume less (return stock)

        String sql = "UPDATE consumption_log SET consumed_qty=?, consumption_date=?, department=?, remarks=? WHERE log_id=?";
        try (Connection c = DBConnection.getConnection()) {
            c.setAutoCommit(false);
            try (PreparedStatement ps = c.prepareStatement(sql)) {
                ps.setBigDecimal(1, newQty);
                ps.setDate(2, Date.valueOf(updates.getConsumptionDate()));
                ps.setString(3, updates.getDepartment());
                String mergedRemarks = updates.getRemarks();
                if (reason != null && !reason.isBlank()) {
                    String prefix = "[edit_reason: " + reason.trim() + "] ";
                    mergedRemarks = prefix + (mergedRemarks == null ? "" : mergedRemarks);
                }
                ps.setString(4, mergedRemarks);
                ps.setInt(5, logId);
                int changed = ps.executeUpdate();
                if (changed == 0) {
                    c.rollback();
                    return false;
                }

                // Adjust inventory: if delta positive -> decrement more; if negative -> increment (return stock)
                boolean ok;
                if (delta.signum() > 0) {
                    ok = inventoryDAO.decrementStock(c, existing.getMaterialCode(), delta);
                } else if (delta.signum() < 0) {
                    ok = inventoryDAO.incrementStock(c, existing.getMaterialCode(), delta.abs());
                } else {
                    ok = true;
                }
                if (!ok) {
                    c.rollback();
                    throw new SQLException("Failed to adjust inventory for material: " + existing.getMaterialCode());
                }

                AuditLog audit = new AuditLog();
                audit.setEntityType("consumption_log");
                audit.setEntityId(logId);
                audit.setAction("UPDATE");
                audit.setOldValues(JsonUtil.GSON.toJson(existing));

                ConsumptionLog after = new ConsumptionLog();
                after.setLogId(logId);
                after.setMaterialCode(existing.getMaterialCode());
                after.setConsumedQty(newQty);
                after.setConsumptionDate(updates.getConsumptionDate());
                after.setDepartment(updates.getDepartment());
                after.setRemarks(mergedRemarks);
                after.setCreatedAt(existing.getCreatedAt() == null ? Instant.now() : existing.getCreatedAt());

                audit.setNewValues(JsonUtil.GSON.toJson(after));
                audit.setSourceIp(sourceIp);
                insertAuditInSameConnection(c, audit);

                c.commit();
                return true;
            } catch (SQLException e) {
                c.rollback();
                throw e;
            } finally {
                c.setAutoCommit(true);
            }
        }
    }

    public boolean delete(int logId, String reason, String sourceIp) throws SQLException {
        ConsumptionLog existing = getById(logId);
        if (existing == null) return false;

        String deleteSql = "DELETE FROM consumption_log WHERE log_id=?";
        try (Connection c = DBConnection.getConnection()) {
            c.setAutoCommit(false);
            try (PreparedStatement ps = c.prepareStatement(deleteSql)) {
                ps.setInt(1, logId);
                int changed = ps.executeUpdate();
                if (changed == 0) {
                    c.rollback();
                    return false;
                }

                // Deleting a consumption record should restore stock
                BigDecimal qty = existing.getConsumedQty() == null ? BigDecimal.ZERO : existing.getConsumedQty();
                boolean ok = inventoryDAO.incrementStock(c, existing.getMaterialCode(), qty);
                if (!ok) {
                    c.rollback();
                    throw new SQLException("Failed to restore inventory for material: " + existing.getMaterialCode());
                }

                if (reason != null && !reason.isBlank()) {
                    existing.setRemarks("[delete_reason: " + reason.trim() + "] " + (existing.getRemarks() == null ? "" : existing.getRemarks()));
                }

                AuditLog audit = new AuditLog();
                audit.setEntityType("consumption_log");
                audit.setEntityId(logId);
                audit.setAction("DELETE");
                audit.setOldValues(JsonUtil.GSON.toJson(existing));
                audit.setNewValues(null);
                audit.setSourceIp(sourceIp);
                insertAuditInSameConnection(c, audit);

                c.commit();
                return true;
            } catch (SQLException e) {
                c.rollback();
                throw e;
            } finally {
                c.setAutoCommit(true);
            }
        }
    }

    public BigDecimal avgDailyConsumption(String materialCode, int days) throws SQLException {
        String sql = "SELECT COALESCE(SUM(consumed_qty), 0) AS total " +
                "FROM consumption_log WHERE material_code = ? AND consumption_date >= (CURDATE() - INTERVAL ? DAY)";
        try (Connection c = DBConnection.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, materialCode);
            ps.setInt(2, days);
            try (ResultSet rs = ps.executeQuery()) {
                BigDecimal total = rs.next() ? rs.getBigDecimal("total") : BigDecimal.ZERO;
                if (total == null) total = BigDecimal.ZERO;
                return total.divide(BigDecimal.valueOf(days), 6, RoundingMode.HALF_UP);
            }
        }
    }

    public Map<String, BigDecimal> avgDailyByAllMaterials(int days) throws SQLException {
        String sql = "SELECT material_code, COALESCE(SUM(consumed_qty), 0) AS total " +
                "FROM consumption_log WHERE consumption_date >= (CURDATE() - INTERVAL ? DAY) " +
                "GROUP BY material_code HAVING total > 0";
        Map<String, BigDecimal> out = new HashMap<>();
        try (Connection c = DBConnection.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setInt(1, days);
            try (ResultSet rs = ps.executeQuery()) {
                BigDecimal divisor = BigDecimal.valueOf(days);
                while (rs.next()) {
                    BigDecimal total = rs.getBigDecimal("total");
                    if (total == null) continue;
                    out.put(
                            rs.getString("material_code"),
                            total.divide(divisor, 6, RoundingMode.HALF_UP));
                }
            }
        }
        return out;
    }

    public BigDecimal totalConsumedInLookback(int days) throws SQLException {
        String sql = "SELECT COALESCE(SUM(consumed_qty), 0) AS total FROM consumption_log " +
                "WHERE consumption_date >= (CURDATE() - INTERVAL ? DAY)";
        try (Connection c = DBConnection.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setInt(1, days);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? rs.getBigDecimal("total") : BigDecimal.ZERO;
            }
        }
    }

    /**
     * Returns consumption time series aggregated to monthly granularity as required by Prophet.
     * Output shape: [{ "ds": "YYYY-MM-01", "y": <sum> }, ...] ordered by ds.
     */
    public List<Map<String, Object>> prophetMonthlySeries(String materialCode) throws SQLException {
        String sql = "SELECT DATE_FORMAT(consumption_date, '%Y-%m-01') AS ds, SUM(consumed_qty) AS y " +
                "FROM consumption_log WHERE material_code = ? " +
                "GROUP BY DATE_FORMAT(consumption_date, '%Y-%m-01') ORDER BY ds";
        List<Map<String, Object>> out = new ArrayList<>();
        try (Connection c = DBConnection.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, materialCode);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    Map<String, Object> row = new HashMap<>();
                    row.put("ds", rs.getString("ds"));
                    row.put("y", rs.getBigDecimal("y"));
                    out.add(row);
                }
            }
        }
        return out;
    }

    /**
     * Converts monthly consumption totals to average daily rates for Prophet daily forecasts.
     * Each {@code y} becomes {@code monthly_total / days_in_month} for the month of {@code ds}.
     */
    public static List<Map<String, Object>> monthlySeriesToDailyRates(List<Map<String, Object>> monthlySeries) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> row : monthlySeries) {
            String dsStr = String.valueOf(row.get("ds"));
            LocalDate monthStart = LocalDate.parse(dsStr);
            int daysInMonth = monthStart.lengthOfMonth();
            BigDecimal monthly;
            Object y = row.get("y");
            if (y instanceof BigDecimal) {
                monthly = (BigDecimal) y;
            } else {
                monthly = new BigDecimal(String.valueOf(y));
            }
            BigDecimal daily = monthly.divide(BigDecimal.valueOf(daysInMonth), 6, RoundingMode.HALF_UP);
            Map<String, Object> dailyRow = new HashMap<>();
            dailyRow.put("ds", dsStr);
            dailyRow.put("y", daily);
            out.add(dailyRow);
        }
        return out;
    }
}
