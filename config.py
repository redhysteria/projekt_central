"""
Konfiguracja aplikacji dla analizy konkurencji SEO.
"""

import os
from dotenv import load_dotenv

# Wczytaj zmienne środowiskowe
load_dotenv()


class Config:
    """Klasa konfiguracji aplikacji."""
    
    # API Keys
    JINA_API_KEY: str = os.getenv("JINA_API_KEY", "")
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    AHREFS_API_KEY: str = os.getenv("AHREFS_API_KEY", "") or os.getenv("AHREFS_MCP_API_KEY", "")
    SENUTO_API_TOKEN: str = os.getenv("SENUTO_API_TOKEN", "")

    # API Endpoints
    JINA_SERP_ENDPOINT: str = "https://s.jina.ai/"
    AHREFS_API_BASE_URL: str = os.getenv("AHREFS_API_BASE_URL", "https://api.ahrefs.com")
    SENUTO_API_BASE_URL: str = os.getenv("SENUTO_API_BASE_URL", "https://api.senuto.com")

    # Ahrefs Settings
    AHREFS_ENABLED: bool = (
        os.getenv("AHREFS_ENABLED", os.getenv("AHREFS_MCP_ENABLED", "True")).lower() == "true"
    )
    AHREFS_FALLBACK_TO_MOCK: bool = os.getenv("AHREFS_FALLBACK_TO_MOCK", "False").lower() == "true"
    AHREFS_TIMEOUT: int = int(os.getenv("AHREFS_TIMEOUT", "30"))

    # Senuto Settings
    SENUTO_ENABLED: bool = os.getenv("SENUTO_ENABLED", "True").lower() == "true"
    SENUTO_COUNTRY_ID: int = int(os.getenv("SENUTO_COUNTRY_ID", "200"))  # 1 = Poland DB 1.0, 200 = Poland DB 2.0
    SENUTO_FETCH_MODE: str = os.getenv("SENUTO_FETCH_MODE", "topLevelDomain")  # topLevelDomain | subdomain
    SENUTO_TOP10_MAX_PAGES: int = int(os.getenv("SENUTO_TOP10_MAX_PAGES", "50"))  # cap paginacji positions/getData
    SENUTO_TIMEOUT: int = int(os.getenv("SENUTO_TIMEOUT", "30"))

    # Rate Limits
    JINA_RPM: int = int(os.getenv("JINA_RPM", "100"))
    GEMINI_RPM: int = int(os.getenv("GEMINI_RPM", "60"))
    AHREFS_RPM: int = int(os.getenv("AHREFS_RPM", "60"))  # 60 requests per minute

    # Application Settings
    DEBUG: bool = os.getenv("DEBUG", "False").lower() == "true"
    
    @classmethod
    def validate(cls) -> bool:
        """Walidacja konfiguracji."""
        ok = True
        if not cls.JINA_API_KEY:
            print("⚠️  UWAGA: Brak klucza API Jina.ai")
            ok = False
        if not cls.GEMINI_API_KEY:
            print("⚠️  UWAGA: Brak klucza API Gemini")
            ok = False
        if cls.AHREFS_ENABLED and not cls.AHREFS_API_KEY:
            print("⚠️  UWAGA: Ahrefs jest włączony, ale brak AHREFS_API_KEY w .env")
            if cls.AHREFS_FALLBACK_TO_MOCK:
                print("   Aplikacja użyje mockowanych danych (AHREFS_FALLBACK_TO_MOCK=True)")
            else:
                ok = False
        if cls.SENUTO_ENABLED and not cls.SENUTO_API_TOKEN:
            print("⚠️  UWAGA: Senuto jest włączone, ale brak SENUTO_API_TOKEN w .env")
            print("   Senuto zwróci błąd przy próbie pobrania danych — zobacz SENUTO_SETUP.md")
            ok = False
        return ok


# Singleton instancji konfiguracji
config = Config()
