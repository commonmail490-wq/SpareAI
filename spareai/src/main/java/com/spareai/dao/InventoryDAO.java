package com.spareai.dao;

import com.spareai.model.InventoryItem;
import com.spareai.util.DBConnection;
import com.spareai.util.MaterialParamDefaults;

import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class InventoryDAO {

    private static final String SELECT_COLUMNS =
            "item_id, material_code, item_name, category, unit, location, stock_qty, reorder_level, " +
            "safety_stock, critical_pct, urgent_days, warning_days, overstock_multiplier, reorder_qty_factor, " +
            "lead_time_days, max_stock, min_order_qty, alerts_enabled, priority, param_notes, " +
            "unit_cost, last_updated";

    private InventoryItem mapRow(ResultSet rs) throws SQLException {
        InventoryItem it = new InventoryItem();
        it.setItemId(rs.getInt("item_id"));
        it.setMaterialCode(rs.getString("material_code"));
        it.setItemName(rs.getString("item_name"));
        it.setCategory(rs.getString("category"));
        it.setUnit(rs.getString("unit"));
        it.setLocation(rs.getString("location"));
        it.setStockQty(rs.getBigDecimal("stock_qty"));
        it.setReorderLevel(rs.getBigDecimal("reorder_level"));
        BigDecimal safety = rs.getBigDecimal("safety_stock");
        if (!rs.wasNull()) it.setSafetyStock(safety);
        it.setCriticalPct(rs.getBigDecimal("critical_pct"));
        it.setUrgentDays(rs.getInt("urgent_days"));
        it.setWarningDays(rs.getInt("warning_days"));
        it.setOverstockMultiplier(rs.getBigDecimal("overstock_multiplier"));
        it.setReorderQtyFactor(rs.getBigDecimal("reorder_qty_factor"));
        int lead = rs.getInt("lead_time_days");
        if (!rs.wasNull()) it.setLeadTimeDays(lead);
        BigDecimal maxStock = rs.getBigDecimal("max_stock");
        if (!rs.wasNull()) it.setMaxStock(maxStock);
        BigDecimal minOrder = rs.getBigDecimal("min_order_qty");
        if (!rs.wasNull()) it.setMinOrderQty(minOrder);
        it.setAlertsEnabled(rs.getBoolean("alerts_enabled"));
        it.setPriority(rs.getInt("priority"));
        it.setParamNotes(rs.getString("param_notes"));
        it.setUnitCost(rs.getBigDecimal("unit_cost"));
        Timestamp ts = rs.getTimestamp("last_updated");
        if (ts != null) it.setLastUpdated(ts.toInstant());
        return it;
    }

    public List<InventoryItem> listAll() throws SQLException {
        String sql = "SELECT " + SELECT_COLUMNS + " FROM inventory_items ORDER BY material_code";
        List<InventoryItem> out = new ArrayList<>();
        try (Connection c = DBConnection.getConnection();
             PreparedStatement ps = c.prepareStatement(sql);
             ResultSet rs = ps.executeQuery()) {
            while (rs.next()) out.add(mapRow(rs));
        }
        return out;
    }

    public InventoryItem getByCode(String materialCode) throws SQLException {
        String sql = "SELECT " + SELECT_COLUMNS + " FROM inventory_items WHERE material_code = ?";
        try (Connection c = DBConnection.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, materialCode);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? mapRow(rs) : null;
            }
        }
    }

    public int add(InventoryItem item) throws SQLException {
        String sql = "INSERT INTO inventory_items " +
                "(material_code, item_name, category, unit, location, stock_qty, reorder_level, unit_cost) " +
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
        try (Connection c = DBConnection.getConnection();
             PreparedStatement ps = c.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)) {
            ps.setString(1, item.getMaterialCode());
            ps.setString(2, item.getItemName());
            ps.setString(3, item.getCategory());
            ps.setString(4, item.getUnit());
            ps.setString(5, item.getLocation());
            ps.setBigDecimal(6, item.getStockQty() == null ? BigDecimal.ZERO : item.getStockQty());
            ps.setBigDecimal(7, item.getReorderLevel() == null ? BigDecimal.ZERO : item.getReorderLevel());
            ps.setBigDecimal(8, item.getUnitCost() == null ? BigDecimal.ZERO : item.getUnitCost());
            ps.executeUpdate();
            try (ResultSet keys = ps.getGeneratedKeys()) {
                return keys.next() ? keys.getInt(1) : 0;
            }
        }
    }

    public boolean updateByCode(String materialCode, InventoryItem updates) throws SQLException {
        String sql = "UPDATE inventory_items SET item_name=?, category=?, unit=?, location=?, stock_qty=?, " +
                "reorder_level=?, safety_stock=?, critical_pct=?, urgent_days=?, warning_days=?, " +
                "overstock_multiplier=?, reorder_qty_factor=?, lead_time_days=?, max_stock=?, min_order_qty=?, " +
                "alerts_enabled=?, priority=?, param_notes=?, unit_cost=? WHERE material_code=?";
        try (Connection c = DBConnection.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {
            int i = 1;
            ps.setString(i++, updates.getItemName());
            ps.setString(i++, updates.getCategory());
            ps.setString(i++, updates.getUnit());
            ps.setString(i++, updates.getLocation());
            ps.setBigDecimal(i++, updates.getStockQty() == null ? BigDecimal.ZERO : updates.getStockQty());
            ps.setBigDecimal(i++, updates.getReorderLevel() == null ? BigDecimal.ZERO : updates.getReorderLevel());
            setNullableDecimal(ps, i++, updates.getSafetyStock());
            ps.setBigDecimal(i++, paramOrDefault(updates.getCriticalPct(), MaterialParamDefaults.CRITICAL_PCT));
            ps.setInt(i++, updates.getUrgentDays() == null ? MaterialParamDefaults.URGENT_DAYS : updates.getUrgentDays());
            ps.setInt(i++, updates.getWarningDays() == null ? MaterialParamDefaults.WARNING_DAYS : updates.getWarningDays());
            ps.setBigDecimal(i++, paramOrDefault(updates.getOverstockMultiplier(), MaterialParamDefaults.OVERSTOCK_MULTIPLIER));
            ps.setBigDecimal(i++, paramOrDefault(updates.getReorderQtyFactor(), MaterialParamDefaults.REORDER_QTY_FACTOR));
            setNullableInt(ps, i++, updates.getLeadTimeDays());
            setNullableDecimal(ps, i++, updates.getMaxStock());
            setNullableDecimal(ps, i++, updates.getMinOrderQty());
            ps.setBoolean(i++, updates.getAlertsEnabled() == null || updates.getAlertsEnabled());
            ps.setInt(i++, updates.getPriority() == null ? 0 : updates.getPriority());
            ps.setString(i++, updates.getParamNotes());
            ps.setBigDecimal(i++, updates.getUnitCost() == null ? BigDecimal.ZERO : updates.getUnitCost());
            ps.setString(i, materialCode);
            return ps.executeUpdate() > 0;
        }
    }

    public boolean updateParametersByCode(String materialCode, InventoryItem params) throws SQLException {
        String sql = "UPDATE inventory_items SET reorder_level=?, safety_stock=?, critical_pct=?, urgent_days=?, " +
                "warning_days=?, overstock_multiplier=?, reorder_qty_factor=?, lead_time_days=?, max_stock=?, " +
                "min_order_qty=?, alerts_enabled=?, priority=?, param_notes=? WHERE material_code=?";
        try (Connection c = DBConnection.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {
            int i = 1;
            ps.setBigDecimal(i++, params.getReorderLevel() == null ? BigDecimal.ZERO : params.getReorderLevel());
            setNullableDecimal(ps, i++, params.getSafetyStock());
            ps.setBigDecimal(i++, paramOrDefault(params.getCriticalPct(), MaterialParamDefaults.CRITICAL_PCT));
            ps.setInt(i++, params.getUrgentDays() == null ? MaterialParamDefaults.URGENT_DAYS : params.getUrgentDays());
            ps.setInt(i++, params.getWarningDays() == null ? MaterialParamDefaults.WARNING_DAYS : params.getWarningDays());
            ps.setBigDecimal(i++, paramOrDefault(params.getOverstockMultiplier(), MaterialParamDefaults.OVERSTOCK_MULTIPLIER));
            ps.setBigDecimal(i++, paramOrDefault(params.getReorderQtyFactor(), MaterialParamDefaults.REORDER_QTY_FACTOR));
            setNullableInt(ps, i++, params.getLeadTimeDays());
            setNullableDecimal(ps, i++, params.getMaxStock());
            setNullableDecimal(ps, i++, params.getMinOrderQty());
            ps.setBoolean(i++, params.getAlertsEnabled() == null || params.getAlertsEnabled());
            ps.setInt(i++, params.getPriority() == null ? 0 : params.getPriority());
            ps.setString(i++, params.getParamNotes());
            ps.setString(i, materialCode);
            return ps.executeUpdate() > 0;
        }
    }

    public List<InventoryItem> lowStockList() throws SQLException {
        String sql = "SELECT " + SELECT_COLUMNS +
                " FROM inventory_items WHERE alerts_enabled = 1 AND reorder_level > 0 AND stock_qty <= reorder_level " +
                "ORDER BY (reorder_level - stock_qty) DESC";
        List<InventoryItem> out = new ArrayList<>();
        try (Connection c = DBConnection.getConnection();
             PreparedStatement ps = c.prepareStatement(sql);
             ResultSet rs = ps.executeQuery()) {
            while (rs.next()) out.add(mapRow(rs));
        }
        return out;
    }

    public Map<String, Object> summaryKpis() throws SQLException {
        Map<String, Object> out = new HashMap<>();
        String sql = "SELECT " +
                "COUNT(*) AS total_skus, " +
                "SUM(CASE WHEN alerts_enabled = 1 AND reorder_level > 0 AND stock_qty <= reorder_level THEN 1 ELSE 0 END) AS low_stock_count, " +
                "SUM(CASE WHEN alerts_enabled = 1 AND reorder_level > 0 AND stock_qty <= (reorder_level * critical_pct) THEN 1 ELSE 0 END) AS critical_items, " +
                "COALESCE(SUM(stock_qty * COALESCE(unit_cost, 0)), 0) AS total_stock_value " +
                "FROM inventory_items";
        try (Connection c = DBConnection.getConnection();
             PreparedStatement ps = c.prepareStatement(sql);
             ResultSet rs = ps.executeQuery()) {
            if (rs.next()) {
                out.put("total_skus", rs.getLong("total_skus"));
                out.put("low_stock_count", rs.getLong("low_stock_count"));
                out.put("critical_items", rs.getLong("critical_items"));
                out.put("total_stock_value", rs.getBigDecimal("total_stock_value"));
            }
        }
        ConsumptionDAO consumptionDAO = new ConsumptionDAO();
        BigDecimal monthly = consumptionDAO.totalConsumedInLookback(ConsumptionDAO.MONTHLY_TOTAL_LOOKBACK_DAYS);
        out.put("monthly_consumption", monthly);
        return out;
    }

    public boolean decrementStock(Connection c, String materialCode, BigDecimal qty) throws SQLException {
        String sql = "UPDATE inventory_items SET stock_qty = stock_qty - ? WHERE material_code = ?";
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setBigDecimal(1, qty);
            ps.setString(2, materialCode);
            return ps.executeUpdate() > 0;
        }
    }

    public boolean incrementStock(Connection c, String materialCode, BigDecimal qty) throws SQLException {
        String sql = "UPDATE inventory_items SET stock_qty = stock_qty + ? WHERE material_code = ?";
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setBigDecimal(1, qty);
            ps.setString(2, materialCode);
            return ps.executeUpdate() > 0;
        }
    }

    private static BigDecimal paramOrDefault(BigDecimal value, BigDecimal def) {
        return value == null ? def : value;
    }

    private static void setNullableDecimal(PreparedStatement ps, int index, BigDecimal value) throws SQLException {
        if (value == null) {
            ps.setNull(index, java.sql.Types.DECIMAL);
        } else {
            ps.setBigDecimal(index, value);
        }
    }

    private static void setNullableInt(PreparedStatement ps, int index, Integer value) throws SQLException {
        if (value == null) {
            ps.setNull(index, java.sql.Types.INTEGER);
        } else {
            ps.setInt(index, value);
        }
    }
}
