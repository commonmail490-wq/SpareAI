package com.spareai.model;

import java.time.Instant;

public class ForecastCache {
    private int cacheId;
    private String materialCode;
    private int forecastHorizon;
    private String forecastJson;
    private Instant generatedAt;
    private Instant expiresAt;

    public ForecastCache() {}

    public int getCacheId() {
        return cacheId;
    }

    public void setCacheId(int cacheId) {
        this.cacheId = cacheId;
    }

    public String getMaterialCode() {
        return materialCode;
    }

    public void setMaterialCode(String materialCode) {
        this.materialCode = materialCode;
    }

    public int getForecastHorizon() {
        return forecastHorizon;
    }

    public void setForecastHorizon(int forecastHorizon) {
        this.forecastHorizon = forecastHorizon;
    }

    public String getForecastJson() {
        return forecastJson;
    }

    public void setForecastJson(String forecastJson) {
        this.forecastJson = forecastJson;
    }

    public Instant getGeneratedAt() {
        return generatedAt;
    }

    public void setGeneratedAt(Instant generatedAt) {
        this.generatedAt = generatedAt;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public void setExpiresAt(Instant expiresAt) {
        this.expiresAt = expiresAt;
    }
}
