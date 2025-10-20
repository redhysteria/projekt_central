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
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    AHREFS_MCP_API_KEY: str = os.getenv("AHREFS_MCP_API_KEY", "")
    
    # API Endpoints
    JINA_SERP_ENDPOINT: str = "https://s.jina.ai/"
    AHREFS_MCP_ENDPOINT: str = "https://api.ahrefs.com/mcp/mcp"
    
    # Ahrefs MCP Settings
    AHREFS_MCP_ENABLED: bool = os.getenv("AHREFS_MCP_ENABLED", "True").lower() == "true"
    AHREFS_FALLBACK_TO_MOCK: bool = os.getenv("AHREFS_FALLBACK_TO_MOCK", "False").lower() == "true"
    
    # Rate Limits
    JINA_RPM: int = int(os.getenv("JINA_RPM", "100"))
    OPENAI_RPM: int = int(os.getenv("OPENAI_RPM", "500"))
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
        if not cls.OPENAI_API_KEY:
            print("⚠️  UWAGA: Brak klucza API OpenAI")
            ok = False
        if cls.AHREFS_MCP_ENABLED and not cls.AHREFS_MCP_API_KEY:
            print("⚠️  UWAGA: Ahrefs MCP jest włączony, ale brak klucza API")
            print("   Aplikacja użyje mockowanych danych zamiast prawdziwych danych z Ahrefs")
        return ok


# Singleton instancji konfiguracji
config = Config()
