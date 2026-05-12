-- SpareAI schema (MySQL 8.0)
-- Database: spareai (create it first if needed)
--   CREATE DATABASE spareai CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
--   USE spareai;

CREATE TABLE IF NOT EXISTS inventory_items (
  item_id INT NOT NULL AUTO_INCREMENT,
  material_code VARCHAR(50) NOT NULL,
  item_name VARCHAR(200) NOT NULL,
  category VARCHAR(100) NOT NULL,
  unit VARCHAR(20) NOT NULL,
  location VARCHAR(100) NULL,
  stock_qty DECIMAL(10,2) NOT NULL DEFAULT 0,
  reorder_level DECIMAL(10,2) NOT NULL DEFAULT 0,
  unit_cost DECIMAL(12,2) NULL DEFAULT 0,
  last_updated TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (item_id),
  UNIQUE KEY uq_inventory_material_code (material_code),
  KEY idx_inventory_category (category),
  KEY idx_inventory_location (location)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS consumption_log (
  log_id INT NOT NULL AUTO_INCREMENT,
  material_code VARCHAR(50) NOT NULL,
  consumed_qty DECIMAL(10,2) NOT NULL,
  consumption_date DATE NOT NULL,
  department VARCHAR(100) NULL,
  remarks TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (log_id),
  KEY idx_consumption_material_code (material_code),
  KEY idx_consumption_date (consumption_date),
  KEY idx_consumption_code_date (material_code, consumption_date),
  CONSTRAINT fk_consumption_material
    FOREIGN KEY (material_code) REFERENCES inventory_items(material_code)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS forecast_cache (
  cache_id INT NOT NULL AUTO_INCREMENT,
  material_code VARCHAR(50) NOT NULL,
  forecast_horizon INT NOT NULL,
  forecast_json LONGTEXT NOT NULL,
  generated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  PRIMARY KEY (cache_id),
  UNIQUE KEY uq_forecast_code_horizon (material_code, forecast_horizon),
  KEY idx_forecast_material_code (material_code),
  KEY idx_forecast_expires_at (expires_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_log (
  audit_id INT NOT NULL AUTO_INCREMENT,
  entity_type VARCHAR(50) NOT NULL,
  entity_id INT NOT NULL,
  action ENUM('INSERT','UPDATE','DELETE') NOT NULL,
  old_values JSON NULL,
  new_values JSON NULL,
  changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source_ip VARCHAR(45) NULL,
  PRIMARY KEY (audit_id),
  KEY idx_audit_entity (entity_type, entity_id),
  KEY idx_audit_changed_at (changed_at)
) ENGINE=InnoDB;
