from __future__ import annotations

import traceback
from datetime import datetime
from typing import Any, Dict, List

import pandas as pd
from flask import Flask, jsonify, request
from prophet import Prophet

app = Flask(__name__)


def error(code: str, message: str, http_status: int):
    return jsonify({"error": {"code": code, "message": message}}), http_status


def parse_payload(payload: Dict[str, Any]):
    if not isinstance(payload, dict):
        raise ValueError("Body must be a JSON object")

    data = payload.get("data")
    if not isinstance(data, list) or len(data) == 0:
        raise ValueError('"data" must be a non-empty array')

    periods = payload.get("periods", 30)
    try:
        periods = int(periods)
    except Exception:
        raise ValueError('"periods" must be an integer')
    if periods <= 0 or periods > 365:
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

    # Prophet converges better with some minimum history; allow small history but it may be noisy.
    df = df.sort_values("ds")
    return df, periods


def run_prophet(df: pd.DataFrame, periods: int):
    model = Prophet(
        yearly_seasonality=True,
        weekly_seasonality=False,
        daily_seasonality=False,
        seasonality_mode="multiplicative",
        changepoint_prior_scale=0.05,
    )
    model.fit(df)
    future = model.make_future_dataframe(periods=periods, freq="D")
    forecast = model.predict(future)
    return model, forecast


@app.get("/health")
def health():
    return jsonify({"status": "ok", "ts": datetime.utcnow().isoformat() + "Z"})


@app.post("/forecast")
def forecast():
    try:
        payload = request.get_json(silent=True)
        if payload is None:
            return error("BAD_REQUEST", "Missing or invalid JSON body", 400)

        df, periods = parse_payload(payload)
        _, fc = run_prophet(df, periods)

        out = fc[["ds", "yhat", "yhat_lower", "yhat_upper"]].tail(periods).copy()
        out["ds"] = out["ds"].dt.strftime("%Y-%m-%d")
        return jsonify({"forecast": out.to_dict(orient="records")})
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

        df, periods = parse_payload(payload)
        _, fc = run_prophet(df, periods)

        cols = ["ds", "trend"]
        if "yearly" in fc.columns:
            cols.append("yearly")
        if "weekly" in fc.columns:
            cols.append("weekly")
        if "daily" in fc.columns:
            cols.append("daily")

        comp = fc[cols].tail(periods).copy()
        comp["ds"] = comp["ds"].dt.strftime("%Y-%m-%d")
        return jsonify({"components": comp.to_dict(orient="records")})
    except ValueError as ve:
        return error("VALIDATION_ERROR", str(ve), 400)
    except Exception as e:
        app.logger.error("Components error: %s\n%s", e, traceback.format_exc())
        return error("SERVER_ERROR", "Internal forecast error", 500)


if __name__ == "__main__":
    # Default port per PRD: 5001
    app.run(host="0.0.0.0", port=5001, debug=False)

