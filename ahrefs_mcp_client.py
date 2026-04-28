"""
Klient Ahrefs MCP do pobierania metryk SEO.
UWAGA: Klucz MCP nie działa z REST API - używamy mockowanych danych.
"""

import random
from typing import Dict, Any, Optional
from config import config


class AhrefsMCPClient:
    """Klient do komunikacji z Ahrefs - mockowane dane."""
    
    def __init__(self):
        self.api_key = config.AHREFS_API_KEY
        # Mock działa jako fallback gdy AHREFS_FALLBACK_TO_MOCK=True i API niedostępne
    
    def _generate_mock_data(self, domain: str) -> Dict[str, Any]:
        """
        Generuj mockowane dane SEO dla domeny.
        Używa seeda na podstawie domeny aby dane były deterministyczne.
        """
        # Seed oparty na domenie - te same dane dla tej samej domeny
        random.seed(hash(domain))
        
        # Generuj metryki
        dr = round(random.uniform(20, 85), 1)
        ref_domains = random.randint(100, 8000)
        
        # Keywords
        total_kw = random.randint(500, 5000)
        top3 = int(total_kw * random.uniform(0.05, 0.15))
        top10 = int(total_kw * random.uniform(0.15, 0.30))
        top50 = int(total_kw * random.uniform(0.35, 0.55))
        
        # URLs
        urls_top10 = int(top10 * random.uniform(0.3, 0.7))
        urls_top50 = int(top50 * random.uniform(0.4, 0.8))
        
        # Traffic
        traffic = int(top10 * random.uniform(10, 50))
        
        return {
            "domain": domain,
            "domain_rating": dr,
            "referring_domains": ref_domains,
            "top3_keywords": top3,
            "top10_keywords": top10,
            "top50_keywords": top50,
            "urls_in_top10": urls_top10,
            "urls_in_top50": urls_top50,
            "estimated_traffic": traffic
        }
    
    def get_domain_rating(self, domain: str) -> Optional[float]:
        """Pobierz Domain Rating dla domeny."""
        print(f"🎭 Mock: Pobieram Domain Rating dla {domain}")
        data = self._generate_mock_data(domain)
        rating = data["domain_rating"]
        print(f"✅ Mock: Domain Rating dla {domain}: {rating}")
        return rating
    
    def get_referring_domains(self, domain: str) -> Optional[int]:
        """Pobierz liczbę domen odsyłających."""
        print(f"🎭 Mock: Pobieram Referring Domains dla {domain}")
        data = self._generate_mock_data(domain)
        count = data["referring_domains"]
        print(f"✅ Mock: Referring Domains dla {domain}: {count}")
        return count
    
    def get_organic_keywords_summary(self, domain: str) -> Optional[Dict[str, Any]]:
        """Pobierz podsumowanie słów kluczowych organicznych."""
        print(f"🎭 Mock: Pobieram organic keywords dla {domain}")
        data = self._generate_mock_data(domain)
        
        result = {
            "top3_keywords": data["top3_keywords"],
            "top10_keywords": data["top10_keywords"],
            "top50_keywords": data["top50_keywords"],
            "urls_in_top10": data["urls_in_top10"],
            "urls_in_top50": data["urls_in_top50"]
        }
        
        print(f"✅ Mock: Keywords summary dla {domain}: {result}")
        return result
    
    def get_organic_traffic(self, domain: str) -> Optional[int]:
        """Pobierz szacowany ruch organiczny."""
        print(f"🎭 Mock: Pobieram organic traffic dla {domain}")
        data = self._generate_mock_data(domain)
        traffic = data["estimated_traffic"]
        print(f"✅ Mock: Organic traffic dla {domain}: {traffic}")
        return traffic
    
    def get_domain_metrics(self, domain: str) -> Optional[Dict[str, Any]]:
        """Pobierz wszystkie metryki SEO dla domeny."""
        print(f"🎭 Mock: Pobieram metryki dla domeny {domain}")
        
        metrics = self._generate_mock_data(domain)
        metrics['data_source'] = 'ahrefs_mcp_mock'
        
        print(f"✅ Mock: Pobrano metryki dla {domain}")
        return metrics


# Singleton instancji klienta
ahrefs_mcp_client = AhrefsMCPClient()
