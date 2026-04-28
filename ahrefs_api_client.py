"""
Klient Ahrefs API v3 — pobieranie metryk SEO z prawdziwego API.

Używane endpointy:
- GET /v3/site-explorer/domain-rating       → Domain Rating + Ahrefs Rank
- GET /v3/site-explorer/backlinks-stats     → live backlinks + live referring domains
- GET /v3/site-explorer/metrics-history     → szereg miesięczny org_traffic (sezonowość)
- GET /v3/subscription-info/limits-and-usage (debug)

Każde z tych zapytań kosztuje 1 rows-row z miesięcznego limitu.
"""

from typing import Dict, Any, List, Optional
from urllib.parse import urlparse
from datetime import date, timedelta
from collections import defaultdict
import time

import requests

from config import config


class AhrefsApiError(Exception):
    """Błąd komunikacji z Ahrefs API v3."""


class AhrefsApiClient:
    """Klient REST do Ahrefs API v3."""

    def __init__(self):
        self.base_url = config.AHREFS_API_BASE_URL.rstrip("/")
        self.api_key = config.AHREFS_API_KEY
        self.enabled = config.AHREFS_ENABLED
        self.timeout = config.AHREFS_TIMEOUT

        if not self.enabled:
            print("🔴 Ahrefs API Client: wyłączony (AHREFS_ENABLED=False)")
        elif not self.api_key:
            print("🔴 Ahrefs API Client: brak AHREFS_API_KEY w .env")
        else:
            print("🟢 Ahrefs API Client: aktywny (Ahrefs v3)")

    @staticmethod
    def _extract_domain(domain_input: str) -> str:
        """Normalizuje wejście do gołej domeny."""
        try:
            cleaned = (domain_input or "").strip()
            if not cleaned:
                return ""
            if not cleaned.startswith(("http://", "https://")):
                cleaned = "https://" + cleaned
            parsed = urlparse(cleaned)
            host = (parsed.netloc or "").lower()
            if host.startswith("www."):
                host = host[4:]
            if ":" in host:
                host = host.split(":", 1)[0]
            return host
        except Exception:
            return (domain_input or "").lower().strip()

    def _ensure_ready(self):
        if not self.enabled:
            raise AhrefsApiError("Ahrefs jest wyłączony (AHREFS_ENABLED=False)")
        if not self.api_key:
            raise AhrefsApiError("Brak AHREFS_API_KEY w .env — patrz AHREFS_SETUP.md")

    def _headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Accept": "application/json",
        }

    def _get(self, path: str, params: Dict[str, Any], _retries: int = 2) -> Dict[str, Any]:
        self._ensure_ready()
        url = f"{self.base_url}{path}"
        last_exc = None

        for attempt in range(1, _retries + 1):
            try:
                resp = requests.get(url, headers=self._headers(), params=params, timeout=self.timeout)
            except requests.RequestException as exc:
                last_exc = AhrefsApiError(f"Błąd sieci przy GET {path}: {exc}")
                if attempt < _retries:
                    time.sleep(3)
                continue

            if resp.status_code == 401:
                raise AhrefsApiError("Ahrefs zwrócił 401 — klucz nieważny lub wygasł.")
            if resp.status_code == 403:
                raise AhrefsApiError("Ahrefs zwrócił 403 — brak uprawnień do tego endpointu.")
            if resp.status_code == 429:
                raise AhrefsApiError("Ahrefs zwrócił 429 — przekroczony limit zapytań.")
            if resp.status_code >= 500:
                last_exc = AhrefsApiError(f"Ahrefs HTTP {resp.status_code}: {resp.text[:300]}")
                if attempt < _retries:
                    print(f"⚠️  Ahrefs HTTP {resp.status_code} dla {path} — ponawiam ({attempt}/{_retries})...")
                    time.sleep(3)
                continue
            if resp.status_code >= 400:
                raise AhrefsApiError(f"Ahrefs HTTP {resp.status_code}: {resp.text[:300]}")

            try:
                return resp.json()
            except ValueError:
                raise AhrefsApiError(f"Niepoprawny JSON z Ahrefs ({resp.status_code}): {resp.text[:200]}")

        raise last_exc

    @staticmethod
    def _today_iso() -> str:
        return date.today().isoformat()

    def get_domain_rating(self, domain: str) -> Optional[float]:
        """Pobiera Domain Rating dla domeny."""
        clean = self._extract_domain(domain)
        payload = self._get(
            "/v3/site-explorer/domain-rating",
            params={"target": clean, "date": self._today_iso(), "protocol": "both"},
        )
        block = payload.get("domain_rating") or {}
        try:
            return float(block.get("domain_rating", 0) or 0)
        except (TypeError, ValueError):
            return 0.0

    def get_backlinks_stats(self, domain: str) -> Dict[str, int]:
        """
        Pobiera live backlinki i live referring_domains dla CAŁEJ domeny
        (włącznie ze wszystkimi subdomenami: www, m, blog, sklep, itd.).

        `mode=subdomains` odpowiada widokowi "*.domain.com" w panelu Ahrefs —
        to standardowa metryka "siły domeny" w SEO.
        """
        clean = self._extract_domain(domain)
        payload = self._get(
            "/v3/site-explorer/backlinks-stats",
            params={
                "target": clean,
                "date": self._today_iso(),
                "protocol": "both",
                "mode": "subdomains",
            },
        )
        metrics = payload.get("metrics") or {}
        try:
            backlinks = int(metrics.get("live", 0) or 0)
        except (TypeError, ValueError):
            backlinks = 0
        try:
            refdomains = int(metrics.get("live_refdomains", 0) or 0)
        except (TypeError, ValueError):
            refdomains = 0
        return {"backlinks": backlinks, "referring_domains": refdomains}

    def get_organic_traffic_history(
        self, domain: str, months: int = 24
    ) -> List[Dict[str, Any]]:
        """
        Pobiera miesięczny szereg org_traffic z Ahrefs (metrics-history).
        Zwraca listę {"date": "YYYY-MM-DD", "org_traffic": int} posortowaną chronologicznie.
        """
        clean = self._extract_domain(domain)
        today = date.today()
        date_from = (today.replace(day=1) - timedelta(days=months * 30)).replace(day=1)

        payload = self._get(
            "/v3/site-explorer/metrics-history",
            params={
                "target": clean,
                "date_from": date_from.isoformat(),
                "date_to": today.isoformat(),
                "mode": "subdomains",
                "volume_mode": "monthly",
                "history_grouping": "monthly",
            },
        )
        raw = payload.get("metrics") or []
        return [
            {"date": m["date"][:10], "org_traffic": int(m.get("org_traffic", 0))}
            for m in raw
        ]

    def compute_seasonality(
        self, domain: str, months: int = 24
    ) -> List[float]:
        """
        Zwraca 12 mnożników sezonowości (styczeń=index 0 … grudzień=index 11)
        wyliczonych z historii org_traffic lidera rynku.
        Każdy mnożnik = średni_ruch_w_danym_miesiącu / średni_ruch_roczny.
        """
        history = self.get_organic_traffic_history(domain, months)
        if not history:
            return [1.0] * 12

        by_month: Dict[int, List[int]] = defaultdict(list)
        for entry in history:
            month_num = int(entry["date"][5:7])
            by_month[month_num].append(entry["org_traffic"])

        month_avgs = {}
        for m in range(1, 13):
            vals = by_month.get(m, [])
            month_avgs[m] = sum(vals) / len(vals) if vals else 0

        grand_mean = sum(month_avgs.values()) / 12 if any(month_avgs.values()) else 1
        if grand_mean == 0:
            return [1.0] * 12

        return [round(month_avgs[m] / grand_mean, 4) for m in range(1, 13)]

    def get_subscription_info(self) -> Dict[str, Any]:
        """Pobiera info o subskrypcji + bieżącym zużyciu."""
        return self._get("/v3/subscription-info/limits-and-usage", params={})

    def get_domain_metrics(self, domain: str) -> Dict[str, Any]:
        """
        Pełny zestaw metryk Ahrefs dla domeny:
        domain_rating, referring_domains, backlinks.

        Pola TOP/URL/traffic są zerowane — te lecą z Senuto.
        """
        clean = self._extract_domain(domain)
        print(f"📡 AhrefsApiClient: pobieram metryki dla '{clean}'")

        dr = self.get_domain_rating(clean)
        bl = self.get_backlinks_stats(clean)

        result = {
            "domain": clean,
            "domain_rating": round(dr, 1),
            "referring_domains": bl["referring_domains"],
            "backlinks": bl["backlinks"],
            # poniższe wypełnia Senuto:
            "top3_keywords": 0,
            "top10_keywords": 0,
            "top50_keywords": 0,
            "urls_in_top10": 0,
            "urls_in_top50": 0,
            "estimated_traffic": 0,
            "data_source": "ahrefs_api",
        }
        print(
            f"✅ AhrefsApiClient: {clean} → DR={result['domain_rating']}, "
            f"refdomains={result['referring_domains']}, backlinks={result['backlinks']}"
        )
        return result


ahrefs_api_client = AhrefsApiClient()
