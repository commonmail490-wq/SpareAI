package com.spareai.model;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

public class ConsumptionLog {
    private int logId;
    private String materialCode;
    private BigDecimal consumedQty;
    private LocalDate consumptionDate;
    private String department;
    private String remarks;
    private Instant createdAt;

    public ConsumptionLog() {}

    public int getLogId() {
        return logId;
    }

    public void setLogId(int logId) {
        this.logId = logId;
    }

    public String getMaterialCode() {
        return materialCode;
    }

    public void setMaterialCode(String materialCode) {
        this.materialCode = materialCode;
    }

    public BigDecimal getConsumedQty() {
        return consumedQty;
    }

    public void setConsumedQty(BigDecimal consumedQty) {
        this.consumedQty = consumedQty;
    }

    public LocalDate getConsumptionDate() {
        return consumptionDate;
    }

    public void setConsumptionDate(LocalDate consumptionDate) {
        this.consumptionDate = consumptionDate;
    }

    public String getDepartment() {
        return department;
    }

    public void setDepartment(String department) {
        this.department = department;
    }

    public String getRemarks() {
        return remarks;
    }

    public void setRemarks(String remarks) {
        this.remarks = remarks;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
}
