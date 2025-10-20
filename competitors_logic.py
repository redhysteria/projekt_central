"""
Logika biznesowa dla analizy konkurencji SEO.
"""

import asyncio
from urllib.parse import urlparse
from typing import List, Dict, Tuple
from collections import Counter
from jina_service import jina_service


class CompetitorsLogic:
    """Klasa zawierająca logikę analizy konkurencji SEO."""
    
    @staticmethod
    def extract_domain(url: str) -> str:
        """
        Wyciąga czystą domenę z URL-a.
        
        Args:
            url: URL do przetworzenia
            
        Returns:
            Czysta domena (np. 'example.com')
        """
        try:
            parsed = urlparse(url)
            domain = parsed.netloc.lower()
            
            # Usuń www. z początku
            if domain.startswith('www.'):
                domain = domain[4:]
            
            # Usuń port jeśli istnieje
            if ':' in domain:
                domain = domain.split(':')[0]
            
            return domain
        except Exception as e:
            print(f"❌ Błąd podczas ekstraktowania domeny z URL '{url}': {str(e)}")
            return ""
    
    @staticmethod
    async def analyze_keywords(keywords: List[str]) -> Dict[str, int]:
        """
        Analizuje słowa kluczowe i zwraca domeny z liczbą wystąpień.
        
        Args:
            keywords: Lista słów kluczowych do analizy
            
        Returns:
            Słownik {domena: liczba_wystąpień} posortowany malejąco
            
        Raises:
            Exception: Jeśli API Jina nie zwraca wyników
        """
        print(f"🔍 Rozpoczynam analizę {len(keywords)} słów kluczowych...")
        
        all_domains = []
        failed_keywords = []
        
        # Dla każdego słowa kluczowego pobierz top 10 wyników
        for i, keyword in enumerate(keywords, 1):
            print(f"📊 [{i}/{len(keywords)}] Analizuję: '{keyword}'")
            
            try:
                # Pobierz wyniki SERP z JINA AI
                serp_results = await jina_service.get_serp_results(keyword, max_results=10)
                
                # Jeśli brak wyników z API - zgłoś błąd
                if not serp_results:
                    error_msg = f"❌ API JINA nie zwróciło wyników dla '{keyword}'"
                    print(error_msg)
                    failed_keywords.append(keyword)
                    continue
                
                # Ekstraktuj domeny z URL-i
                domains_found = 0
                for result in serp_results:
                    if result.url:
                        domain = CompetitorsLogic.extract_domain(result.url)
                        if domain:  # Tylko jeśli udało się wyciągnąć domenę
                            all_domains.append(domain)
                            domains_found += 1
                
                print(f"   ✅ Znaleziono {domains_found} domen dla '{keyword}'")
                
                # Krótka pauza między zapytaniami (rate limiting)
                await asyncio.sleep(0.1)
                
            except Exception as e:
                print(f"❌ Błąd podczas analizy słowa kluczowego '{keyword}': {str(e)}")
                failed_keywords.append(keyword)
                continue
        
        # Jeśli wszystkie słowa kluczowe zawiodły, rzuć wyjątek
        if len(failed_keywords) == len(keywords):
            raise Exception(f"API Jina AI nie zwróciło wyników dla żadnego słowa kluczowego. Sprawdź konfigurację API lub stan usługi.")
        
        # Jeśli część słów kluczowych zawiodła, dodaj ostrzeżenie
        if failed_keywords:
            print(f"⚠️  Nie udało się pobrać wyników dla {len(failed_keywords)} słów: {', '.join(failed_keywords[:5])}{'...' if len(failed_keywords) > 5 else ''}")
        
        # Zlicz wystąpienia każdej domeny
        domain_counts = Counter(all_domains)
        
        # Sortuj malejąco po liczbie wystąpień
        sorted_domains = dict(sorted(domain_counts.items(), key=lambda x: x[1], reverse=True))
        
        print(f"✅ Analiza zakończona. Znaleziono {len(sorted_domains)} unikalnych domen.")
        print(f"📈 Top 5 domen: {list(sorted_domains.items())[:5]}")
        
        return sorted_domains
    
    
    @staticmethod
    def validate_keywords(keywords: List[str]) -> Tuple[bool, str]:
        """
        Waliduje listę słów kluczowych.
        
        Args:
            keywords: Lista słów kluczowych do walidacji
            
        Returns:
            Tuple (is_valid, error_message)
        """
        if not keywords:
            return False, "Lista słów kluczowych nie może być pusta"
        
        # Usuń puste stringi i białe znaki
        cleaned_keywords = [kw.strip() for kw in keywords if kw.strip()]
        
        if len(cleaned_keywords) < 5:
            return False, "Minimalna liczba słów kluczowych to 5"
        
        if len(cleaned_keywords) > 500:
            return False, "Maksymalna liczba słów kluczowych to 500"
        
        return True, ""
    
    @staticmethod
    def parse_keywords_input(keywords_text: str) -> List[str]:
        """
        Parsuje tekst z słowami kluczowymi.
        
        Args:
            keywords_text: Tekst zawierający słowa kluczowe (oddzielone nowymi liniami lub przecinkami)
            
        Returns:
            Lista słów kluczowych
        """
        # Podziel po nowych liniach i przecinkach
        keywords = []
        
        # Najpierw podziel po nowych liniach
        lines = keywords_text.split('\n')
        
        for line in lines:
            # Następnie podziel każdą linię po przecinkach
            line_keywords = [kw.strip() for kw in line.split(',') if kw.strip()]
            keywords.extend(line_keywords)
        
        # Usuń duplikaty zachowując kolejność
        seen = set()
        unique_keywords = []
        for kw in keywords:
            if kw not in seen:
                seen.add(kw)
                unique_keywords.append(kw)
        
        return unique_keywords


# Singleton instancji logiki
competitors_logic = CompetitorsLogic()
