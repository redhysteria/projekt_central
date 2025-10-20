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
    print(f"🔧 Konfiguracja:")
    print(f"   - AHREFS_MCP_ENABLED: {config.AHREFS_MCP_ENABLED}")
    print(f"   - AHREFS_MCP_API_KEY: {'***' if config.AHREFS_MCP_API_KEY else 'BRAK'}")
    print(f"   - AHREFS_FALLBACK_TO_MOCK: {config.AHREFS_FALLBACK_TO_MOCK}")
    print(f"   - AHREFS_RPM: {config.AHREFS_RPM}")
    print()
    
    # Test domen
    test_domains = ["skupszop.pl", "tezeusz.pl"]
    
    for domain in test_domains:
        print(f"🔍 Testuję domenę: {domain}")
        print("-" * 50)
        
        try:
            metrics = ahrefs_service.get_domain_metrics(domain)
            
            if metrics:
                print(f"✅ Sukces! Otrzymano dane dla {domain}:")
                for key, value in metrics.items():
                    print(f"   {key}: {value}")
            else:
                print(f"❌ Brak danych dla {domain}")
                
        except Exception as e:
            print(f"💥 Błąd podczas testowania {domain}: {str(e)}")
            print(f"🔍 Typ błędu: {type(e).__name__}")
        
        print()

if __name__ == "__main__":
    test_ahrefs_service()
