"""
Logika estymacji 12-miesięcznej (ruch + ROI).

Deterministyczny model what-if:
  1. Link Building (LB) — kompoundowy wzrost bazy ruchu na podstawie Domain Gap
  2. Content Marketing   — krzywa ramp-up nowych artykułów
  3. Sezonowość          — mnożnik z historii lidera (Ahrefs metrics-history)
  4. Finanse             — Orders → Revenue → Gross Margin → Net Profit → Break-even
"""

import math
import re
from typing import Any, Dict, List, Optional


CONTENT_RAMP = [0.0, 0.10, 0.50, 0.80, 1.00]


def extract_client_domain(quote_name: str) -> Optional[str]:
    """
    Wyciąga domenę z nazwy wyceny (np. 'oponeo.pl' → 'oponeo.pl').
    Zwraca None jeśli nazwa nie wygląda jak domena.
    """
    if not quote_name:
        return None
    cleaned = quote_name.strip().lower()
    match = re.search(r'[a-z0-9]([a-z0-9-]*[a-z0-9])?\.[a-z]{2,}(\.[a-z]{2,})?', cleaned)
    return match.group(0) if match else None


def pick_market_leader(
    seo_results: List[Dict[str, Any]],
    client_domain: Optional[str],
) -> Optional[Dict[str, Any]]:
    """
    Wybiera lidera rynku = domena o największym estimated_traffic,
    z pominięciem domeny klienta.
    """
    candidates = [
        r for r in seo_results
        if r.get('domain', '').lower() != (client_domain or '').lower()
    ]
    if not candidates:
        return None
    return max(candidates, key=lambda r: r.get('estimated_traffic', 0))


def calculate_forecast(
    client_rd: int,
    avg_competitor_rd: float,
    client_estimated_traffic: int,
    avg_kw_per_url: float,
    avg_traffic_per_kw: float,
    conversion_rate: float,
    aov: float,
    margin: float,
    fixed_seo_budget: float,
    monthly_content_volume: int,
    seasonality: List[float],
    current_month_index: int = 0,
    client_top10: int = 0,
    client_top3: int = 0,
) -> Dict[str, Any]:
    """
    Kalkulacja 12-miesięczna zgodna z docka_estymacja.txt.

    current_month_index: indeks 0-11 aktualnego miesiąca (do deseasonalizacji).
    seasonality: lista 12 mnożników (sty=0 … gru=11).

    Zwraca dict z kluczami:
      - rows: lista 12 dict-ów (month, base_lb_traffic, content_traffic, ...)
      - domain_gap, monthly_lb_rate, monthly_lb_cost, max_batch_traffic
      - break_even_month (1-12 lub None)
    """
    if len(seasonality) != 12:
        seasonality = [1.0] * 12

    domain_gap = avg_competitor_rd - client_rd

    if domain_gap <= 0:
        monthly_lb_rate = 0.005
    else:
        raw = (domain_gap / 12) / 100
        monthly_lb_rate = min(raw, 0.02)

    monthly_lb_cost = (domain_gap / 12 * 400) if domain_gap > 0 else 0

    max_batch_traffic = monthly_content_volume * avg_kw_per_url * avg_traffic_per_kw

    current_season = seasonality[current_month_index] if seasonality[current_month_index] > 0 else 1.0
    base_traffic = client_estimated_traffic / current_season
    base_initial = base_traffic

    top10_base = float(client_top10)
    top3_base = float(client_top3)

    NO_EFFECT_MONTHS = 2

    rows = []
    cum_net = 0.0
    break_even_month = None

    for i in range(1, 13):
        season_idx = (current_month_index + i) % 12
        season_mul = seasonality[season_idx]
        no_seo_traffic = round(base_initial * season_mul)
        no_seo_revenue = round(no_seo_traffic * conversion_rate * aov, 2)

        if i <= NO_EFFECT_MONTHS:
            eff_traffic = no_seo_traffic
            orders = eff_traffic * conversion_rate
            revenue = orders * aov
            gross = revenue * margin
            total_cost = fixed_seo_budget + monthly_lb_cost
            net = gross - total_cost
            cum_net += net
            if break_even_month is None and cum_net > 0:
                break_even_month = i

            rows.append({
                'month': i,
                'base_lb_traffic': round(base_initial, 0),
                'content_traffic': 0,
                'pure_traffic': round(base_initial, 0),
                'seasonality_multiplier': round(season_mul, 4),
                'base_initial': round(base_initial, 0),
                'final_traffic': eff_traffic,
                'top10': client_top10,
                'top3': client_top3,
                'no_seo_traffic': no_seo_traffic,
                'no_seo_revenue': no_seo_revenue,
                'orders': round(orders, 2),
                'revenue': round(revenue, 2),
                'gross_margin': round(gross, 2),
                'total_cost': round(total_cost, 2),
                'net_profit': round(net, 2),
                'cumulative_net_profit': round(cum_net, 2),
            })
            continue

        effective_i = i - NO_EFFECT_MONTHS

        base_traffic *= (1 + monthly_lb_rate)
        top10_base *= (1 + monthly_lb_rate)
        top3_base *= (1 + monthly_lb_rate * 0.6)

        content_traffic = 0.0
        content_kw = 0.0
        for j in range(1, effective_i + 1):
            age = effective_i - j
            content_traffic += max_batch_traffic * CONTENT_RAMP[min(age, 4)]
            content_kw += monthly_content_volume * avg_kw_per_url * CONTENT_RAMP[min(age, 4)]

        top10_val = round(top10_base + content_kw)
        top3_val = round(top3_base + content_kw * 0.3)

        MAX_GROWTH_FACTOR = 3
        max_intervention = base_initial * MAX_GROWTH_FACTOR
        raw_intervention = (base_traffic - base_initial) + content_traffic
        intervention = min(raw_intervention, max_intervention)
        capped_pure = base_initial + intervention
        pure = capped_pure
        final_traffic = pure * season_mul

        orders = final_traffic * conversion_rate
        revenue = orders * aov
        gross = revenue * margin
        total_cost = fixed_seo_budget + monthly_lb_cost
        net = gross - total_cost
        cum_net += net

        if break_even_month is None and cum_net > 0:
            break_even_month = i

        rows.append({
            'month': i,
            'base_lb_traffic': round(base_traffic, 0),
            'content_traffic': round(content_traffic, 0),
            'pure_traffic': round(pure, 0),
            'seasonality_multiplier': round(season_mul, 4),
            'base_initial': round(base_initial, 0),
            'final_traffic': round(final_traffic, 0),
            'top10': top10_val,
            'top3': top3_val,
            'no_seo_traffic': no_seo_traffic,
            'no_seo_revenue': no_seo_revenue,
            'orders': round(orders, 2),
            'revenue': round(revenue, 2),
            'gross_margin': round(gross, 2),
            'total_cost': round(total_cost, 2),
            'net_profit': round(net, 2),
            'cumulative_net_profit': round(cum_net, 2),
        })

    return {
        'domain_gap': round(domain_gap, 2),
        'monthly_lb_rate': round(monthly_lb_rate, 4),
        'monthly_lb_cost': round(monthly_lb_cost, 2),
        'max_batch_traffic': round(max_batch_traffic, 2),
        'break_even_month': break_even_month,
        'rows': rows,
    }
