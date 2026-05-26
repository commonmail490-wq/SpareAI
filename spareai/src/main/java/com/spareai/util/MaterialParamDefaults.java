package com.spareai.util;

import java.math.BigDecimal;

public final class MaterialParamDefaults {
    /** Legacy SpareAI thresholds (global hardcoded before per-material parameters). */
    public static final BigDecimal CRITICAL_PCT = new BigDecimal("0.5");
    public static final int URGENT_DAYS = 7;
    public static final int WARNING_DAYS = 30;
    public static final BigDecimal OVERSTOCK_MULTIPLIER = new BigDecimal("3");
    public static final BigDecimal REORDER_QTY_FACTOR = new BigDecimal("1.5");

    /** Recommended defaults for the parameter system (schema + tuned optional fields). */
    public static final BigDecimal NEW_CRITICAL_PCT = new BigDecimal("0.4000");
    public static final int NEW_URGENT_DAYS = 5;
    public static final int NEW_WARNING_DAYS = 21;
    public static final BigDecimal NEW_OVERSTOCK_MULTIPLIER = new BigDecimal("2.50");
    public static final BigDecimal NEW_REORDER_QTY_FACTOR = new BigDecimal("2.00");
    public static final int NEW_LEAD_TIME_DAYS = 14;

    private MaterialParamDefaults() {}
}
