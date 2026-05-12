package com.spareai.util;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;

import java.sql.Connection;
import java.sql.SQLException;
import java.time.Duration;

public final class DBConnection {
    private static volatile HikariDataSource dataSource;

    private DBConnection() {}

    private static String getSetting(String envKey, String sysPropKey, String defaultValue) {
        String v = System.getenv(envKey);
        if (v != null && !v.isBlank()) return v;
        v = System.getProperty(sysPropKey);
        if (v != null && !v.isBlank()) return v;
        return defaultValue;
    }

    private static int getIntSetting(String envKey, String sysPropKey, int defaultValue) {
        String v = getSetting(envKey, sysPropKey, String.valueOf(defaultValue));
        try {
            return Integer.parseInt(v.trim());
        } catch (Exception ignored) {
            return defaultValue;
        }
    }

    private static HikariDataSource init() {
        String url = getSetting(
                "SPAREAI_DB_URL",
                "spareai.db.url",
                "jdbc:mysql://localhost:3306/spareai?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC");
        String user = getSetting("SPAREAI_DB_USER", "spareai.db.user", "root");
        String pass = getSetting("SPAREAI_DB_PASSWORD", "spareai.db.password", "shreyash@chaudhary1");
        int poolSize = getIntSetting("SPAREAI_DB_POOL_SIZE", "spareai.db.poolSize", 10);

        HikariConfig cfg = new HikariConfig();
        cfg.setJdbcUrl(url);
        cfg.setUsername(user);
        cfg.setPassword(pass);
        cfg.setDriverClassName("com.mysql.cj.jdbc.Driver");
        cfg.setMaximumPoolSize(poolSize);
        cfg.setMinimumIdle(Math.min(2, poolSize));
        cfg.setConnectionTimeout(Duration.ofSeconds(10).toMillis());
        cfg.setValidationTimeout(Duration.ofSeconds(3).toMillis());
        cfg.setIdleTimeout(Duration.ofMinutes(2).toMillis());
        cfg.setMaxLifetime(Duration.ofMinutes(25).toMillis());
        cfg.setLeakDetectionThreshold(Duration.ofSeconds(30).toMillis());

        cfg.addDataSourceProperty("cachePrepStmts", "true");
        cfg.addDataSourceProperty("prepStmtCacheSize", "250");
        cfg.addDataSourceProperty("prepStmtCacheSqlLimit", "2048");
        cfg.addDataSourceProperty("useServerPrepStmts", "true");

        return new HikariDataSource(cfg);
    }

    public static HikariDataSource getDataSource() {
        HikariDataSource ds = dataSource;
        if (ds == null) {
            synchronized (DBConnection.class) {
                ds = dataSource;
                if (ds == null) {
                    dataSource = ds = init();
                }
            }
        }
        return ds;
    }

    public static Connection getConnection() throws SQLException {
        return getDataSource().getConnection();
    }
}
