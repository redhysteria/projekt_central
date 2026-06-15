"""
Smoke test month_utils. Użycie: python3 tests/test_month_utils.py (exit 1 przy błędzie)
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from month_utils import parse_months_csv, months_to_csv, months_to_label, client_month_label_to_csv


def main() -> int:
    # parse_months_csv: filtr 1-12, sort, dedup, puste
    assert parse_months_csv("2,5,8") == [2, 5, 8]
    assert parse_months_csv("8,2,2,5") == [2, 5, 8]
    assert parse_months_csv("0,13,5") == [5]
    assert parse_months_csv("") == []
    assert parse_months_csv(None) == []

    # months_to_csv
    assert months_to_csv([8, 2, 5, 2]) == "2,5,8"
    assert months_to_csv([]) == ""

    # months_to_label
    assert months_to_label([]) == ""
    assert months_to_label([5]) == "Miesiąc 05"
    assert months_to_label([2, 3, 4, 5, 6, 7]) == "Miesiące 02–07"
    assert months_to_label([2, 5, 8]) == "Miesiące 02, 05, 08"

    # client_month_label_to_csv: stare formaty
    assert client_month_label_to_csv("Miesiąc 05") == "5"
    assert client_month_label_to_csv("Od Miesiąc 02") == "2,3,4,5,6,7,8,9,10,11,12"
    assert client_month_label_to_csv("") == ""
    assert client_month_label_to_csv(None) == ""

    print("OK — month_utils")
    return 0


if __name__ == '__main__':
    sys.exit(main())
