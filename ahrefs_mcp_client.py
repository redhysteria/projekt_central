"""
Klient Ahrefs MCP API do pobierania metryk SEO.
"""

import requests
import time
from typing import Dict, Any, Optional
from config import config


class AhrefsMCPClient:
    """Klient do komunikacji z Ahrefs API v4."""
    
    def __init__(self):
        self.api_key = config.AHREFS_MCP_API_KEY
        self.endpoint = config.AHREFS_MCP_ENDPOINT
        self.rate_limit_delay = 60 / config.AHREFS_RPM if config.AHREFS_RPM > 0 else 1  # seconds between requests
        self.last_request_time = 0
        self.timeout = 30  # seconds
        self.max_retries = 3
        self.retry_delays = [1, 2, 4]  # exponential backoff in seconds
    
    def _get_headers(self) -> Dict[str, str]:
        """
        Pobierz nagłówki dla żądania API.
        
        Returns:
            Słownik nagłówków
        """
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Accept": "application/json",
            "Content-Type": "application/json"
        }
    
    def _rate_limit(self):
        """Zastosuj rate limiting między żądaniami."""
        current_time = time.time()
        time_since_last_request = current_time - self.last_request_time
        
        if time_since_last_request < self.rate_limit_delay:
            sleep_time = self.rate_limit_delay - time_since_last_request
            time.sleep(sleep_time)
        
        self.last_request_time = time.time()
    
    def _make_request(self, endpoint_path: str, params: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Wykonaj żądanie HTTP do Ahrefs API z retry logic.
        
        Args:
            endpoint_path: Ścieżka endpoint (np. "/domain-rating")
            params: Parametry zapytania
            
        Returns:
            Odpowiedź JSON lub None przy błędzie
        """
        url = f"{self.endpoint}{endpoint_path}"
        print(f"🌐 Ahrefs API: Wykonuję żądanie do {url} z parametrami: {params}")
        
        for attempt in range(self.max_retries):
            try:
                print(f"🔄 Ahrefs API: Próba {attempt + 1}/{self.max_retries}")
                
                # Rate limiting
                print(f"⏱️  Ahrefs API: Sprawdzam rate limiting...")
                self._rate_limit()
                print(f"✅ Ahrefs API: Rate limiting OK")
                
                # Wykonaj żądanie
                print(f"📡 Ahrefs API: Wysyłam żądanie HTTP GET...")
                response = requests.get(
                    url,
                    headers=self._get_headers(),
                    params=params,
                    timeout=self.timeout
                )
                print(f"📨 Ahrefs API: Otrzymano odpowiedź - status: {response.status_code}")
                
                # Sprawdź status
                if response.status_code == 200:
                    print(f"✅ Ahrefs API: Sukces! Parsuję odpowiedź JSON...")
                    json_data = response.json()
                    print(f"📊 Ahrefs API: Otrzymano dane: {json_data}")
                    return json_data
                elif response.status_code == 401:
                    print(f"❌ Ahrefs API: Unauthorized (401) - sprawdź klucz API")
                    print(f"🔑 Ahrefs API: Używany klucz: {self.api_key[:10]}...")
                    return None
                elif response.status_code == 429:
                    print(f"⚠️  Ahrefs API: Rate limit exceeded (429) - próba {attempt + 1}/{self.max_retries}")
                    if attempt < self.max_retries - 1:
                        wait_time = self.retry_delays[attempt]
                        print(f"⏳ Ahrefs API: Czekam {wait_time}s przed kolejną próbą...")
                        time.sleep(wait_time)
                        continue
                    return None
                elif response.status_code >= 500:
                    print(f"⚠️  Ahrefs API: Server error ({response.status_code}) - próba {attempt + 1}/{self.max_retries}")
                    if attempt < self.max_retries - 1:
                        wait_time = self.retry_delays[attempt]
                        print(f"⏳ Ahrefs API: Czekam {wait_time}s przed kolejną próbą...")
                        time.sleep(wait_time)
                        continue
                    return None
                else:
                    print(f"❌ Ahrefs API: Error {response.status_code} - {response.text[:200]}")
                    return None
                    
            except requests.exceptions.Timeout:
                print(f"⏱️  Ahrefs API: Timeout - próba {attempt + 1}/{self.max_retries}")
                if attempt < self.max_retries - 1:
                    wait_time = self.retry_delays[attempt]
                    print(f"⏳ Ahrefs API: Czekam {wait_time}s przed kolejną próbą...")
                    time.sleep(wait_time)
                    continue
                print(f"❌ Ahrefs API: Wyczerpano wszystkie próby po timeout")
                return None
            except requests.exceptions.RequestException as e:
                print(f"❌ Ahrefs API: Request error - {str(e)}")
                print(f"🔍 Ahrefs API: Typ błędu: {type(e).__name__}")
                return None
            except Exception as e:
                print(f"💥 Ahrefs API: Nieoczekiwany błąd - {str(e)}")
                print(f"🔍 Ahrefs API: Typ błędu: {type(e).__name__}")
                return None
        
        return None
    
    def get_domain_rating(self, domain: str) -> Optional[float]:
        """
        Pobierz Domain Rating dla domeny.
        
        Args:
            domain: Domena do analizy
            
        Returns:
            Domain Rating (0-100) lub None przy błędzie
        """
        print(f"🔍 Ahrefs API: Pobieram Domain Rating dla {domain}")
        data = self._make_request("/site-explorer/domain-rating", {"target": domain})
        
        if data and "domain_rating" in data:
            rating = float(data["domain_rating"])
            print(f"✅ Ahrefs API: Domain Rating dla {domain}: {rating}")
            return rating
        else:
            print(f"❌ Ahrefs API: Brak danych Domain Rating dla {domain}")
            return None
    
    def get_referring_domains(self, domain: str) -> Optional[int]:
        """
        Pobierz liczbę domen odsyłających.
        
        Args:
            domain: Domena do analizy
            
        Returns:
            Liczba domen odsyłających lub None przy błędzie
        """
        print(f"🔍 Ahrefs API: Pobieram Referring Domains dla {domain}")
        data = self._make_request("/site-explorer/backlinks", {"target": domain, "mode": "domains"})
        
        if data and "referring_domains" in data:
            count = int(data["referring_domains"])
            print(f"✅ Ahrefs API: Referring Domains dla {domain}: {count}")
            return count
        else:
            print(f"❌ Ahrefs API: Brak danych Referring Domains dla {domain}")
            return None
    
    def get_organic_keywords_summary(self, domain: str) -> Optional[Dict[str, Any]]:
        """
        Pobierz podsumowanie słów kluczowych organicznych.
        
        Args:
            domain: Domena do analizy
            
        Returns:
            Słownik z danymi o słowach kluczowych lub None przy błędzie
        """
        print(f"🔍 Ahrefs API: Pobieram organic keywords dla {domain}")
        # Pobierz wszystkie słowa kluczowe
        data = self._make_request("/site-explorer/organic-keywords", {
            "target": domain,
            "mode": "prefix"
        })
        
        if not data or "keywords" not in data:
            print(f"❌ Ahrefs API: Brak danych organic keywords dla {domain}")
            return None
        
        keywords = data["keywords"]
        print(f"📊 Ahrefs API: Otrzymano {len(keywords)} słów kluczowych dla {domain}")
        
        # Zlicz słowa kluczowe według pozycji
        top3 = sum(1 for kw in keywords if kw.get("position", 999) <= 3)
        top10 = sum(1 for kw in keywords if kw.get("position", 999) <= 10)
        top50 = sum(1 for kw in keywords if kw.get("position", 999) <= 50)
        
        # Zlicz unikalne URLe w top 10 i top 50
        urls_top10 = len(set(kw.get("url", "") for kw in keywords if kw.get("position", 999) <= 10 and kw.get("url")))
        urls_top50 = len(set(kw.get("url", "") for kw in keywords if kw.get("position", 999) <= 50 and kw.get("url")))
        
        result = {
            "top3_keywords": top3,
            "top10_keywords": top10,
            "top50_keywords": top50,
            "urls_in_top10": urls_top10,
            "urls_in_top50": urls_top50
        }
        
        print(f"✅ Ahrefs API: Keywords summary dla {domain}: {result}")
        return result
    
    def get_organic_traffic(self, domain: str) -> Optional[int]:
        """
        Pobierz szacowany ruch organiczny.
        
        Args:
            domain: Domena do analizy
            
        Returns:
            Szacowany ruch organiczny lub None przy błędzie
        """
        print(f"🔍 Ahrefs API: Pobieram organic traffic dla {domain}")
        data = self._make_request("/site-explorer/organic-traffic", {"target": domain})
        
        if data and "organic_traffic" in data:
            traffic = int(data["organic_traffic"])
            print(f"✅ Ahrefs API: Organic traffic dla {domain}: {traffic}")
            return traffic
        else:
            print(f"❌ Ahrefs API: Brak danych organic traffic dla {domain}")
            return None
    
    def get_domain_metrics(self, domain: str) -> Optional[Dict[str, Any]]:
        """
        Pobierz wszystkie metryki SEO dla domeny.
        
        Args:
            domain: Domena do analizy
            
        Returns:
            Słownik z wszystkimi metrykami lub None przy błędzie
        """
        print(f"🔍 Ahrefs API: Pobieram metryki dla domeny {domain}")
        
        # Pobierz Domain Rating
        domain_rating = self.get_domain_rating(domain)
        if domain_rating is None:
            print(f"❌ Nie udało się pobrać Domain Rating dla {domain}")
            return None
        
        # Pobierz Referring Domains
        referring_domains = self.get_referring_domains(domain)
        if referring_domains is None:
            print(f"❌ Nie udało się pobrać Referring Domains dla {domain}")
            return None
        
        # Pobierz dane o słowach kluczowych
        keywords_data = self.get_organic_keywords_summary(domain)
        if keywords_data is None:
            print(f"❌ Nie udało się pobrać danych o słowach kluczowych dla {domain}")
            return None
        
        # Pobierz ruch organiczny
        organic_traffic = self.get_organic_traffic(domain)
        if organic_traffic is None:
            print(f"❌ Nie udało się pobrać ruchu organicznego dla {domain}")
            return None
        
        # Połącz wszystkie dane
        metrics = {
            "domain": domain,
            "domain_rating": domain_rating,
            "referring_domains": referring_domains,
            "top3_keywords": keywords_data["top3_keywords"],
            "top10_keywords": keywords_data["top10_keywords"],
            "top50_keywords": keywords_data["top50_keywords"],
            "urls_in_top10": keywords_data["urls_in_top10"],
            "urls_in_top50": keywords_data["urls_in_top50"],
            "estimated_traffic": organic_traffic
        }
        
        print(f"✅ Ahrefs API: Pobrano metryki dla {domain}")
        return metrics


# Singleton instancji klienta
ahrefs_mcp_client = AhrefsMCPClient()

