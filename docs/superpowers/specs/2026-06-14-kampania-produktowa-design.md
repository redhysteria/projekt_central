# Moduł kampanii produktowej (Shopping/PMax) — projekt

Data: 2026-06-14
Status: zaakceptowany (gotowy do planu wdrożenia)

## Cel

Obecny planer Google Ads liczy sugerowany budżet mediowy wyłącznie z listy słów
kluczowych (Search): `wolumen × CTR × CPC × safety`. Nie uwzględnia kampanii
produktowych (Shopping / Performance Max), które dla e-commerce zwykle stanowią
większość budżetu i nie są oparte na frazach, lecz na feedzie produktowym i celu
ROAS.

Dodajemy **drugi, równoległy tor budżetu** — kampanię produktową — i sprawiamy, że
**wynagrodzenie agencji liczone jest od SUMY** budżetu Search + Produktowego
(twardy wymóg biznesowy).

## Zakres

- Nowa sekcja UI „Kampania produktowa (Shopping/PMax)" pod istniejącym planerem Search.
- Model wyliczeń napędzany celem ROAS, z CPC i CVR jako wejściami.
- Opłata agencji przeliczana od łącznego budżetu mediowego (Search + Produktowy).
- Prognoza zbiorcza (konwersje, przychód, ROAS) sumująca oba tory.
- Trwały zapis nowych parametrów w `GoogleAdsSettings`.

Poza zakresem (YAGNI): integracja feedu produktowego, podział PMax na kanały,
osobne CPC per kategoria produktu, eksport do Excela (na ten moment moduł działa
jak istniejący planer — estymacja na ekranie + zapis w DB).

## Model wyliczeń

Wejścia (nowe, edytowalne):

| Pole | Domyślnie | Opis |
|---|---|---|
| `product_enabled` (włącznik) | wył. | całość liczona tylko gdy włączone |
| `product_target_revenue` (zł/mc) | — | docelowy miesięczny przychód z kampanii produktowej |
| `product_target_roas` (×) | 4,0 | docelowy ROAS — ile zł przychodu na 1 zł mediów |
| `product_cpc` (zł) | — | średni CPC Shopping (wejście) |
| `product_cvr` (%) | z Estymacji 12mc lub 2,0 | współczynnik konwersji Shopping |

Wzór (driver = cel ROAS):

```
budżet_produktowy    = product_target_revenue / product_target_roas
kliki_produkt        = budżet_produktowy / product_cpc
konwersje_produkt    = kliki_produkt × (product_cvr / 100)
implikowany_przychód = konwersje_produkt × AOV
```

- `AOV` pochodzi z sekcji Estymacja 12mc (`forecastAov`, fallback 1000 zł) — reużywane, nie duplikowane.
- `implikowany_przychód` służy jako kontrola realności względem `product_target_revenue`;
  rozjazd sygnalizuje nierealne założenia CPC/CVR/ROAS. Nie nadpisuje budżetu.
- Gdy `product_cpc` puste/0 → kliki i konwersje pokazujemy jako „—" (budżet liczy się dalej z ROAS).

## Wynagrodzenie agencji od sumy

Obecnie opłata liczona jest od samego budżetu Search. Zmiana:

```
budżet_search    = (istniejący sugerowany/ręczny budżet Search)
budżet_łączny    = budżet_search + budżet_produktowy
opłata_agencji   = computeGoogleAdsManagementFee(budżet_łączny)
koszt_całkowity  = budżet_search + budżet_produktowy + opłata_agencji
```

- Tabela progowa w `static/js/google_ads_calculator.js`
  (`computeGoogleAdsManagementFee`) **nie jest modyfikowana** — zmienia się wyłącznie
  argument, który do niej trafia (suma zamiast samego Search).
- Gdy `product_enabled = false`, `budżet_produktowy = 0` i całość zachowuje się jak dziś.

Prognoza zbiorcza:

```
konwersje_razem = konwersje_search + konwersje_produkt
przychód_razem  = przychód_search + (product_target_revenue jeśli enabled)
ROAS_razem      = przychód_razem / koszt_całkowity
marża_netto     = przychód_razem × margin − koszt_całkowity   (margin z Estymacji 12mc)
```

## UI i zapis

### UI

- Nowa karta „Kampania produktowa (Shopping/PMax)" umieszczona pod planerem Search,
  w tym samym stylu (Bootstrap 5, ciemny motyw).
- Pola wejściowe: włącznik + 4 inputy (przychód, ROAS, CPC, CVR).
- Podsumowanie planera rozbudowane:
  - nowy wiersz „Budżet produktowy / mc",
  - wartości „Budżet łączny", „Opłata agencji", „Koszt całkowity", „ROAS", „Marża netto"
    liczone od sumy obu torów.
- Gdy włącznik wyłączony — sekcja produktowa zwinięta/nieaktywna, podsumowanie identyczne jak obecnie.

### Logika frontu

- `static/js/google_ads_planner.js`: `recalcSummary()` rozszerzone o tor produktowy
  i przeliczenie opłaty od sumy. `collectSettingsPayload()` i `applySettings()` obejmują
  nowe pola. Nowe pola podpięte do `bindPersistListeners()`.

### Backend / zapis

- `models.py` → `GoogleAdsSettings`: nowe kolumny `product_enabled` (Boolean),
  `product_target_revenue` (Float, null), `product_target_roas` (Float, default 4.0),
  `product_cpc` (Float, null), `product_cvr` (Float, null). `to_dict()` je zwraca.
- Migracja: dopisać `ALTER TABLE google_ads_settings ADD COLUMN ...` w bloku startowym
  `app.py` (ten sam wzorzec co `brief_json`), opakowane w try/except `OperationalError`.
- `app.py` → `GoogleAdsAPI.post`: przyjąć i zwalidować nowe pola (parsowanie float/bool,
  puste → None).

## Plan testów

- Jednostkowo (logika wzoru, JS): budżet = przychód/ROAS; kliki/konwersje; suma i opłata
  od sumy; przypadek `product_cpc` puste; przypadek `product_enabled=false` → zachowanie jak dziś.
- Backend: POST nowych pól → zapis i odczyt przez `to_dict`; migracja na istniejącej bazie
  (kolumny dokładane bez utraty danych).
- Manualnie: włącz kampanię produktową w edytorze wyceny, sprawdź że opłata agencji rośnie
  wraz z sumą i że wyłączenie wraca do stanu wyjściowego.

## Ryzyka / uwagi

- Podwójna definicja przychodu (cel vs implikowany) — świadoma; implikowany to tylko kontrola.
- Migracja SQLite: kolumny dokładane idempotentnie (try/except), brak rebuildu tabeli.
- Spójność z Estymacją 12mc: AOV/CVR/margin czytane z istniejących pól DOM, nie kopiowane.
