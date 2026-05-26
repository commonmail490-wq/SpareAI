-- Per-material stock / alert parameters (run once against spareai DB)
USE spareai;

ALTER TABLE inventory_items
  ADD COLUMN safety_stock DECIMAL(10,2) NULL COMMENT 'Optional; if NULL, reorder_level is used' AFTER reorder_level,
  ADD COLUMN critical_pct DECIMAL(5,4) NOT NULL DEFAULT 0.5000 COMMENT 'CRITICAL when stock <= reorder * critical_pct' AFTER safety_stock,
  ADD COLUMN urgent_days INT NOT NULL DEFAULT 7 COMMENT 'URGENT severity when days to stockout <= this' AFTER critical_pct,
  ADD COLUMN warning_days INT NOT NULL DEFAULT 30 COMMENT 'WARNING severity when days to stockout <= this' AFTER urgent_days,
  ADD COLUMN overstock_multiplier DECIMAL(5,2) NOT NULL DEFAULT 3.00 AFTER warning_days,
  ADD COLUMN reorder_qty_factor DECIMAL(5,2) NOT NULL DEFAULT 1.50 AFTER overstock_multiplier,
  ADD COLUMN lead_time_days INT NULL AFTER reorder_qty_factor,
  ADD COLUMN max_stock DECIMAL(10,2) NULL AFTER lead_time_days,
  ADD COLUMN min_order_qty DECIMAL(10,2) NULL AFTER max_stock,
  ADD COLUMN alerts_enabled TINYINT(1) NOT NULL DEFAULT 1 AFTER min_order_qty,
  ADD COLUMN priority INT NOT NULL DEFAULT 0 AFTER alerts_enabled,
  ADD COLUMN param_notes VARCHAR(500) NULL AFTER priority;
