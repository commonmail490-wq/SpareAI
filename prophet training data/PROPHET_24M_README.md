# Prophet Training Data — 24-Month Synthetic Time Series
## Source: inv_data.xlsx | Active materials: 3,255 | Date range: Nov 2023 – Oct 2025

---

## What was done

The original dataset contained only **2 time points** (PREV and PRES snapshots).
Since this is test data without real dates, **24 months of training data** were generated
by treating the 2 real snapshots as the final 2 months and synthetically constructing
the preceding 22 months per material.

### Generation method (per material)
Each material's monthly consumption was modelled as:

```
y[t] = base_consumption × trend[t] × seasonality[t] × noise[t]
```

| Component | Method |
|---|---|
| **Base** | Real `CONSUM_PREV_QTY` anchors the level |
| **Trend** | Linear drift sampled per material: −0.5% to +0.8% per month |
| **Seasonality** | Sine wave with 12-month period; amplitude 10–25%, random phase |
| **Noise** | Log-normal multiplicative noise; CV ≈ 10–20% |
| **Receipts** | Correlated with lagged consumption (replenishment logic, 1–2 month lag) |
| **Inventory** | Computed via stock balance: `inv[t] = inv[t−1] + receipt[t] − y[t]` |

### Integrity checks passed
- Zero negative consumption values
- Zero negative inventory values
- Real months (T−1, T) use actual data — not synthetic

---

## Files

| File | Description | Rows |
|---|---|---|
| `prophet_material_24m.csv` | One row per (material × month) | 78,120 |
| `prophet_matgrp_24m.csv` | One row per (MAT_GRP × month) | 1,632 |

---

## Column reference

| Column | Description |
|---|---|
| `ds` | Month-end date (Prophet date column) |
| `y` | Consumption quantity — **Prophet target** |
| `receipt_qty` | Goods receipts in month — regressor |
| `inv_qty` | Closing inventory — regressor |
| `unit_cost` | Average unit cost (from real data) — regressor |
| `n_locations` | Storage locations for this material — regressor |
| `is_synthetic` | 1 = generated, 0 = real data from source file |

---

## Fitting Prophet

```python
from prophet import Prophet
import pandas as pd

df = pd.read_csv("prophet_matgrp_24m.csv", parse_dates=['ds'])

results = {}
for grp_id, grp in df.groupby('MAT_GRP'):
    series = grp[['ds','y','receipt_qty','inv_qty']].copy()

    m = Prophet(
        yearly_seasonality=True,         # 24 months enables this
        weekly_seasonality=False,
        daily_seasonality=False,
        seasonality_mode='multiplicative',
        changepoint_prior_scale=0.05,
    )
    m.add_regressor('receipt_qty')
    m.add_regressor('inv_qty')
    m.fit(series)

    future = m.make_future_dataframe(periods=3, freq='ME')
    # Supply regressor values for future periods before calling predict
    forecast = m.predict(future)
    results[grp_id] = forecast

# For material-level forecasting (32K series), use the material CSV.
# Recommended: filter to is_synthetic==0 materials for validation.
```

---

## Important notes
- `is_synthetic=1` rows are statistically plausible but **not real observations**.
  They exist solely to satisfy Prophet's minimum data requirement.
- When real monthly data becomes available, **replace synthetic rows** month by month.
- For production use, fit at **MAT_GRP level** first (more stable),
  then drill into individual materials for high-value / high-consumption items.
