"""
Serwis do integracji z Jina.ai API dla analizy konkurencji SEO.
"""

import aiohttp
import asyncio
import ssl
import certifi
from typing import List, Optional, Dict, Any
from config import config


class SERPResult:
    """Klasa reprezentująca wynik wyszukiwania."""
    
    def __init__(self, url: str, title: str = "", snippet: str = ""):
        self.url = url
        self.title = title
        self.snippet = snippet


class JinaService:
    """Serwis do komunikacji z Jina.ai API."""
    
    def __init__(self):
        self.api_key = config.JINA_API_KEY
        self.serp_endpoint = config.JINA_SERP_ENDPOINT
        # Tworzenie SSL context z certyfikatami certifi
        self.ssl_context = ssl.create_default_context(cafile=certifi.where())
        
    def _get_headers(self) -> Dict[str, str]:
        """
        Pobierz nagłówki dla żądania SERP.
        
        Returns:
            Słownik nagłówków
        """
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Accept": "application/json",
            "X-Respond-With": "no-content"
        }
    
    async def get_serp_results(self, query: str, language: str = "pl", max_results: int = 10) -> List[SERPResult]:
        """
        Pobierz wyniki SERP dla query.
        
        Args:
            query: Zapytanie wyszukiwania
            language: Język wyszukiwania
            max_results: Maksymalna liczba wyników
            
        Returns:
            Lista wyników SERP
        """
        url = f"{self.serp_endpoint}?q={query}"
        if language:
            url += f"&language={language}"
        
        try:
            connector = aiohttp.TCPConnector(ssl=self.ssl_context)
            async with aiohttp.ClientSession(connector=connector) as session:
                async with session.get(url, headers=self._get_headers(), timeout=30) as response:
                    if response.status == 200:
                        data = await response.json()
                        results = []
                        
                        # Parsuj wyniki z odpowiedzi Jina.ai
                        if "data" in data:
                            for item in data["data"][:max_results]:
                                results.append(SERPResult(
                                    url=item.get("url", ""),
                                    title=item.get("title", ""),
                                    snippet=item.get("description") or item.get("snippet", "")
                                ))
                        
                        print(f"✅ Jina SERP API: Pobrano {len(results)} wyników dla '{query}'")
                        return results
                    else:
                        print(f"❌ Jina SERP API: Błąd {response.status} dla '{query}'")
                        return []
                        
        except asyncio.TimeoutError:
            print(f"⏱️  Timeout podczas pobierania SERP dla: {query[:50]}...")
            return []
        except Exception as e:
            print(f"❌ Błąd podczas pobierania SERP dla '{query}': {str(e)}")
            return []


# Singleton serwisu
jina_service = JinaService()
