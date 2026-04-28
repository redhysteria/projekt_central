"""
Logika biznesowa dla analizy SEO domen.
"""

import csv
import os
from typing import List, Dict, Any, Tuple

from config import config
from models import SeoAnalysis, db
from ahrefs_service import ahrefs_service
from senuto_service import senuto_service, SenutoServiceError


class SeoAnalysisLogic:
    """Klasa zawierająca logikę analizy SEO domen."""

    @staticmethod
    def _fetch_combined_metrics(domain: str) -> Dict[str, Any]:
        """
        Pobiera metryki SEO łącząc dwa źródła:
        - Senuto: TOP3/TOP10/TOP50, urls_in_top10/50, estimated_traffic.
        - Ahrefs: domain_rating, referring_domains.

        Pola brakujące w jednym ze źródeł zerujemy. data_source przyjmuje:
        'senuto+ahrefs', 'senuto', 'ahrefs_api', 'mock' lub 'unknown'.
        """
        senuto_payload: Dict[str, Any] = {}
        ahrefs_payload: Dict[str, Any] = {}
        senuto_ok = False
        ahrefs_ok = False

        if config.SENUTO_ENABLED:
            try:
                senuto_payload = senuto_service.get_domain_metrics(domain)
                senuto_ok = True
            except SenutoServiceError as exc:
                print(f"⚠️  Senuto nie zwróciło danych dla {domain}: {exc}")
            except Exception as exc:
                print(f"⚠️  Nieoczekiwany błąd Senuto dla {domain}: {exc}")

        if config.AHREFS_ENABLED:
            try:
                ahrefs_payload = ahrefs_service.get_domain_metrics(domain)
                ahrefs_ok = True
            except Exception as exc:
                print(f"⚠️  Ahrefs nie zwróciło DR/Domains/Backlinks dla {domain}: {exc}")

        if not senuto_ok and not ahrefs_ok:
            raise RuntimeError(
                f"Brak danych dla {domain} — Senuto i Ahrefs niedostępne. "
                "Sprawdź SENUTO_API_TOKEN i AHREFS_MCP_API_KEY w .env."
            )

        # Domena: preferuj wersję znormalizowaną przez Senuto, fallback Ahrefs
        domain_value = senuto_payload.get("domain") or ahrefs_payload.get("domain") or domain

        if senuto_ok and ahrefs_ok:
            data_source = "senuto+ahrefs"
        elif senuto_ok:
            data_source = "senuto"
        else:
            data_source = ahrefs_payload.get("data_source", "ahrefs_api")

        return {
            "domain": domain_value,
            "domain_rating": ahrefs_payload.get("domain_rating", 0),
            "referring_domains": ahrefs_payload.get("referring_domains", 0),
            "backlinks": ahrefs_payload.get("backlinks", 0),
            "top3_keywords": senuto_payload.get("top3_keywords", 0),
            "top10_keywords": senuto_payload.get("top10_keywords", 0),
            "top50_keywords": senuto_payload.get("top50_keywords", 0),
            "urls_in_top10": senuto_payload.get("urls_in_top10", 0),
            "urls_in_top50": senuto_payload.get("urls_in_top50", 0),
            "estimated_traffic": senuto_payload.get("estimated_traffic", 0),
            "data_source": data_source,
        }

    @staticmethod
    def parse_domains_input(domains_text: str) -> List[str]:
        """
        Parsuje tekst z domenami.
        
        Args:
            domains_text: Tekst zawierający domeny (jedna domena na linię)
            
        Returns:
            Lista domen
        """
        # Podziel po nowych liniach
        lines = domains_text.split('\n')
        
        domains = []
        for line in lines:
            domain = line.strip()
            if domain:  # Tylko niepuste linie
                domains.append(domain)
        
        # Usuń duplikaty zachowując kolejność
        seen = set()
        unique_domains = []
        for domain in domains:
            if domain not in seen:
                seen.add(domain)
                unique_domains.append(domain)
        
        return unique_domains
    
    @staticmethod
    def validate_domains(domains: List[str]) -> Tuple[bool, str]:
        """
        Waliduje listę domen.
        
        Args:
            domains: Lista domen do walidacji
            
        Returns:
            Tuple (is_valid, error_message)
        """
        if not domains:
            return False, "Lista domen nie może być pusta"
        
        if len(domains) > 50:
            return False, "Maksymalna liczba domen to 50"
        
        # Sprawdź czy domeny wyglądają na prawidłowe
        for domain in domains:
            if len(domain) < 3:
                return False, f"Domena '{domain}' jest za krótka"
            if ' ' in domain:
                return False, f"Domena '{domain}' zawiera spacje"
        
        return True, ""
    
    @staticmethod
    def analyze_domains(quote_id: int, domains: List[str]) -> List[Dict[str, Any]]:
        """
        Analizuje domeny i zapisuje wyniki do bazy danych.
        
        Args:
            quote_id: ID wyceny
            domains: Lista domen do analizy
            
        Returns:
            Lista słowników z wynikami analizy
        """
        print(f"🔍 SeoAnalysisLogic: Rozpoczynam analizę {len(domains)} domen dla wyceny {quote_id}")
        print(f"📋 SeoAnalysisLogic: Domeny do analizy: {domains}")
        
        # Usuń poprzednie wyniki dla tej wyceny
        deleted_count = SeoAnalysis.query.filter_by(quote_id=quote_id).count()
        SeoAnalysis.query.filter_by(quote_id=quote_id).delete()
        print(f"🗑️ SeoAnalysisLogic: Usunięto {deleted_count} poprzednich wyników")
        
        results = []
        
        for i, domain in enumerate(domains, 1):
            print(f"📊 SeoAnalysisLogic: [{i}/{len(domains)}] Analizuję domenę: {domain}")

            try:
                seo_data = SeoAnalysisLogic._fetch_combined_metrics(domain)
                print(f"📊 SeoAnalysisLogic: Otrzymano dane SEO dla {domain}: {seo_data}")

                # Oblicz wartości średnie
                avg_kw_per_url = 0
                if seo_data['urls_in_top10'] > 0:
                    avg_kw_per_url = seo_data['top10_keywords'] / seo_data['urls_in_top10']

                avg_traffic_per_kw = 0
                if seo_data['top10_keywords'] > 0:
                    avg_traffic_per_kw = seo_data['estimated_traffic'] / seo_data['top10_keywords']

                seo_analysis = SeoAnalysis(
                    quote_id=quote_id,
                    domain=seo_data['domain'],
                    domain_rating=seo_data['domain_rating'],
                    referring_domains=seo_data['referring_domains'],
                    backlinks=seo_data.get('backlinks', 0),
                    top3_keywords=seo_data['top3_keywords'],
                    top10_keywords=seo_data['top10_keywords'],
                    top50_keywords=seo_data['top50_keywords'],
                    urls_in_top10=seo_data['urls_in_top10'],
                    urls_in_top50=seo_data['urls_in_top50'],
                    estimated_traffic=seo_data['estimated_traffic'],
                    avg_kw_per_url=round(avg_kw_per_url, 2),
                    avg_traffic_per_kw=round(avg_traffic_per_kw, 2),
                    data_source=seo_data.get('data_source', 'unknown')
                )

                db.session.add(seo_analysis)
                db.session.flush()
                results.append(seo_analysis.to_dict())

                print(
                    f"✅ SeoAnalysisLogic: Zapisano {domain} "
                    f"(źródło={seo_data.get('data_source')}, DR={seo_data['domain_rating']}, "
                    f"top10={seo_data['top10_keywords']})"
                )

            except Exception as e:
                print(f"❌ SeoAnalysisLogic: Błąd podczas analizy domeny '{domain}': {str(e)}")
                print(f"🔍 SeoAnalysisLogic: Typ błędu: {type(e).__name__}")
                print(f"📋 SeoAnalysisLogic: Kontynuuję z następną domeną...")
                continue
        
        # Zapisz wszystkie zmiany
        print(f"💾 SeoAnalysisLogic: Zapisuję wszystkie zmiany do bazy danych...")
        db.session.commit()
        print(f"✅ SeoAnalysisLogic: Zapisano {len(results)} wyników analizy SEO do bazy danych")
        print(f"🎉 SeoAnalysisLogic: Analiza zakończona pomyślnie!")
        
        return results
    
    @staticmethod
    def calculate_averages(seo_results: List[Dict[str, Any]]) -> Dict[str, float]:
        """
        Oblicza średnie dla wszystkich kolumn.
        
        Args:
            seo_results: Lista wyników analizy SEO
            
        Returns:
            Słownik ze średnimi wartościami
        """
        if not seo_results:
            return {}
        
        numeric_fields = [
            'domain_rating', 'referring_domains', 'backlinks',
            'top3_keywords', 'top10_keywords', 'top50_keywords',
            'urls_in_top10', 'urls_in_top50', 'estimated_traffic',
            'avg_kw_per_url', 'avg_traffic_per_kw',
        ]

        averages = {}
        for field in numeric_fields:
            values = [result.get(field) for result in seo_results if result.get(field) is not None]
            if values:
                averages[field] = round(sum(values) / len(values), 2)
            else:
                averages[field] = 0

        return averages
    
    @staticmethod
    def export_to_csv(quote_id: int, filepath: str) -> bool:
        """
        Eksportuje wyniki analizy SEO do pliku CSV.
        
        Args:
            quote_id: ID wyceny
            filepath: Ścieżka do pliku CSV
            
        Returns:
            True jeśli eksport się powiódł, False w przeciwnym razie
        """
        try:
            # Pobierz wyniki z bazy danych
            seo_results = SeoAnalysis.query.filter_by(quote_id=quote_id).all()
            
            if not seo_results:
                print(f"❌ Brak wyników analizy SEO dla wyceny {quote_id}")
                return False
            
            # Konwertuj do słowników
            results_data = [result.to_dict() for result in seo_results]
            
            # Oblicz średnie
            averages = SeoAnalysisLogic.calculate_averages(results_data)
            
            # Utwórz katalog jeśli nie istnieje
            os.makedirs(os.path.dirname(filepath), exist_ok=True)
            
            # Zapisz do CSV
            with open(filepath, 'w', newline='', encoding='utf-8-sig') as csvfile:
                # Nagłówki kolumn (zgodnie z wymaganiami)
                fieldnames = [
                    '#', 'Domena', 'Domain Rating', 'Domains', 'Backlinks',
                    'TOP 3', 'TOP 10', 'Liczba URL w TOP 10', 'Liczba URL w TOP 50',
                    'Szacowany ruch', 'średnio słów kl. na URL', 'średnio ruchu/słowo'
                ]

                writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
                writer.writeheader()

                for i, result in enumerate(results_data, 1):
                    writer.writerow({
                        '#': i,
                        'Domena': result['domain'],
                        'Domain Rating': result['domain_rating'],
                        'Domains': result['referring_domains'],
                        'Backlinks': result.get('backlinks', 0),
                        'TOP 3': result['top3_keywords'],
                        'TOP 10': result['top10_keywords'],
                        'Liczba URL w TOP 10': result['urls_in_top10'],
                        'Liczba URL w TOP 50': result['urls_in_top50'],
                        'Szacowany ruch': result['estimated_traffic'],
                        'średnio słów kl. na URL': result['avg_kw_per_url'],
                        'średnio ruchu/słowo': result['avg_traffic_per_kw']
                    })

                writer.writerow({
                    '#': 'ŚREDNIO',
                    'Domena': '',
                    'Domain Rating': averages.get('domain_rating', 0),
                    'Domains': averages.get('referring_domains', 0),
                    'Backlinks': averages.get('backlinks', 0),
                    'TOP 3': averages.get('top3_keywords', 0),
                    'TOP 10': averages.get('top10_keywords', 0),
                    'Liczba URL w TOP 10': averages.get('urls_in_top10', 0),
                    'Liczba URL w TOP 50': averages.get('urls_in_top50', 0),
                    'Szacowany ruch': averages.get('estimated_traffic', 0),
                    'średnio słów kl. na URL': averages.get('avg_kw_per_url', 0),
                    'średnio ruchu/słowo': averages.get('avg_traffic_per_kw', 0)
                })
            
            print(f"✅ Eksport CSV zakończony pomyślnie: {filepath}")
            print(f"📊 Wyeksportowano {len(results_data)} domen + wiersz średnich")
            
            return True
            
        except Exception as e:
            print(f"❌ Błąd podczas eksportu CSV: {str(e)}")
            return False


# Singleton instancji logiki
seo_analysis_logic = SeoAnalysisLogic()
