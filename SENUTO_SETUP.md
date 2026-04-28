# Senuto API – konfiguracja

W aplikacji Senuto API jest źródłem dla pól:

| Pole w wycenie SEO       | Źródło Senuto                                                |
|--------------------------|--------------------------------------------------------------|
| TOP 3 (słowa kluczowe)   | `dashboard/getDomainStatistics` → `statistics.top3`          |
| TOP 10                   | `dashboard/getDomainStatistics` → `statistics.top10`         |
| TOP 50                   | `dashboard/getDomainStatistics` → `statistics.top50`         |
| Szacowany ruch           | `dashboard/getDomainStatistics` → `statistics.visibility`    |
| Liczba URL w TOP 50      | `sections/getUrls` → `pagination.count`                      |
| Liczba URL w TOP 10      | `positions/getData` (filtr `position.current ≤ 10`) + dedup  |

> Pola **Domain Rating** i **Referring Domains** wciąż pobierane są z Ahrefs. Senuto ich nie zwraca.

## 1. Wygenerowanie tokenu

Senuto wymaga tokenu Bearer ważnego **30 dni**. Token generujesz przez:

```bash
curl -X POST https://api.senuto.com/api/users/token \
  -H "Content-Type: application/json" \
  -d '{"email":"twoj_email","password":"twoje_haslo"}'
```

> ⚠️ Senuto wymaga pola `email` (nie `username`). Pole `username` zwraca `418 / Invalid username or password`.

W odpowiedzi:

```json
{
  "success": true,
  "data": { "token": "eyJhbGciOi..." }
}
```

Skopiuj wartość `token` i wklej do `.env` jako `SENUTO_API_TOKEN`.

> Token wygasa po 30 dniach – w przypadku błędu **401** wygeneruj nowy.

## 2. Zmienne w `.env`

```
SENUTO_API_TOKEN=tu_wklej_token
SENUTO_ENABLED=True
SENUTO_COUNTRY_ID=200          # 200 = Poland DB 2.0 (zalecane), 1 = Poland DB 1.0 (historyczne)
SENUTO_FETCH_MODE=topLevelDomain   # albo subdomain
SENUTO_TOP10_MAX_PAGES=50      # cap paginacji positions/getData (100/strona)
SENUTO_TIMEOUT=30
```

`SENUTO_FETCH_MODE`:
- `topLevelDomain` – analiza dla całej domeny (zalecane).
- `subdomain` – analiza tylko podanej subdomeny.

`SENUTO_TOP10_MAX_PAGES` chroni przed nadmiernym zużyciem kredytów dla bardzo dużych domen (każda strona = 100 rekordów). Domyślnie 50 stron = do 5000 wyników w TOP 10.

## 3. Test integracji

Po uzupełnieniu `.env` uruchom:

```bash
python3 test_senuto.py example.com
```

Skrypt powinien wypisać statystyki domeny i liczbę URL-i w TOP 10/50.

## 4. Najczęstsze błędy

| Komunikat                                              | Przyczyna / rozwiązanie                                         |
|--------------------------------------------------------|-----------------------------------------------------------------|
| `Senuto zwróciło 401 — token wygasł`                   | Wygeneruj nowy token (kroki z punktu 1).                        |
| `Brak SENUTO_API_TOKEN w .env`                         | Uzupełnij wartość w pliku `.env`.                               |
| `Senuto API error (...): Domain not found`             | Domena nie jest indeksowana w Senuto dla danego `country_id`.   |
| `Brak danych dla X — Senuto i Ahrefs niedostępne`      | Padły obie integracje; sprawdź klucze w `.env`.                 |

## 5. Co się stanie jeśli Senuto zwróci błąd?

- Jeśli Ahrefs jest dostępne – zapisana zostanie tylko `domain_rating` i `referring_domains`, pola TOP/URL/ruch będą `0`. `data_source = ahrefs_api`.
- Jeśli oba źródła padną – domena zostaje pominięta (`continue` w pętli), w logach pojawi się komunikat błędu.
