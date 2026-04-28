"""
Smoke test integracji Senuto API.

Użycie:
    python3 test_senuto.py [domena]

Domyślnie odpala dla 'senuto.com'. Zwraca exit code 1 przy błędzie.
"""

import sys
from pprint import pprint

from config import config
from senuto_service import senuto_service, SenutoServiceError


def main() -> int:
    domain = sys.argv[1] if len(sys.argv) > 1 else "senuto.com"

    print("=" * 60)
    print("Senuto API – smoke test")
    print("=" * 60)
    print(f"Endpoint:    {config.SENUTO_API_BASE_URL}")
    print(f"Country ID:  {config.SENUTO_COUNTRY_ID}")
    print(f"Fetch mode:  {config.SENUTO_FETCH_MODE}")
    print(f"Token set:   {'TAK' if config.SENUTO_API_TOKEN else 'NIE'}")
    print(f"Domain:      {domain}")
    print("-" * 60)

    if not config.SENUTO_API_TOKEN:
        print("❌ Brak SENUTO_API_TOKEN w .env. Uzupełnij i uruchom ponownie.")
        return 1

    try:
        metrics = senuto_service.get_domain_metrics(domain)
    except SenutoServiceError as exc:
        print(f"❌ Senuto error: {exc}")
        return 1
    except Exception as exc:
        print(f"❌ Nieoczekiwany błąd: {type(exc).__name__}: {exc}")
        return 1

    print("✅ Dane Senuto:")
    pprint(metrics, sort_dicts=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
