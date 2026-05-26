from __future__ import annotations

import traceback
from datetime import datetime
from typing import Any, Dict, List, Tuple

import numpy as np
import pandas as pd
from flask import Flask, jsonify, request
from prophet import Prophet

app = Flask(__name__)

CATEGORY_METHOD = {
    "INTERMITTENT": "croston",
    "LUMPY": "moving_average",
    "STABLE": "prophet_stable",
    "TRENDING": "prophet_trending",
    "SEASONAL": "prophet_seasonal",
    "DEFAULT": "prophet_default",
}


def error(code: str, message: str, http_status: int):
    return jsonify({"error": {"code": code, "message": message}}), http_status


def horizon_days_to_months(horizon_days: int) -> int:
    return max(1, int(round(horizon_days / 30.0)))


def parse_payload(payload: Dict[str, Any]):
    if not isinstance(payload, dict):
        raise ValueError("Body must be a JSON object")

    data = payload.get("data")
    if not isinstance(data, list) or len(data) == 0:
        raise ValueError('"data" must be a non-empty array')

    horizon_days = payload.get("periods", 30)
    try:
        horizon_days = int(horizon_days)
    except Exception:
        raise ValueError('"periods" must be an integer (horizon in days)')
    if horizon_days <= 0 or horizon_days > 365:
        raise ValueError('"periods" must be between 1 and 365')

    df = pd.DataFrame(data)
    if "ds" not in df.columns or "y" not in df.columns:
        raise ValueError('Each data row must include "ds" and "y"')

    df = df[["ds", "y"]].copy()
    df["ds"] = pd.to_datetime(df["ds"], errors="coerce")
    if df["ds"].isna().any():
        raise ValueError('Invalid date in "ds" (expected YYYY-MM-DD)')

    df["y"] = pd.to_numeric(df["y"], errors="coerce")
    if df["y"].isna().any():
        raise ValueError('Invalid numeric value in "y"')

    df = df.sort_values("ds").reset_index(drop=True)
    n_months = horizon_days_to_months(horizon_days)
    return df, horizon_days, n_months


def classify_material(monthly_y: List[float]) -> str:
    y = [float(v) for v in monthly_y]
    n = len(y)
    if n == 0:
        return "DEFAULT"

    zero_pct = sum(1 for v in y if v <= 0) / n
    if zero_pct > 0.4:
        return "INTERMITTENT"

    mean = float(np.mean(y))
    std = float(np.std(y, ddof=1)) if n > 1 else 0.0
    cv = (std / mean) if mean > 0 else 0.0
    has_zeros = zero_pct > 0

    if cv > 0.7 and has_zeros:
        return "LUMPY"
    if cv < 0.2:
        return "STABLE"

    if n >= 12:
        first6 = float(np.mean(y[:6]))
        last6 = float(np.mean(y[-6:]))
        if first6 > 0:
            change = (last6 - first6) / first6
            if abs(change) > 0.2:
                return "TRENDING"

    if n >= 24:
        ac = lag12_autocorr(y)
        if ac > 0.4:
            return "SEASONAL"

    return "DEFAULT"


def lag12_autocorr(y: List[float]) -> float:
    if len(y) < 24:
        return 0.0
    s = pd.Series(y)
    ac = s.autocorr(lag=12)
    return 0.0 if ac is None or np.isnan(ac) else float(ac)


def build_prophet_model(category: str, n_months: int) -> Prophet:
    yearly = False
    changepoint = 0.05

    if category == "SEASONAL":
        yearly = n_months >= 24
    elif category == "TRENDING":
        changepoint = 0.15
        yearly = n_months >= 36
    elif category in ("STABLE", "DEFAULT"):
        yearly = False
        changepoint = 0.05

    return Prophet(
        yearly_seasonality=yearly,
        weekly_seasonality=False,
        daily_seasonality=False,
        seasonality_mode="additive",
        changepoint_prior_scale=changepoint,
    )


def clip_forecast_columns(fc: pd.DataFrame) -> pd.DataFrame:
    for col in ("yhat", "yhat_lower", "yhat_upper"):
        if col in fc.columns:
            fc[col] = fc[col].clip(lower=0)
    return fc


def future_month_starts(n_months: int) -> pd.DatetimeIndex:
    start = pd.Timestamp.today().normalize() + pd.offsets.MonthBegin(1)
    return pd.date_range(start=start, periods=n_months, freq="MS")


def flat_monthly_forecast_df(n_months: int, monthly_level: float) -> pd.DataFrame:
    dates = future_month_starts(n_months)
    level = max(0.0, float(monthly_level))
    band = level * 0.2
    return pd.DataFrame(
        {
            "ds": dates,
            "yhat": level,
            "yhat_lower": np.maximum(0.0, level - band),
            "yhat_upper": level + band,
        }
    )


def croston_forecast(monthly_df: pd.DataFrame, n_months: int) -> pd.DataFrame:
    nz = monthly_df.loc[monthly_df["y"] > 0, "y"]
    if nz.empty:
        return flat_monthly_forecast_df(n_months, 0.0)
    level = float(nz.mean())
    return flat_monthly_forecast_df(n_months, level)


def weighted_ma_forecast(monthly_df: pd.DataFrame, n_months: int) -> pd.DataFrame:
    nz = monthly_df.loc[monthly_df["y"] > 0].copy()
    if nz.empty:
        return flat_monthly_forecast_df(n_months, 0.0)
    tail = nz.tail(6)
    weights = np.arange(1, len(tail) + 1, dtype=float)
    level = float(np.average(tail["y"].values, weights=weights))
    return flat_monthly_forecast_df(n_months, level)


def run_prophet(monthly_df: pd.DataFrame, n_months: int, category: str, n_hist: int) -> pd.DataFrame:
    model = build_prophet_model(category, n_hist)
    model.fit(monthly_df)
    future = model.make_future_dataframe(periods=n_months, freq="MS")
    forecast = model.predict(future)
    return clip_forecast_columns(forecast)


def run_material_forecast(
    monthly_df: pd.DataFrame, horizon_days: int, n_months: int
) -> Tuple[pd.DataFrame, str, str]:
    monthly_y = monthly_df["y"].tolist()
    category = classify_material(monthly_y)
    n_hist = len(monthly_df)

    if category == "INTERMITTENT":
        out = croston_forecast(monthly_df, n_months)
        method = "croston"
    elif category == "LUMPY":
        out = weighted_ma_forecast(monthly_df, n_months)
        method = "moving_average"
    else:
        prophet_category = category
        if category == "SEASONAL" and n_hist < 24:
            prophet_category = "STABLE"
        fc = run_prophet(monthly_df, n_months, prophet_category, n_hist)
        out = fc[["ds", "yhat", "yhat_lower", "yhat_upper"]].tail(n_months).copy()
        method = CATEGORY_METHOD.get(category, "prophet_default")

    out = clip_forecast_columns(out)
    return out, method, category


@app.get("/health")
def health():
    return jsonify({"status": "ok", "ts": datetime.utcnow().isoformat() + "Z"})


@app.post("/forecast")
def forecast():
    try:
        payload = request.get_json(silent=True)
        if payload is None:
            return error("BAD_REQUEST", "Missing or invalid JSON body", 400)

        monthly_df, horizon_days, n_months = parse_payload(payload)
        out, method, category = run_material_forecast(monthly_df, horizon_days, n_months)
        out["ds"] = out["ds"].dt.strftime("%Y-%m-%d")
        return jsonify(
            {
                "forecast": out.to_dict(orient="records"),
                "forecast_method": method,
                "material_category": category,
                "forecast_granularity": "monthly",
                "horizon_days": horizon_days,
                "horizon_months": n_months,
            }
        )
    except ValueError as ve:
        return error("VALIDATION_ERROR", str(ve), 400)
    except Exception as e:
        app.logger.error("Forecast error: %s\n%s", e, traceback.format_exc())
        return error("SERVER_ERROR", "Internal forecast error", 500)


@app.post("/forecast/components")
def forecast_components():
    try:
        payload = request.get_json(silent=True)
        if payload is None:
            return error("BAD_REQUEST", "Missing or invalid JSON body", 400)

        monthly_df, horizon_days, n_months = parse_payload(payload)
        category = classify_material(monthly_df["y"].tolist())
        n_hist = len(monthly_df)

        if category in ("INTERMITTENT", "LUMPY"):
            return jsonify(
                {
                    "components": [],
                    "forecast_method": CATEGORY_METHOD.get(category, category.lower()),
                    "material_category": category,
                    "forecast_granularity": "monthly",
                    "horizon_days": horizon_days,
                    "horizon_months": n_months,
                }
            )

        prophet_category = category
        if category == "SEASONAL" and n_hist < 24:
            prophet_category = "STABLE"
        model = build_prophet_model(prophet_category, n_hist)
        model.fit(monthly_df)
        future = model.make_future_dataframe(periods=n_months, freq="MS")
        fc = model.predict(future)

        cols = ["ds", "trend"]
        if "yearly" in fc.columns:
            cols.append("yearly")
        if "weekly" in fc.columns:
            cols.append("weekly")
        if "daily" in fc.columns:
            cols.append("daily")

        comp = fc[cols].tail(n_months).copy()
        comp["ds"] = comp["ds"].dt.strftime("%Y-%m-%d")
        return jsonify(
            {
                "components": comp.to_dict(orient="records"),
                "forecast_method": CATEGORY_METHOD.get(category, "prophet_default"),
                "material_category": category,
                "forecast_granularity": "monthly",
                "horizon_days": horizon_days,
                "horizon_months": n_months,
            }
        )
    except ValueError as ve:
        return error("VALIDATION_ERROR", str(ve), 400)
    except Exception as e:
        app.logger.error("Components error: %s\n%s", e, traceback.format_exc())
        return error("SERVER_ERROR", "Internal forecast error", 500)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=False)
