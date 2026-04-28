"""
GA4 CSV parser + Prophet forecasting module.

Parses organic traffic data exported from Google Analytics 4,
fits a Prophet model, and produces a 12-month baseline forecast
with confidence intervals and seasonality multipliers.
"""

import io
import logging
import re
from collections import defaultdict
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd
from prophet import Prophet

logger = logging.getLogger(__name__)

SESSION_COL_ALIASES = [
    'sessions', 'organic sessions', 'sesje', 'sesje organiczne',
    'users', 'organic users', 'użytkownicy', 'total users',
    'active users', 'aktywni użytkownicy',
]

DATE_COL_ALIASES = [
    'date', 'data', 'month', 'miesiąc', 'miesiac', 'day', 'dzień',
    'nth month', 'nth day',
]

CONVERSION_COL_ALIASES = [
    'conversions', 'konwersje', 'transactions', 'transakcje',
    'key events', 'zdarzenia kluczowe',
]

REVENUE_COL_ALIASES = [
    'revenue', 'przychód', 'przychod', 'total revenue',
    'purchase revenue', 'przychody',
]


def _normalize_col(name: str) -> str:
    return re.sub(r'\s+', ' ', name.strip().lower())


def _find_column(df: pd.DataFrame, aliases: List[str]) -> Optional[str]:
    norm_map = {_normalize_col(c): c for c in df.columns}
    for alias in aliases:
        if alias in norm_map:
            return norm_map[alias]
    return None


def parse_ga4_csv(file_content: bytes) -> pd.DataFrame:
    """Parse GA4 CSV export into a DataFrame with ds, y, and optional conversions/revenue."""
    text = file_content.decode('utf-8-sig')
    df = pd.read_csv(io.StringIO(text))

    if len(df.columns) < 2:
        raise ValueError("CSV musi mieć co najmniej 2 kolumny (data + sesje)")

    date_col = _find_column(df, DATE_COL_ALIASES)
    session_col = _find_column(df, SESSION_COL_ALIASES)

    if date_col is None:
        date_col = df.columns[0]
        logger.warning("Nie rozpoznano kolumny daty, używam pierwszej: %s", date_col)
    if session_col is None:
        session_col = df.columns[1]
        logger.warning("Nie rozpoznano kolumny sesji, używam drugiej: %s", session_col)

    result = pd.DataFrame()
    result['ds'] = pd.to_datetime(df[date_col], dayfirst=False)
    result['y'] = pd.to_numeric(
        df[session_col].astype(str).str.replace(r'[^\d.]', '', regex=True),
        errors='coerce',
    ).fillna(0).astype(float)

    conv_col = _find_column(df, CONVERSION_COL_ALIASES)
    if conv_col:
        result['conversions'] = pd.to_numeric(
            df[conv_col].astype(str).str.replace(r'[^\d.]', '', regex=True),
            errors='coerce',
        ).fillna(0)

    rev_col = _find_column(df, REVENUE_COL_ALIASES)
    if rev_col:
        result['revenue'] = pd.to_numeric(
            df[rev_col].astype(str).str.replace(r'[^\d.]', '', regex=True),
            errors='coerce',
        ).fillna(0)

    result = result.sort_values('ds').reset_index(drop=True)
    result = result[result['y'] > 0]

    if len(result) < 6:
        raise ValueError(f"Za mało danych: {len(result)} wierszy (minimum 6 miesięcy)")

    return result


def _aggregate_to_monthly(df: pd.DataFrame) -> pd.DataFrame:
    """If data is daily, aggregate to monthly sums."""
    df = df.copy()
    df['month'] = df['ds'].dt.to_period('M')
    agg_cols = {'y': 'sum'}
    if 'conversions' in df.columns:
        agg_cols['conversions'] = 'sum'
    if 'revenue' in df.columns:
        agg_cols['revenue'] = 'sum'

    monthly = df.groupby('month').agg(agg_cols).reset_index()
    monthly['ds'] = monthly['month'].dt.to_timestamp()
    monthly = monthly.drop(columns=['month'])
    return monthly


def _is_daily_data(df: pd.DataFrame) -> bool:
    if len(df) < 3:
        return False
    diffs = df['ds'].diff().dropna().dt.days
    return diffs.median() < 15


def run_prophet_forecast(
    df: pd.DataFrame, periods: int = 12
) -> Dict[str, Any]:
    """Fit Prophet on GA4 data and forecast `periods` months ahead.

    Returns dict with:
      - history: list of {date, traffic} for the historical data
      - forecast: list of {date, yhat, yhat_lower, yhat_upper} for future months
      - seasonality: 12 monthly multipliers (Jan-Dec)
      - ga4_metrics: dict with avg conversion rate and avg AOV if available
    """
    if _is_daily_data(df):
        df = _aggregate_to_monthly(df)

    has_conversions = 'conversions' in df.columns
    has_revenue = 'revenue' in df.columns

    ga4_metrics = {}
    if has_conversions and df['y'].sum() > 0:
        ga4_metrics['avg_conversion_rate'] = round(
            float(df['conversions'].sum() / df['y'].sum()), 4
        )
    if has_revenue and has_conversions and df['conversions'].sum() > 0:
        ga4_metrics['avg_aov'] = round(
            float(df['revenue'].sum() / df['conversions'].sum()), 2
        )

    prophet_df = df[['ds', 'y']].copy()

    m = Prophet(
        yearly_seasonality=True,
        weekly_seasonality=False,
        daily_seasonality=False,
        interval_width=0.80,
    )

    import logging as _logging
    _logging.getLogger('cmdstanpy').setLevel(_logging.WARNING)

    m.fit(prophet_df)

    last_date = prophet_df['ds'].max()
    future = m.make_future_dataframe(periods=periods, freq='MS')
    future = future[future['ds'] > last_date]

    pred = m.predict(future)

    forecast_rows = []
    for _, row in pred.iterrows():
        forecast_rows.append({
            'date': row['ds'].strftime('%Y-%m-%d'),
            'yhat': max(0, round(float(row['yhat']))),
            'yhat_lower': max(0, round(float(row['yhat_lower']))),
            'yhat_upper': max(0, round(float(row['yhat_upper']))),
        })

    history_rows = []
    for _, row in prophet_df.iterrows():
        entry = {
            'date': row['ds'].strftime('%Y-%m-%d'),
            'traffic': round(float(row['y'])),
        }
        history_rows.append(entry)

    seasonality = compute_ga4_seasonality(prophet_df)

    return {
        'history': history_rows,
        'forecast': forecast_rows,
        'seasonality': seasonality,
        'ga4_metrics': ga4_metrics,
        'data_months': len(prophet_df),
    }


def compute_ga4_seasonality(df: pd.DataFrame) -> List[float]:
    """Compute 12 monthly seasonality multipliers (Jan=0 .. Dec=11) from GA4 data."""
    if _is_daily_data(df):
        df = _aggregate_to_monthly(df)

    monthly_traffic = defaultdict(list)
    for _, row in df.iterrows():
        month_idx = row['ds'].month - 1
        monthly_traffic[month_idx].append(float(row['y']))

    overall_avg = df['y'].mean()
    if overall_avg == 0:
        return [1.0] * 12

    multipliers = []
    for m in range(12):
        if monthly_traffic[m]:
            month_avg = sum(monthly_traffic[m]) / len(monthly_traffic[m])
            multipliers.append(round(month_avg / overall_avg, 2))
        else:
            multipliers.append(1.0)

    return multipliers
