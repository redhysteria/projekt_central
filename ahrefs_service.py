"""
Serwis Ahrefs dla analizy SEO.

Korzysta z realnego klienta `ahrefs_api_client` (Ahrefs API v3).
Jeśli klucz nie działa lub `AHREFS_FALLBACK_TO_MOCK=True` — fallback na mock.
"""

from typing import Dict, Any, Optional

from config import Config
from ahrefs_api_client import ahrefs_api_client, AhrefsApiError
from ahrefs_mcp_client import ahrefs_mcp_client


class AhrefsService:
    """Wrapper na Ahrefs API z opcjonalnym fallbackiem na mocki."""

    def __init__(self, cfg: Optional[Config] = None):
        self.config = cfg or Config()
        self.api = ahrefs_api_client
        self.mock = ahrefs_mcp_client

        if not self.config.AHREFS_API_KEY:
            print("🔴 Ahrefs Service: brak klucza API")
        elif not self.config.AHREFS_ENABLED:
            print("🔴 Ahrefs Service: wyłączony (AHREFS_ENABLED=False)")
        else:
            print("🟢 Ahrefs Service: Używam Ahrefs API v3")

    def get_domain_metrics(self, domain_input: str) -> Dict[str, Any]:
        """Pobiera DR + Referring Domains + Backlinks dla domeny."""
        if not self.config.AHREFS_ENABLED:
            raise Exception("Ahrefs jest wyłączony (AHREFS_ENABLED=False)")
        if not self.config.AHREFS_API_KEY:
            if self.config.AHREFS_FALLBACK_TO_MOCK:
                return self._with_mock(domain_input, reason="brak klucza API")
            raise Exception("Brak AHREFS_API_KEY w .env")

        try:
            return self.api.get_domain_metrics(domain_input)
        except AhrefsApiError as exc:
            if self.config.AHREFS_FALLBACK_TO_MOCK:
                return self._with_mock(domain_input, reason=str(exc))
            raise Exception(f"Błąd Ahrefs API dla {domain_input}: {exc}") from exc

    def _with_mock(self, domain_input: str, *, reason: str) -> Dict[str, Any]:
        print(f"⚠️  Ahrefs: fallback na mock ({reason})")
        metrics = self.mock.get_domain_metrics(domain_input)
        if metrics is None:
            metrics = {}
        # Mock nie ma backlinks — uzupełniamy
        metrics.setdefault("backlinks", 0)
        metrics["data_source"] = "ahrefs_mock"
        return metrics


ahrefs_service = AhrefsService()
