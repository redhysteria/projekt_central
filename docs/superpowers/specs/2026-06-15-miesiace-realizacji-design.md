# Wybór miesięcy realizacji — przeprojektowanie

Data: 2026-06-15
Status: zaakceptowany (gotowy do planu wdrożenia)

## Problem

Pole `QuoteItem.client_month` to pojedynczy string, który potrafi wyrazić tylko:
- `"Miesiąc 02"` → jeden miesiąc,
- `"Od Miesiąc 02"` → od 02 **zawsze do grudnia (12)**.

UI w edytorze ma dwa suwaki (Od / Do) na zadanie, ale `updateItemMonthRange`
([static/js/quote_editor.js](../../static/js/quote_editor.js)) zapisuje wyłącznie
`"Miesiąc XX"` albo `"Od Miesiąc XX"` — **wartość suwaka „Do" jest wyrzucana**.
Backend `_parse_client_month` ([business_logic.py](../../business_logic.py)) rozkłada
`"Od Miesiąc X"` na X→12. Skutki zgłaszane przez użytkownika:
- suwak „Do" nie działa / nie zapisuje się,
- rozkład w tabeli nie odpowiada temu, co wyklikane,
- podwójne nakładające się suwaki to słaby UX.

Dodatkowo rozkład jest materializowany w osobnej tabeli `MonthlyDistribution`
i bywa niezsynchronizowany z faktycznym wyborem.

## Cel

1. Niezawodny wybór miesięcy, który **poprawnie się zapisuje** i obejmuje zarówno
   **zakres ciągły** (np. 2–7), jak i **dowolne pojedyncze miesiące** (np. 2, 5, 8).
2. **Poprawny eksport XLSX** z miesiącami — to jest priorytet użytkownika.
3. Lepszy UX wyboru miesięcy.
4. Usunięcie podglądowej tabeli „Rozkład miesięczny" z ekranu (zbędna).

## Decyzje produktowe (zatwierdzone)

- Model miesięcy = **dowolny zbiór** miesięcy 1–12 (zakres ciągły i rozproszone).
- Podglądowa tabela „Rozkład miesięczny" zostaje **usunięta**.
- Semantyka kwoty bez zmian: `client_price` to kwota **na miesiąc**; SUMA zadania =
  `client_price × liczba zaznaczonych miesięcy` (jak dziś, np. „Opieka zespołu" 3000×11).

## Architektura: jedno źródło prawdy

Zamiast materializowanej tabeli `MonthlyDistribution` jako źródła — **rozkład jest
pochodną** kanonicznego zbioru miesięcy zapisanego przy zadaniu. Nie ma czego
rozsynchronizować.

### Model danych
- Nowa kolumna `QuoteItem.client_months` (TEXT) — kanoniczny zbiór miesięcy jako
  posortowana lista CSV liczb 1–12, np. `"2,3,4,5,6,7"` lub `"2,5,8"`. Puste = brak.
- Migracja `ALTER TABLE quote_item ADD COLUMN client_months TEXT` (wzorzec idempotentny
  z `app.py`, jak przy kampanii produktowej).
- **Backfill jednorazowy** przy starcie: dla wierszy z pustym `client_months` a
  niepustym `client_month` wylicz CSV ze starych reguł (`"Miesiąc 0X"`→`"X"`;
  `"Od Miesiąc 0X"`→`"X,…,12"`). Idempotentny (tylko gdy `client_months` puste).
- `client_month` zostaje jako **auto-generowana etykieta** odtwarzana z `client_months`
  przy każdym zapisie (np. `"Miesiące 02–07"`, `"Miesiące 02, 05, 08"`, `""`).

### Funkcje pomocnicze (backend, w `business_logic.py`)
- `parse_months_csv(csv) -> list[int]` — parsuje `"2,5,8"` → `[2,5,8]`, filtruje 1–12,
  sortuje, deduplikuje. Pusty/None → `[]`.
- `months_to_csv(list[int]) -> str` — odwrotność, posortowane, zdeduplikowane.
- `months_to_label(list[int]) -> str` — etykieta dla człowieka:
  - `[]` → `""`,
  - pojedynczy `[5]` → `"Miesiąc 05"`,
  - ciągły `[2,3,4,5,6,7]` → `"Miesiące 02–07"`,
  - rozproszony `[2,5,8]` → `"Miesiące 02, 05, 08"`.
- `item_month_distribution(item) -> dict[int,float]` — `{m: client_price}` dla każdego
  `m` w `parse_months_csv(item.client_months)`. **Jedyny** sposób liczenia rozkładu.

### Czytelnicy rozkładu (przejście na pochodną)
- `excel_export.py`: kolumny miesięczne L–W z `item_month_distribution(item)`; kolumna
  „Miesiąc realizacji - klient" = `item.client_month` (etykieta).
- `business_logic.calculate_monthly_totals`: sumy z `item_month_distribution`.
- `models.QuoteItem.to_dict`: pole `monthly_distribution` z `item_month_distribution`.
- `MonthlyDistribution`: tabela i model **pozostają** (brak destrukcyjnej migracji), ale
  przestają być źródłem; `generate_monthly_distribution`/`regenerate_monthly_distribution`
  stają się no-op (lub są usunięte z wywołań). Doprecyzowanie w planie.

### Zapis (API)
- `QuoteItemsAPI.post` / `put` ([app.py](../../app.py)) przyjmują `client_months` (CSV).
  Serwer: normalizuje przez `parse_months_csv`→`months_to_csv`, zapisuje `client_months`,
  odtwarza `client_month = months_to_label(...)`. Bez wołania regeneracji `MonthlyDistribution`.
- Wsteczna zgodność: jeśli przyjdzie samo `client_month` (stary klient) bez `client_months`,
  serwer wylicza `client_months` z `client_month` (reguły backfillu).
- Auto-zadania (`business_logic.generate_auto_items`) ustawiają `client_months` z
  ustawień wyceny (`lb_marza_month` itd., format `"Od Miesiąc 0X"` → CSV X..12). Ustawienia
  poziomu wyceny pozostają bez zmian.

## UI — komponent „pigułek miesięcy"

Jeden komponent wielokrotnego użytku (`static/js/month_picker.js`), zastępuje wszystkie
podwójne suwaki.

- Render: rząd 12 przycisków-przełączników `01…12`. Zaznaczone = podświetlone
  (Bootstrap `btn-primary` vs `btn-outline-secondary`). Mały przycisk „✕" czyści.
- Interakcja: klik = przełącz miesiąc; **shift-klik** = wypełnij zakres ciągły od
  ostatnio klikniętego do klikniętego; brak shift resetuje „kotwicę".
- Czysta logika (testowalna w `node --test`), oddzielona od DOM:
  - `toggleMonth(set, m) -> set`
  - `fillRange(set, anchor, m) -> set` (dodaje wszystkie miesiące między anchor a m)
  - `monthsToCsv(set)` / `csvToMonths(csv)` (spójne z backendem)
- Warstwa DOM komponentu: `renderMonthPicker(container, months, { disabled, onChange })`
  rysuje przyciski i woła `onChange(csv)` po każdej zmianie.
- Miejsca użycia: wiersz listy zadań (per zadanie), formularz „nowe zadanie", modale
  „Linkbuilding" i „Treści". Zadania auto-generowane: picker **wyłączony** (`disabled`),
  jak dziś (miesiące z ustawień wyceny).
- Zapis inline: `onChange(csv)` → `updateItemField(itemId, 'client_months', csv)` →
  istniejące `PUT /api/quotes/:id/items/:id`.

## Usunięcie podglądu
- Usunąć sekcję „Rozkład miesięczny" z `templates/quote_editor.html` oraz
  `renderMonthlyTable()` i jego wywołania z `static/js/quote_editor.js`.
- Usunąć martwy frontendowy `generateMonthlyDistributionForItem` / `parseItemMonth` /
  `updateItemMonthRange` / `getNewTaskMonthValue` (zastąpione komponentem).

## Plan testów
- Backend (smoke, styl repo): `parse_months_csv`, `months_to_csv`, `months_to_label`
  (pojedynczy/ciągły/rozproszony/pusty), `item_month_distribution` (kwota × miesiące),
  backfill ze starego `client_month`.
- JS (`node --test`): `toggleMonth`, `fillRange` (zakres w obie strony), `csvToMonths`/
  `monthsToCsv` (sort/dedup/filtr 1–12), spójność z backendem na przykładach.
- Eksport: rozkład miesięczny i etykieta zgodne z zaznaczeniem (np. 2,5,8 → kwoty w
  kolumnach 02/05/08, etykieta „Miesiące 02, 05, 08").

## Ryzyka / uwagi
- Migracja SQLite: kolumna dokładana idempotentnie; backfill tylko gdy `client_months` puste.
- `MonthlyDistribution` zostaje w schemacie (zgodność), ale wychodzi z roli źródła —
  jednoznacznie udokumentować, by nikt nie czytał jej jako prawdy.
- Spójność CSV/etykiety: zawsze generowane z `parse_months_csv` (jedna ścieżka).
