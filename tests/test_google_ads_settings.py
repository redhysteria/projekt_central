"""
Smoke test serializacji GoogleAdsSettings.to_dict() — pola kampanii produktowej.
Użycie: python3 tests/test_google_ads_settings.py  (exit 1 przy błędzie)
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models import GoogleAdsSettings


def main() -> int:
    s = GoogleAdsSettings(quote_id=1)
    s.product_enabled = True
    s.product_target_revenue = 40000.0
    s.product_target_roas = 4.0
    s.product_cpc = 2.0
    s.product_cvr = 2.5

    d = s.to_dict()
    for key in ('product_enabled', 'product_target_revenue', 'product_target_roas',
                'product_cpc', 'product_cvr'):
        assert key in d, f"Brak klucza {key} w to_dict()"

    assert d['product_enabled'] is True, d['product_enabled']
    assert d['product_target_revenue'] == 40000.0
    assert d['product_target_roas'] == 4.0
    assert d['product_cpc'] == 2.0
    assert d['product_cvr'] == 2.5
    print("OK — to_dict zawiera pola produktowe")
    return 0


if __name__ == '__main__':
    sys.exit(main())
