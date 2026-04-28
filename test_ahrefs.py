#!/usr/bin/env python3
"""
Skrypt testowy do sprawdzenia pobierania danych z Ahrefs.
"""

import sys
import os

# Dodaj ścieżkę do modułów
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from ahrefs_service import ahrefs_service
from config import config

def test_ahrefs_service():
    """Test pobierania danych z Ahrefs."""
    print("🧪 Test Ahrefs Service")
    print("=" * 70)
    print(f"🔧 Konfiguracja:")
    print(f"   - AHREFS_ENABLED:           {config.AHREFS_ENABLED}")
    print(f"   - AHREFS_API_KEY:           {'***' + config.AHREFS_API_KEY[-8:] if config.AHREFS_API_KEY and len(config.AHREFS_API_KEY) > 8 else 'BRAK'}")
    print(f"   - AHREFS_API_BASE_URL:      {config.AHREFS_API_BASE_URL}")
    print(f"   - AHREFS_FALLBACK_TO_MOCK:  {config.AHREFS_FALLBACK_TO_MOCK}")
    print(f"   - AHREFS_RPM:               {config.AHREFS_RPM}")
    print("=" * 70)
    print()

    if not config.AHREFS_API_KEY:
        print("❌ BŁĄD: Brak klucza API Ahrefs!")
        print("📝 Aby uruchomić testy: ustaw AHREFS_API_KEY w .env (patrz AHREFS_SETUP.md)")
        return

    if not config.AHREFS_ENABLED:
        print("⚠️  UWAGA: Ahrefs jest wyłączony (AHREFS_ENABLED=False)")
        return

    test_domains = sys.argv[1:] if len(sys.argv) > 1 else ["senuto.com", "wikipedia.org"]
    
    print(f"🎯 Testuję {len(test_domains)} domen...")
    print()
    
    success_count = 0
    error_count = 0
    
    for i, domain in enumerate(test_domains, 1):
        print(f"📊 Test {i}/{len(test_domains)}: {domain}")
        print("-" * 70)
        
        try:
            metrics = ahrefs_service.get_domain_metrics(domain)
            
            if metrics:
                print(f"✅ Sukces! Otrzymano dane dla {domain}:")
                print(f"   Domain: {metrics.get('domain')}")
                print(f"   Domain Rating: {metrics.get('domain_rating')}")
                print(f"   Referring Domains: {metrics.get('referring_domains')}")
                print(f"   Backlinks: {metrics.get('backlinks')}")
                print(f"   Keywords TOP 3: {metrics.get('top3_keywords')}")
                print(f"   Keywords TOP 10: {metrics.get('top10_keywords')}")
                print(f"   Keywords TOP 50: {metrics.get('top50_keywords')}")
                print(f"   URLs in TOP 10: {metrics.get('urls_in_top10')}")
                print(f"   URLs in TOP 50: {metrics.get('urls_in_top50')}")
                print(f"   Estimated Traffic: {metrics.get('estimated_traffic')}")
                print(f"   Data Source: {metrics.get('data_source')}")
                success_count += 1
            else:
                print(f"❌ Brak danych dla {domain}")
                error_count += 1
                
        except Exception as e:
            print(f"💥 Błąd podczas testowania {domain}: {str(e)}")
            print(f"🔍 Typ błędu: {type(e).__name__}")
            error_count += 1
        
        print()
    
    # Podsumowanie
    print("=" * 70)
    print(f"📊 Podsumowanie testów:")
    print(f"   ✅ Sukces: {success_count}/{len(test_domains)}")
    print(f"   ❌ Błędy: {error_count}/{len(test_domains)}")
    print("=" * 70)

if __name__ == "__main__":
    test_ahrefs_service()
