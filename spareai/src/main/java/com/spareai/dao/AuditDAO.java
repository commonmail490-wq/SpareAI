package com.spareai.dao;

import com.spareai.model.AuditLog;
import com.spareai.util.DBConnection;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;

public class AuditDAO {
    public void insert(AuditLog audit) throws SQLException {
        String sql = "INSERT INTO audit_log (entity_type, entity_id, action, old_values, new_values, source_ip) " +
                "VALUES (?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), ?)";

        try (Connection c = DBConnection.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, audit.getEntityType());
            ps.setInt(2, audit.getEntityId());
            ps.setString(3, audit.getAction());
            ps.setString(4, audit.getOldValues());
            ps.setString(5, audit.getNewValues());
            ps.setString(6, audit.getSourceIp());
            ps.executeUpdate();
        }
    }
}
