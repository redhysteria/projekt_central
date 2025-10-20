"""
Serwis Ahrefs dla analizy SEO - tylko prawdziwe dane API.
"""

from typing import Dict, Any, Optional
from urllib.parse import urlparse
from config import Config
from ahrefs_mcp_client import ahrefs_mcp_client


class AhrefsService:
    """
    Serwis do pobierania danych SEO z Ahrefs API.
    NIE UŻYWA mockowanych danych - tylko prawdziwe dane z API.
    """
    
    def __init__(self, config: Optional[Config] = None):
        """
        Inicjalizuje serwis Ahrefs.
        
        Args:
            config: Konfiguracja aplikacji (opcjonalna)
        """
        self.config = config or Config()
        self.client = ahrefs_mcp_client
        
        # Sprawdź czy API jest dostępne
        if not self.config.AHREFS_MCP_API_KEY:
            print("🔴 Ahrefs Service: Brak klucza API - operacje będą kończyć się błędem")
        elif not self.config.AHREFS_MCP_ENABLED:
            print("🔴 Ahrefs Service: MCP wyłączony - operacje będą kończyć się błędem")
        else:
            print("🟢 Ahrefs Service: Używam Ahrefs API")
    
    def _extract_domain(self, domain_input: str) -> str:
        """
        Wyciąga czystą domenę z inputu.
        
        Args:
            domain_input: Domena lub URL
            
        Returns:
            Czysta domena (np. 'example.com')
        """
        try:
            # Jeśli nie zaczyna się od http, dodaj protokół
            if not domain_input.startswith(('http://', 'https://')):
                domain_input = 'https://' + domain_input
            
            parsed = urlparse(domain_input)
            domain = parsed.netloc.lower()
            
            # Usuń www. z początku
            if domain.startswith('www.'):
                domain = domain[4:]
            
            # Usuń port jeśli istnieje
            if ':' in domain:
                domain = domain.split(':')[0]
            
            return domain
        except Exception as e:
            print(f"❌ Błąd podczas ekstraktowania domeny z '{domain_input}': {str(e)}")
            return domain_input.lower().strip()
    
    def get_domain_metrics(self, domain_input: str) -> Dict[str, Any]:
        """
        Pobiera metryki SEO dla domeny z Ahrefs API.
        
        Args:
            domain_input: Domena lub URL do analizy
            
        Returns:
            Słownik z metrykami SEO
            
        Raises:
            Exception: Jeśli API nie jest skonfigurowane lub zwraca błąd
        """
        domain = self._extract_domain(domain_input)
        print(f"🔍 Pobieranie danych SEO z Ahrefs API dla domeny: {domain}")
        
        # Sprawdź czy API jest dostępne
        if not self.config.AHREFS_MCP_API_KEY:
            raise Exception("Brak klucza API Ahrefs. Ustaw AHREFS_MCP_API_KEY w pliku .env")
        
        if not self.config.AHREFS_MCP_ENABLED:
            raise Exception("Ahrefs MCP jest wyłączone. Ustaw AHREFS_MCP_ENABLED=True w pliku .env")
        
        try:
            # Pobierz dane z Ahrefs API przez MCP
            print(f"📡 AhrefsService: Wysyłam zapytanie do Ahrefs API dla {domain}")
            metrics = self.client.get_domain_metrics(domain)
            
            if not metrics:
                raise Exception(f"API Ahrefs nie zwróciło danych dla domeny {domain}")
            
            # Dodaj informację o źródle danych
            metrics['data_source'] = 'ahrefs_api'
            print(f"✅ AhrefsService: Pomyślnie pobrano dane z Ahrefs API dla {domain}")
            
            return metrics
            
        except Exception as e:
            error_msg = f"Błąd podczas pobierania danych z Ahrefs API dla {domain}: {str(e)}"
            print(f"❌ AhrefsService: {error_msg}")
            raise Exception(error_msg)


# Singleton instancji serwisu
ahrefs_service = AhrefsService()
