package com.spareai.model;

import java.math.BigDecimal;
import java.time.Instant;

public class InventoryItem {
    private int itemId;
    private String materialCode;
    private String itemName;
    private String category;
    private String unit;
    private String location;
    private BigDecimal stockQty;
    private BigDecimal reorderLevel;
    private BigDecimal safetyStock;
    private BigDecimal criticalPct;
    private Integer urgentDays;
    private Integer warningDays;
    private BigDecimal overstockMultiplier;
    private BigDecimal reorderQtyFactor;
    private Integer leadTimeDays;
    private BigDecimal maxStock;
    private BigDecimal minOrderQty;
    private Boolean alertsEnabled;
    private Integer priority;
    private String paramNotes;
    private BigDecimal unitCost;
    private Instant lastUpdated;
    /** Average daily consumption from consumption_log (rolling window); not persisted. */
    private BigDecimal avgDailyConsumption;

    public InventoryItem() {}

    public int getItemId() {
        return itemId;
    }

    public void setItemId(int itemId) {
        this.itemId = itemId;
    }

    public String getMaterialCode() {
        return materialCode;
    }

    public void setMaterialCode(String materialCode) {
        this.materialCode = materialCode;
    }

    public String getItemName() {
        return itemName;
    }

    public void setItemName(String itemName) {
        this.itemName = itemName;
    }

    public String getCategory() {
        return category;
    }

    public void setCategory(String category) {
        this.category = category;
    }

    public String getUnit() {
        return unit;
    }

    public void setUnit(String unit) {
        this.unit = unit;
    }

    public String getLocation() {
        return location;
    }

    public void setLocation(String location) {
        this.location = location;
    }

    public BigDecimal getStockQty() {
        return stockQty;
    }

    public void setStockQty(BigDecimal stockQty) {
        this.stockQty = stockQty;
    }

    public BigDecimal getReorderLevel() {
        return reorderLevel;
    }

    public void setReorderLevel(BigDecimal reorderLevel) {
        this.reorderLevel = reorderLevel;
    }

    public BigDecimal getSafetyStock() {
        return safetyStock;
    }

    public void setSafetyStock(BigDecimal safetyStock) {
        this.safetyStock = safetyStock;
    }

    public BigDecimal getCriticalPct() {
        return criticalPct;
    }

    public void setCriticalPct(BigDecimal criticalPct) {
        this.criticalPct = criticalPct;
    }

    public Integer getUrgentDays() {
        return urgentDays;
    }

    public void setUrgentDays(Integer urgentDays) {
        this.urgentDays = urgentDays;
    }

    public Integer getWarningDays() {
        return warningDays;
    }

    public void setWarningDays(Integer warningDays) {
        this.warningDays = warningDays;
    }

    public BigDecimal getOverstockMultiplier() {
        return overstockMultiplier;
    }

    public void setOverstockMultiplier(BigDecimal overstockMultiplier) {
        this.overstockMultiplier = overstockMultiplier;
    }

    public BigDecimal getReorderQtyFactor() {
        return reorderQtyFactor;
    }

    public void setReorderQtyFactor(BigDecimal reorderQtyFactor) {
        this.reorderQtyFactor = reorderQtyFactor;
    }

    public Integer getLeadTimeDays() {
        return leadTimeDays;
    }

    public void setLeadTimeDays(Integer leadTimeDays) {
        this.leadTimeDays = leadTimeDays;
    }

    public BigDecimal getMaxStock() {
        return maxStock;
    }

    public void setMaxStock(BigDecimal maxStock) {
        this.maxStock = maxStock;
    }

    public BigDecimal getMinOrderQty() {
        return minOrderQty;
    }

    public void setMinOrderQty(BigDecimal minOrderQty) {
        this.minOrderQty = minOrderQty;
    }

    public Boolean getAlertsEnabled() {
        return alertsEnabled;
    }

    public void setAlertsEnabled(Boolean alertsEnabled) {
        this.alertsEnabled = alertsEnabled;
    }

    public Integer getPriority() {
        return priority;
    }

    public void setPriority(Integer priority) {
        this.priority = priority;
    }

    public String getParamNotes() {
        return paramNotes;
    }

    public void setParamNotes(String paramNotes) {
        this.paramNotes = paramNotes;
    }

    public BigDecimal getUnitCost() {
        return unitCost;
    }

    public void setUnitCost(BigDecimal unitCost) {
        this.unitCost = unitCost;
    }

    public Instant getLastUpdated() {
        return lastUpdated;
    }

    public void setLastUpdated(Instant lastUpdated) {
        this.lastUpdated = lastUpdated;
    }

    public BigDecimal getAvgDailyConsumption() {
        return avgDailyConsumption;
    }

    public void setAvgDailyConsumption(BigDecimal avgDailyConsumption) {
        this.avgDailyConsumption = avgDailyConsumption;
    }
}
