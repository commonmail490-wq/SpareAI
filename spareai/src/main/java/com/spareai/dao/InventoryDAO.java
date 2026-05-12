package com.spareai.dao;

import com.spareai.model.InventoryItem;
import com.spareai.util.DBConnection;

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
        it.setUnitCost(rs.getBigDecimal("unit_cost"));
        Timestamp ts = rs.getTimestamp("last_updated");
        if (ts != null) it.setLastUpdated(ts.toInstant());
        return it;
    }

    public List<InventoryItem> listAll() throws SQLException {
        String sql = "SELECT item_id, material_code, item_name, category, unit, location, stock_qty, reorder_level, unit_cost, last_updated " +
                "FROM inventory_items ORDER BY material_code";
        List<InventoryItem> out = new ArrayList<>();
        try (Connection c = DBConnection.getConnection();
             PreparedStatement ps = c.prepareStatement(sql);
             ResultSet rs = ps.executeQuery()) {
            while (rs.next()) out.add(mapRow(rs));
        }
        return out;
    }

    public InventoryItem getByCode(String materialCode) throws SQLException {
        String sql = "SELECT item_id, material_code, item_name, category, unit, location, stock_qty, reorder_level, unit_cost, last_updated " +
                "FROM inventory_items WHERE material_code = ?";
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
        String sql = "UPDATE inventory_items SET item_name=?, category=?, unit=?, location=?, stock_qty=?, reorder_level=?, unit_cost=? " +
                "WHERE material_code=?";
        try (Connection c = DBConnection.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, updates.getItemName());
            ps.setString(2, updates.getCategory());
            ps.setString(3, updates.getUnit());
            ps.setString(4, updates.getLocation());
            ps.setBigDecimal(5, updates.getStockQty() == null ? BigDecimal.ZERO : updates.getStockQty());
            ps.setBigDecimal(6, updates.getReorderLevel() == null ? BigDecimal.ZERO : updates.getReorderLevel());
            ps.setBigDecimal(7, updates.getUnitCost() == null ? BigDecimal.ZERO : updates.getUnitCost());
            ps.setString(8, materialCode);
            return ps.executeUpdate() > 0;
        }
    }

    public List<InventoryItem> lowStockList() throws SQLException {
        String sql = "SELECT item_id, material_code, item_name, category, unit, location, stock_qty, reorder_level, unit_cost, last_updated " +
                "FROM inventory_items WHERE stock_qty <= reorder_level ORDER BY (reorder_level - stock_qty) DESC";
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
                "SUM(CASE WHEN stock_qty <= reorder_level THEN 1 ELSE 0 END) AS low_stock_count, " +
                "SUM(CASE WHEN stock_qty <= (reorder_level * 0.5) THEN 1 ELSE 0 END) AS critical_items, " +
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
}
