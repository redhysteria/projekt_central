"""
Serwis Senuto API dla analizy SEO.

Pobiera z Senuto:
- TOP 3 / TOP 10 / TOP 50 (liczba słów kluczowych w danym przedziale pozycji)
- Liczba URL w TOP 10 / TOP 50
- Szacowany ruch (visibility z getDomainStatistics)

Autoryzacja: Bearer token (ważny 30 dni). Token wygeneruj wg SENUTO_SETUP.md.
"""

from typing import Dict, Any
from urllib.parse import urlparse

import requests

from config import config


class SenutoServiceError(Exception):
    """Błąd komunikacji z Senuto API."""


class SenutoService:
    """Klient Senuto API (Visibility Analysis)."""

    def __init__(self):
        self.base_url = config.SENUTO_API_BASE_URL.rstrip("/")
        self.token = config.SENUTO_API_TOKEN
        self.country_id = config.SENUTO_COUNTRY_ID
        self.fetch_mode = config.SENUTO_FETCH_MODE
        self.top10_max_pages = config.SENUTO_TOP10_MAX_PAGES
        self.timeout = config.SENUTO_TIMEOUT
        self.enabled = config.SENUTO_ENABLED

        if not self.enabled:
            print("🔴 Senuto Service: wyłączone (SENUTO_ENABLED=False)")
        elif not self.token:
            print("🔴 Senuto Service: brak SENUTO_API_TOKEN — operacje będą kończyć się błędem")
        else:
            db_label = "Poland 2.0" if self.country_id == 200 else ("Poland 1.0" if self.country_id == 1 else f"country_id={self.country_id}")
            print(f"🟢 Senuto Service: aktywne (country_id={self.country_id}, {db_label}, fetch_mode={self.fetch_mode})")

    @staticmethod
    def _extract_domain(domain_input: str) -> str:
        """Normalizuje wejście do gołej domeny (np. 'example.com')."""
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
            raise SenutoServiceError("Senuto jest wyłączone (SENUTO_ENABLED=False)")
        if not self.token:
            raise SenutoServiceError("Brak SENUTO_API_TOKEN w .env — patrz SENUTO_SETUP.md")

    def _headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.token}",
            "Accept": "application/json",
        }

    def _request(self, method: str, path: str, *, params=None, data=None) -> Dict[str, Any]:
        """Wykonuje zapytanie do Senuto API i zwraca payload `data` z odpowiedzi."""
        self._ensure_ready()
        url = f"{self.base_url}{path}"
        try:
            resp = requests.request(
                method=method,
                url=url,
                headers=self._headers(),
                params=params,
                data=data,
                timeout=self.timeout,
            )
        except requests.RequestException as exc:
            raise SenutoServiceError(f"Błąd sieci przy {method} {path}: {exc}") from exc

        # Senuto zwraca błędy z kodem 418 lub 4xx + JSON-em z polem error
        try:
            payload = resp.json()
        except ValueError:
            raise SenutoServiceError(
                f"Niepoprawna odpowiedź z Senuto ({resp.status_code}): {resp.text[:300]}"
            )

        if resp.status_code == 401:
            raise SenutoServiceError(
                "Senuto zwróciło 401 — token wygasł lub jest nieprawidłowy. Wygeneruj nowy."
            )

        if not payload.get("success", False):
            err = (payload.get("data") or {}).get("error") or {}
            msg = err.get("message") or "Nieznany błąd Senuto"
            raise SenutoServiceError(f"Senuto API error ({resp.status_code}): {msg}")

        return payload

    def get_domain_statistics(self, domain: str) -> Dict[str, int]:
        """
        Pobiera statystyki domeny z Senuto:
        TOP3, TOP10, TOP50 (keywords), visibility (estimated traffic).
        """
        clean = self._extract_domain(domain)
        params = {
            "domain": clean,
            "fetch_mode": self.fetch_mode,
            "country_id": self.country_id,
        }
        payload = self._request(
            "GET",
            "/api/visibility_analysis/reports/dashboard/getDomainStatistics",
            params=params,
        )
        stats = (payload.get("data") or {}).get("statistics") or {}

        def _val(key: str) -> int:
            block = stats.get(key) or {}
            value = block.get("recent_value", 0) or 0
            try:
                return int(round(float(value)))
            except (TypeError, ValueError):
                return 0

        return {
            "top3_keywords": _val("top3"),
            "top10_keywords": _val("top10"),
            "top50_keywords": _val("top50"),
            "estimated_traffic": _val("visibility"),
        }

    def get_urls_counts(self, domain: str) -> Dict[str, int]:
        """
        Pobiera unique_urls_top10 i unique_urls_top50 z endpointu
        getPositionsHistoryChartDataForAllTypes (najświeższa wartość).
        """
        from datetime import date, timedelta
        clean = self._extract_domain(domain)
        today = date.today()
        payload = self._request(
            "GET",
            "/api/visibility_analysis/reports/domain_positions/getPositionsHistoryChartDataForAllTypes",
            params={
                "domain": clean,
                "fetch_mode": self.fetch_mode,
                "country_id": self.country_id,
                "date_min": (today - timedelta(days=7)).isoformat(),
                "date_max": today.isoformat(),
                "date_interval": "daily",
            },
        )

        items = payload.get("data") or []
        if not items or not isinstance(items[0], dict):
            return {"urls_in_top10": 0, "urls_in_top50": 0}

        all_data = items[0].get("data", {}).get("all", {})

        def _latest(key: str) -> int:
            series = all_data.get(key, {})
            if not series:
                return 0
            last_val = list(series.values())[-1]
            try:
                return int(round(float(last_val)))
            except (TypeError, ValueError):
                return 0

        return {
            "urls_in_top10": _latest("unique_urls_top10"),
            "urls_in_top50": _latest("unique_urls_top50"),
        }

    def get_domain_metrics(self, domain: str) -> Dict[str, Any]:
        """
        Pełny zestaw metryk z Senuto dla pojedynczej domeny.
        Uwaga: Senuto NIE zwraca Domain Rating ani referring_domains —
        te pola są wypełniane przez ahrefs_service / dataforseo_service.
        """
        clean = self._extract_domain(domain)
        print(f"📡 SenutoService: pobieram metryki dla domeny '{clean}'")

        stats = self.get_domain_statistics(clean)

        try:
            urls = self.get_urls_counts(clean)
        except SenutoServiceError as exc:
            print(f"⚠️  Senuto: nie udało się pobrać URL counts dla {clean}: {exc}")
            urls = {"urls_in_top10": 0, "urls_in_top50": 0}

        result = {
            "domain": clean,
            **stats,
            "urls_in_top10": urls["urls_in_top10"],
            "urls_in_top50": urls["urls_in_top50"],
            "data_source": "senuto",
        }
        print(
            f"✅ SenutoService: {clean} → top3={stats['top3_keywords']}, "
            f"top10={stats['top10_keywords']}, top50={stats['top50_keywords']}, "
            f"urls_top10={urls['urls_in_top10']}, urls_top50={urls['urls_in_top50']}, "
            f"traffic={stats['estimated_traffic']}"
        )
        return result


senuto_service = SenutoService()
