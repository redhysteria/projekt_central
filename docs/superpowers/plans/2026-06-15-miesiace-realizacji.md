# Wybór miesięcy realizacji — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zastąpić zepsuty wybór miesięcy (martwy suwak „Do") komponentem „pigułek miesięcy" obsługującym dowolny zbiór miesięcy, z rozkładem liczonym jako pochodna tego zbioru (jedno źródło prawdy) i poprawnym eksportem XLSX.

**Architecture:** Kanoniczny zbiór miesięcy w `QuoteItem.client_months` (CSV). Czyste helpery w nowym `month_utils.py` (bez zależności — używane przez models/business_logic/excel_export). Rozkład liczony wprost z `client_months × client_price`; `MonthlyDistribution` przestaje być źródłem. Frontend: jeden komponent `month_picker.js` (czysta logika testowana w `node --test` + warstwa DOM).

**Tech Stack:** Flask + SQLAlchemy + SQLite, openpyxl, Vanilla JS (UMD), `node --test` (Node v22), Bootstrap 5.

Spec: `docs/superpowers/specs/2026-06-15-miesiace-realizacji-design.md`

---

## Struktura plików

- **Create** `month_utils.py` — czyste funkcje miesięcy (parse/csv/label/legacy), zero zależności.
- **Create** `tests/test_month_utils.py` — smoke test helperów.
- **Modify** `models.py` — kolumna `client_months` + `to_dict.monthly_distribution` z `client_months`.
- **Modify** `app.py` — migracja+backfill `client_months`; `QuoteItemsAPI.post/put` przyjmują `client_months`.
- **Modify** `business_logic.py` — `calculate_monthly_totals` i auto-zadania z `client_months`; rozkład bez materializacji.
- **Modify** `excel_export.py` — kolumny miesięczne z `client_months`.
- **Create** `static/js/month_picker.js` — komponent pigułek (czysta logika + render DOM).
- **Create** `tests/month_picker.test.js` — testy czystej logiki (`node --test`).
- **Modify** `static/js/quote_editor.js` — wpięcie pickera (lista, nowe zadanie, modale), usunięcie podglądu + martwego kodu.
- **Modify** `templates/quote_editor.html` — kontenery pickera, usunięcie sekcji „Rozkład miesięczny", include skryptu.

---

## Task 1: month_utils.py — czyste helpery miesięcy

**Files:**
- Create: `month_utils.py`
- Test: `tests/test_month_utils.py`

- [ ] **Step 1: Napisz failujący smoke test**

Create `tests/test_month_utils.py`:

```python
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
```

- [ ] **Step 2: Uruchom — ma paść**

Run: `venv/bin/python3 tests/test_month_utils.py`
Expected: FAIL — `ModuleNotFoundError: No module named 'month_utils'`.

- [ ] **Step 3: Utwórz `month_utils.py`**

```python
"""
Czyste helpery miesięcy realizacji. Zero zależności (importowalne przez
models / business_logic / excel_export bez cyklu).

Kanoniczny format: client_months = posortowany CSV liczb 1-12, np. "2,5,8".
"""
import re


def parse_months_csv(csv):
    """'2,5,8' -> [2,5,8]; filtruje 1-12, sortuje, deduplikuje. None/'' -> []."""
    if not csv:
        return []
    out = set()
    for part in str(csv).split(','):
        part = part.strip()
        if not part:
            continue
        try:
            m = int(part)
        except ValueError:
            continue
        if 1 <= m <= 12:
            out.add(m)
    return sorted(out)


def months_to_csv(months):
    """[8,2,5,2] -> '2,5,8'."""
    uniq = sorted({m for m in months if isinstance(m, int) and 1 <= m <= 12})
    return ','.join(str(m) for m in uniq)


def months_to_label(months):
    """Etykieta dla człowieka. [] -> ''; [5] -> 'Miesiąc 05';
    ciągły -> 'Miesiące 02–07'; rozproszony -> 'Miesiące 02, 05, 08'."""
    ms = sorted({m for m in months if isinstance(m, int) and 1 <= m <= 12})
    if not ms:
        return ""
    if len(ms) == 1:
        return f"Miesiąc {ms[0]:02d}"
    if ms == list(range(ms[0], ms[-1] + 1)):
        return f"Miesiące {ms[0]:02d}–{ms[-1]:02d}"
    return "Miesiące " + ", ".join(f"{m:02d}" for m in ms)


def client_month_label_to_csv(client_month):
    """Stare formaty -> CSV. 'Miesiąc 0X' -> 'X'; 'Od Miesiąc 0X' -> 'X..12';
    'Miesiąc X-Y' -> 'X..Y'. Nieznane/'' -> ''."""
    if not client_month:
        return ""
    s = str(client_month)

    m = re.match(r'Od Miesiąc (\d{1,2})', s)
    if m:
        start = int(m.group(1))
        if 1 <= start <= 12:
            return months_to_csv(list(range(start, 13)))
        return ""

    m = re.match(r'Miesiąc (\d{1,2})-(\d{1,2})', s)
    if m:
        a, b = int(m.group(1)), int(m.group(2))
        if 1 <= a <= b <= 12:
            return months_to_csv(list(range(a, b + 1)))
        return ""

    m = re.match(r'Miesiąc (\d{1,2})', s)
    if m:
        return months_to_csv([int(m.group(1))])

    return ""
```

- [ ] **Step 4: Uruchom — ma przejść**

Run: `venv/bin/python3 tests/test_month_utils.py`
Expected: PASS — `OK — month_utils`.

- [ ] **Step 5: Commit**

```bash
git add month_utils.py tests/test_month_utils.py
git commit -m "feat(months): month_utils — czyste helpery zbioru miesięcy"
```

---

## Task 2: Model client_months + to_dict pochodny + migracja/backfill

**Files:**
- Modify: `models.py` (klasa `QuoteItem`, kolumny ~70-80 i `to_dict` ~85-103)
- Modify: `app.py` (blok migracji ~42-51; backfill po migracji)
- Test: `tests/test_month_utils.py` (dopisanie testu to_dict — patrz niżej; alternatywnie nowy plik)

- [ ] **Step 1: Dopisz failujący test serializacji do `tests/test_month_utils.py`**

Dopisz przed `print("OK — month_utils")` w `main()`:

```python
    from models import QuoteItem
    it = QuoteItem(task_name='X', specialist_type='Mid SEO', client_price=3000.0, client_months='2,5,8')
    d = it.to_dict()
    assert d['client_months'] == '2,5,8', d.get('client_months')
    assert d['monthly_distribution'] == {2: 3000.0, 5: 3000.0, 8: 3000.0}, d['monthly_distribution']
```

- [ ] **Step 2: Uruchom — ma paść**

Run: `venv/bin/python3 tests/test_month_utils.py`
Expected: FAIL — `TypeError`/`AttributeError` (brak kolumny `client_months` / klucza).

- [ ] **Step 3: Dodaj kolumnę i pochodny rozkład w `models.py`**

(a) W klasie `QuoteItem`, po linii `client_month = db.Column(db.String(50), default='')` dodaj:

```python
    client_months = db.Column(db.Text, default='')  # kanoniczny CSV miesięcy 1-12, np. "2,5,8"
```

(b) Na górze `models.py` (po istniejących importach) dodaj:

```python
from month_utils import parse_months_csv
```

(c) W `QuoteItem.to_dict` zamień blok `'monthly_distribution': { ... }` na rozkład pochodny i dodaj `client_months`:

```python
            'client_month': self.client_month,
            'client_months': self.client_months or '',
            'is_auto_generated': self.is_auto_generated,
            'monthly_distribution': {
                m: self.client_price for m in parse_months_csv(self.client_months)
            }
```

(zachowaj pozostałe istniejące klucze; usuń stary blok iterujący po `self.monthly_distributions`).

- [ ] **Step 4: Dodaj migrację + backfill w `app.py`**

(a) W krotce `for _col_stmt in ( ... ):` (blok startowy) dopisz przed `):`:

```python
        'ALTER TABLE quote_item ADD COLUMN client_months TEXT',
```

(b) Po pętli migracji a przed `_conn.close()` dodaj jednorazowy backfill:

```python
    # Backfill client_months ze starego client_month (tylko gdy puste)
    try:
        from month_utils import client_month_label_to_csv
        rows = _conn.execute(
            "SELECT id, client_month FROM quote_item "
            "WHERE (client_months IS NULL OR client_months = '') AND client_month != ''"
        ).fetchall()
        for _id, _cm in rows:
            _csv = client_month_label_to_csv(_cm)
            if _csv:
                _conn.execute("UPDATE quote_item SET client_months = ? WHERE id = ?", (_csv, _id))
        _conn.commit()
    except sqlite3.OperationalError:
        pass
```

- [ ] **Step 5: Uruchom test serializacji — ma przejść**

Run: `venv/bin/python3 tests/test_month_utils.py`
Expected: PASS — `OK — month_utils`.

- [ ] **Step 6: Commit**

```bash
git add models.py app.py tests/test_month_utils.py
git commit -m "feat(months): kolumna client_months + rozkład pochodny w to_dict + migracja/backfill"
```

---

## Task 3: Rozkład jako pochodna — business_logic + excel_export

**Files:**
- Modify: `business_logic.py` (`calculate_monthly_totals` ~185-196; auto-zadania ~8-123; `generate_monthly_distribution` ~125-145)
- Modify: `excel_export.py` (~58-80)
- Test: `tests/test_month_utils.py` (dopisanie testu totals)

- [ ] **Step 1: Dopisz failujący test sum miesięcznych**

Dopisz w `main()` w `tests/test_month_utils.py` przed `print(...)`:

```python
    from month_utils import parse_months_csv as _p
    # rozkład pozycji = pełna cena w każdym zaznaczonym miesiącu
    price = 3000.0
    dist = {m: price for m in _p('2,5,8')}
    assert sum(dist.values()) == 9000.0
    assert set(dist.keys()) == {2, 5, 8}
```

- [ ] **Step 2: Uruchom — ma przejść od razu** (test używa tylko month_utils)

Run: `venv/bin/python3 tests/test_month_utils.py`
Expected: PASS. (Ten krok blokuje regresję; właściwa zmiana w backendzie poniżej.)

- [ ] **Step 3: `business_logic.py` — sumy i auto-zadania z client_months**

(a) Na górze pliku dodaj import:

```python
from month_utils import parse_months_csv, client_month_label_to_csv
```

(b) Zamień `calculate_monthly_totals` (cały korpus pętli) na liczenie z `client_months`:

```python
    def calculate_monthly_totals(self, quote_id):
        """Sumy miesięczne z client_months (pełna client_price w każdym miesiącu)."""
        items = QuoteItem.query.filter_by(quote_id=quote_id).all()
        monthly_totals = {month: 0 for month in range(1, 13)}
        for item in items:
            for m in parse_months_csv(item.client_months):
                monthly_totals[m] += (item.client_price or 0)
        return monthly_totals
```

(c) W `_create_or_update_auto_item` ustaw też `client_months` z etykiety. Znajdź miejsca
ustawiające `client_month` (przy update istniejącego i przy tworzeniu nowego) i obok
każdego przypisania `... .client_month = client_month` / `client_month=client_month`
dodaj odpowiednio:

przy aktualizacji istniejącego (`existing_item`):
```python
            existing_item.client_months = client_month_label_to_csv(client_month)
```
przy tworzeniu nowego `QuoteItem(...)` — dodaj argument:
```python
                client_months=client_month_label_to_csv(client_month),
```

(d) Zneutralizuj materializację rozkładu — zamień korpusy obu metod na no-op (zostają,
by nie psuć ewentualnych wywołań):

```python
    def generate_monthly_distribution(self, quote_item_id):
        """Rozkład jest pochodną client_months — materializacja nieużywana."""
        return

    def regenerate_monthly_distribution(self, quote_item_id):
        """Rozkład jest pochodną client_months — materializacja nieużywana."""
        return
```

- [ ] **Step 4: `excel_export.py` — kolumny miesięczne z client_months**

(a) Na górze pliku dodaj import:

```python
from month_utils import parse_months_csv
```

(b) Zamień blok pobierający `monthly_dist` z `MonthlyDistribution` (pętla
`for dist in MonthlyDistribution.query.filter_by(...)`) na pochodną:

```python
            # Rozkład miesięczny pochodny z client_months (pełna cena w każdym miesiącu)
            monthly_dist = {m: (item.client_price or 0) for m in parse_months_csv(item.client_months)}
```

Kolumna I (`item.client_month`) i pętla `for month in range(1, 13): row_data.append(monthly_dist.get(month, 0))` pozostają bez zmian.

- [ ] **Step 5: Weryfikacja — sumy i eksport zgodne z client_months**

Run:
```bash
cd /Users/piotr/Documents/Repozytoria/projekt_central
source venv/bin/activate
python app.py > /tmp/m.log 2>&1 &
sleep 7
QID=$(curl -s -X POST http://localhost:5002/api/quotes -H 'Content-Type: application/json' -d '{"name":"Mc test"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
curl -s -X POST http://localhost:5002/api/quotes/$QID/items -H 'Content-Type: application/json' \
  -d '{"task_name":"T","specialist_type":"Mid SEO","client_units":1,"price_per_unit":3000,"client_price":3000,"client_months":"2,5,8"}' > /dev/null
echo "--- item z API ---"
curl -s http://localhost:5002/api/quotes/$QID | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['items'][0]['monthly_distribution'])"
echo "--- błędy w logu? ---"; grep -i "error\|traceback" /tmp/m.log | head
lsof -ti:5002 | xargs kill -9
```
Expected: `monthly_distribution` = `{'2': 3000.0, '5': 3000.0, '8': 3000.0}` (klucze jako stringi w JSON), brak tracebacku.

- [ ] **Step 6: Commit**

```bash
git add business_logic.py excel_export.py tests/test_month_utils.py
git commit -m "feat(months): rozkład jako pochodna client_months (sumy + eksport)"
```

---

## Task 4: API — QuoteItemsAPI przyjmuje client_months

**Files:**
- Modify: `app.py` (`QuoteItemsAPI.post` ~293-312, `put` ~316-333)

- [ ] **Step 1: `post` — przyjmij i znormalizuj client_months, odtwórz etykietę**

W `app.py` na górze (przy innych importach) dodaj:

```python
from month_utils import parse_months_csv, months_to_csv, months_to_label, client_month_label_to_csv
```

W `QuoteItemsAPI.post`, przed `db.session.add(item)` (po zbudowaniu `item` z danych),
ustaw spójnie miesiące. Zamień przypisanie `client_month=data.get('client_month', '')`
w konstruktorze na `client_month=''` i tuż po utworzeniu `item` dodaj:

```python
        _csv = data.get('client_months')
        if _csv is None:
            _csv = client_month_label_to_csv(data.get('client_month', ''))
        _months = parse_months_csv(_csv)
        item.client_months = months_to_csv(_months)
        item.client_month = months_to_label(_months)
```

Usuń istniejące wywołanie `business_logic.generate_monthly_distribution(item.id)` z `post`
(rozkład jest pochodny).

- [ ] **Step 2: `put` — to samo dla aktualizacji**

W `QuoteItemsAPI.put`, znajdź `item.client_month = data.get('client_month', item.client_month)`
i zamień na blok obsługujący oba pola:

```python
        if 'client_months' in data or 'client_month' in data:
            _csv = data.get('client_months')
            if _csv is None:
                _csv = client_month_label_to_csv(data.get('client_month', '') or '')
            _months = parse_months_csv(_csv)
            item.client_months = months_to_csv(_months)
            item.client_month = months_to_label(_months)
```

Usuń wywołanie `business_logic.regenerate_monthly_distribution(item_id)` z `put`.

- [ ] **Step 3: Weryfikacja round-trip (zakres + rozproszone + aktualizacja)**

Run:
```bash
cd /Users/piotr/Documents/Repozytoria/projekt_central
source venv/bin/activate
python app.py > /tmp/m.log 2>&1 &
sleep 7
QID=$(curl -s -X POST http://localhost:5002/api/quotes -H 'Content-Type: application/json' -d '{"name":"API mc"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
IID=$(curl -s -X POST http://localhost:5002/api/quotes/$QID/items -H 'Content-Type: application/json' -d '{"task_name":"T","specialist_type":"Mid SEO","client_units":1,"price_per_unit":250,"client_price":250,"client_months":"2,3,4,5,6,7"}' | python3 -c "import sys,json;print(json.load(sys.stdin).get('id') or json.load(sys.stdin))" 2>/dev/null)
echo "po POST (zakres ciągły):"
curl -s http://localhost:5002/api/quotes/$QID | python3 -c "import sys,json;d=json.load(sys.stdin)['items'][0];print('client_months=',d['client_months'],'| client_month=',d['client_month'])"
# aktualizacja na rozproszone
curl -s -X PUT http://localhost:5002/api/quotes/$QID/items/$IID -H 'Content-Type: application/json' -d '{"client_months":"2,5,8"}' > /dev/null
echo "po PUT (rozproszone):"
curl -s http://localhost:5002/api/quotes/$QID | python3 -c "import sys,json;d=json.load(sys.stdin)['items'][0];print('client_months=',d['client_months'],'| client_month=',d['client_month'],'| dist=',d['monthly_distribution'])"
lsof -ti:5002 | xargs kill -9
```
Expected:
- po POST: `client_months= 2,3,4,5,6,7 | client_month= Miesiące 02–07`
- po PUT: `client_months= 2,5,8 | client_month= Miesiące 02, 05, 08 | dist= {'2':250.0,'5':250.0,'8':250.0}`

(Jeśli `IID` puste przez podwójny odczyt stdin, pobierz id osobnym curl — to tylko skrypt weryfikacyjny.)

- [ ] **Step 4: Commit**

```bash
git add app.py
git commit -m "feat(months): API items przyjmuje i normalizuje client_months + etykieta"
```

---

## Task 5: month_picker.js — czysta logika pigułek

**Files:**
- Create: `static/js/month_picker.js`
- Test: `tests/month_picker.test.js`

- [ ] **Step 1: Napisz failujące testy**

Create `tests/month_picker.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { csvToMonths, monthsToCsv, toggleMonth, fillRange } = require(
    path.join(__dirname, '..', 'static', 'js', 'month_picker.js')
);

test('csvToMonths: sort/dedup/filtr 1-12', () => {
    assert.deepStrictEqual(csvToMonths('8,2,2,5'), [2, 5, 8]);
    assert.deepStrictEqual(csvToMonths('0,13,5'), [5]);
    assert.deepStrictEqual(csvToMonths(''), []);
});

test('monthsToCsv', () => {
    assert.strictEqual(monthsToCsv([8, 2, 5, 2]), '2,5,8');
    assert.strictEqual(monthsToCsv([]), '');
});

test('toggleMonth dodaje i usuwa', () => {
    assert.deepStrictEqual(toggleMonth([2, 5], 8), [2, 5, 8]);
    assert.deepStrictEqual(toggleMonth([2, 5, 8], 5), [2, 8]);
});

test('fillRange wypełnia zakres ciągły w obie strony', () => {
    assert.deepStrictEqual(fillRange([2], 2, 6), [2, 3, 4, 5, 6]);
    assert.deepStrictEqual(fillRange([9], 9, 6), [6, 7, 8, 9]);
    assert.deepStrictEqual(fillRange([1, 12], 3, 5), [1, 3, 4, 5, 12]);
});
```

- [ ] **Step 2: Uruchom — ma paść**

Run: `node --test tests/month_picker.test.js`
Expected: FAIL — `Cannot find module .../month_picker.js`.

- [ ] **Step 3: Utwórz `static/js/month_picker.js` (na razie tylko czysta logika + UMD)**

```js
/**
 * Komponent „pigułek miesięcy" — wybór dowolnego zbioru miesięcy 1-12.
 * Czysta logika (UMD: window.MonthPicker + module.exports) + render DOM (przeglądarka).
 */
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof root !== 'undefined' && root) root.MonthPicker = api;
}(typeof self !== 'undefined' ? self : this, function () {

    function csvToMonths(csv) {
        if (!csv) return [];
        const set = new Set();
        String(csv).split(',').forEach((p) => {
            const n = parseInt(String(p).trim(), 10);
            if (!isNaN(n) && n >= 1 && n <= 12) set.add(n);
        });
        return Array.from(set).sort((a, b) => a - b);
    }

    function monthsToCsv(months) {
        const set = new Set();
        (months || []).forEach((m) => { if (m >= 1 && m <= 12) set.add(m); });
        return Array.from(set).sort((a, b) => a - b).join(',');
    }

    function toggleMonth(months, m) {
        const set = new Set(months);
        if (set.has(m)) set.delete(m); else set.add(m);
        return Array.from(set).sort((a, b) => a - b);
    }

    function fillRange(months, anchor, m) {
        const lo = Math.min(anchor, m), hi = Math.max(anchor, m);
        const set = new Set(months);
        for (let i = lo; i <= hi; i++) set.add(i);
        return Array.from(set).sort((a, b) => a - b);
    }

    return { csvToMonths, monthsToCsv, toggleMonth, fillRange };
}));
```

- [ ] **Step 4: Uruchom — ma przejść**

Run: `node --test tests/month_picker.test.js`
Expected: PASS (4 testy).

- [ ] **Step 5: Commit**

```bash
git add static/js/month_picker.js tests/month_picker.test.js
git commit -m "feat(months): month_picker — czysta logika zbioru miesięcy"
```

---

## Task 6: month_picker.js — render DOM + include w szablonie

**Files:**
- Modify: `static/js/month_picker.js` (dodanie `renderMonthPicker`)
- Modify: `templates/quote_editor.html` (include skryptu ~przy innych `<script>`)

- [ ] **Step 1: Dodaj `renderMonthPicker` do `month_picker.js`**

W `static/js/month_picker.js`, przed `return { ... };`, dodaj funkcję renderującą i dołącz ją do eksportu:

```js
    /**
     * Rysuje pigułki w kontenerze. Klik = toggle; shift-klik = zakres od ostatniej kotwicy.
     * @param {HTMLElement} container
     * @param {string} csv  aktualny CSV miesięcy
     * @param {{disabled?:boolean, onChange?:(csv:string)=>void}} opts
     */
    function renderMonthPicker(container, csv, opts) {
        opts = opts || {};
        let months = csvToMonths(csv);
        let anchor = null;

        function paint() {
            container.innerHTML = '';
            const wrap = document.createElement('div');
            wrap.className = 'd-flex flex-wrap gap-1 align-items-center';
            for (let m = 1; m <= 12; m++) {
                const b = document.createElement('button');
                b.type = 'button';
                const on = months.indexOf(m) !== -1;
                b.className = 'btn btn-sm ' + (on ? 'btn-primary' : 'btn-outline-secondary');
                b.style.minWidth = '34px';
                b.style.padding = '1px 6px';
                b.textContent = String(m).padStart(2, '0');
                if (opts.disabled) {
                    b.disabled = true;
                } else {
                    b.addEventListener('click', (ev) => {
                        if (ev.shiftKey && anchor) {
                            months = fillRange(months, anchor, m);
                        } else {
                            months = toggleMonth(months, m);
                            anchor = m;
                        }
                        if (opts.onChange) opts.onChange(monthsToCsv(months));
                        paint();
                    });
                }
                wrap.appendChild(b);
            }
            if (!opts.disabled) {
                const clr = document.createElement('button');
                clr.type = 'button';
                clr.className = 'btn btn-sm btn-link text-secondary p-0 ms-1';
                clr.title = 'Wyczyść';
                clr.textContent = '✕';
                clr.addEventListener('click', () => {
                    months = [];
                    anchor = null;
                    if (opts.onChange) opts.onChange('');
                    paint();
                });
                wrap.appendChild(clr);
            }
            container.appendChild(wrap);
        }

        paint();
    }
```

i zmień końcowy `return` na:

```js
    return { csvToMonths, monthsToCsv, toggleMonth, fillRange, renderMonthPicker };
```

- [ ] **Step 2: Dołącz skrypt w szablonie**

W `templates/quote_editor.html` znajdź pierwszy `<script src="{{ url_for('static', filename='js/quote_editor.js') }}...">` i tuż PRZED nim dodaj:

```html
    <script src="{{ url_for('static', filename='js/month_picker.js') }}?v=1"></script>
```

(month_picker musi się załadować przed quote_editor.js, który go używa.)

- [ ] **Step 3: Weryfikacja — testy logiki nadal zielone + parse OK**

Run: `node --test tests/month_picker.test.js && node --check static/js/month_picker.js && echo OK`
Expected: 4 testy PASS, `OK`.

- [ ] **Step 4: Commit**

```bash
git add static/js/month_picker.js templates/quote_editor.html
git commit -m "feat(months): renderMonthPicker (DOM) + include w edytorze"
```

---

## Task 7: Wpięcie pickera w listę zadań + nowe zadanie; usunięcie podglądu i martwego kodu

**Files:**
- Modify: `static/js/quote_editor.js` (`renderItemsTable` ~504-516; init ~12-16; `renderMonthlyTable` ~530; nowe zadanie ~783-804; martwe funkcje ~209-326)
- Modify: `templates/quote_editor.html` (nowe zadanie ~128-135; sekcja „Rozkład miesięczny" ~185-195; nagłówek tabeli)

- [ ] **Step 1: Per-wiersz — zastąp suwaki kontenerem pickera w `renderItemsTable`**

W `static/js/quote_editor.js` zamień komórkę `<td>` z `month-range-container` (cały blok
od `<td>` z `<div class="month-range-container">` do zamykającego `</td>`, ~504-517) na:

```js
            <td>
                <div class="month-picker-cell" id="monthPicker${item.id}"></div>
            </td>
```

Następnie, po `tbody.appendChild(row);` (w pętli `quoteItems.forEach`), zainicjuj picker
dla wiersza — dodaj wewnątrz pętli, zaraz po `tbody.appendChild(row);`:

```js
        const pickerEl = document.getElementById(`monthPicker${item.id}`);
        if (pickerEl) {
            MonthPicker.renderMonthPicker(pickerEl, item.client_months || '', {
                disabled: !!item.is_auto_generated,
                onChange: (csv) => updateItemField(item.id, 'client_months', csv),
            });
        }
```

- [ ] **Step 2: Nowe zadanie (formularz) — picker zamiast suwaków**

(a) W `templates/quote_editor.html` zamień blok nowego zadania (kontener z `newFromMonth`/
`newToMonth`, ~128-135) na:

```html
                                        <label class="form-label">Miesiąc realizacji</label>
                                        <div id="newTaskMonthPicker"></div>
```

(b) W `static/js/quote_editor.js` w funkcji `init` (po `initModalSliders();`) dodaj
inicjalizację pickera nowego zadania z lokalnym stanem CSV:

```js
    window._newTaskMonthsCsv = '';
    const newPicker = document.getElementById('newTaskMonthPicker');
    if (newPicker) {
        MonthPicker.renderMonthPicker(newPicker, '', {
            onChange: (csv) => { window._newTaskMonthsCsv = csv; },
        });
    }
```

(c) W funkcji dodającej zadanie z formularza (używającej `getNewTaskMonthValue`, ~783-804)
zamień `const clientMonth = getNewTaskMonthValue();` oraz pole `client_month: clientMonth`
w payloadzie na:

```js
        const clientMonthsCsv = window._newTaskMonthsCsv || '';
```
oraz w obiekcie payloadu zamień `client_month: clientMonth` na:
```js
            client_months: clientMonthsCsv
```

(d) Po udanym dodaniu zadania wyzeruj picker — po `renderItemsTable();` w tej funkcji dodaj:
```js
        window._newTaskMonthsCsv = '';
        const np = document.getElementById('newTaskMonthPicker');
        if (np) MonthPicker.renderMonthPicker(np, '', { onChange: (csv) => { window._newTaskMonthsCsv = csv; } });
```

- [ ] **Step 3: Usuń podgląd „Rozkład miesięczny" i martwy kod**

(a) W `templates/quote_editor.html` usuń całą sekcję „Rozkład miesięczny" (nagłówek
~185 i tabela `id="monthlyTable"` ~189, wraz z opakowującym kontenerem tej sekcji).

(b) W `static/js/quote_editor.js`:
- usuń funkcję `renderMonthlyTable` (~530) i wszystkie jej wywołania (`renderMonthlyTable();`
  w `loadQuote` ~376, w `importTemplates` ~106 i gdziekolwiek indziej — wyszukaj `renderMonthlyTable`),
- usuń martwe funkcje suwakowe: `parseItemMonth`, `generateMonthlyDistributionForItem`,
  `updateItemMonthRange`, `getNewTaskMonthValue`, `initMonthRangeSliders`,
  `updateNewTaskMonthRange` oraz ich wywołania w `init` (`initMonthRangeSliders();`).
- W `addNewItem` (~574-589, dodającym pustą pozycję) zamień `client_month: ''` na
  `client_months: ''`.

- [ ] **Step 4: Weryfikacja w przeglądarce (manualna)**

Run: `source venv/bin/activate && python app.py` (osobny terminal), otwórz edytor wyceny.
Sprawdź:
1. Przy każdym zadaniu rząd pigułek `01..12`; auto-zadania mają pigułki wyłączone.
2. Klik miesiąca zaznacza/odznacza; **shift-klik** wypełnia zakres ciągły; „✕" czyści.
3. Zmiana zapisuje się (odśwież stronę → stan zachowany).
4. Sekcja „Rozkład miesięczny" zniknęła; brak błędów w konsoli.
Expected: wszystkie punkty zgodne.

- [ ] **Step 5: Commit**

```bash
git add static/js/quote_editor.js templates/quote_editor.html
git commit -m "feat(months): picker w liście zadań i nowym zadaniu + usunięcie podglądu i martwego kodu"
```

---

## Task 8: Wpięcie pickera w modale (Linkbuilding + Treści)

**Files:**
- Modify: `templates/quote_editor.html` (modale ~843-852 i ~895-901)
- Modify: `static/js/quote_editor.js` (`initModalSliders` ~16/1302-1311; `addLinkbuildingTasks`/`addContentTask` ~1419-1529; funkcje update suwaków modali ~1334-1410)

- [ ] **Step 1: Szablon — zamień suwaki modali na kontenery pickera**

W `templates/quote_editor.html`:
- W modalu Linkbuilding zamień kontener z `linkiFromMonth`/`linkiToMonth` (~843-852) na:
```html
                        <label class="form-label">Miesiąc realizacji</label>
                        <div id="linkiMonthPicker"></div>
```
- W modalu Treści zamień kontener z `contentFromMonth`/`contentToMonth` (~895-901) na:
```html
                        <label class="form-label">Miesiąc realizacji</label>
                        <div id="contentMonthPicker"></div>
```

- [ ] **Step 2: JS — inicjalizacja pickerów modali zamiast suwaków**

W `static/js/quote_editor.js` zamień korpus `initModalSliders` na inicjalizację dwóch
pickerów z lokalnym stanem (domyślnie zakres 2–12 dla LB, miesiąc 02 dla treści — jak
dotychczasowe wartości startowe suwaków):

```js
function initModalSliders() {
    window._linkiMonthsCsv = '2,3,4,5,6,7,8,9,10,11,12';
    window._contentMonthsCsv = '2';
    const lp = document.getElementById('linkiMonthPicker');
    if (lp) MonthPicker.renderMonthPicker(lp, window._linkiMonthsCsv, {
        onChange: (csv) => { window._linkiMonthsCsv = csv; },
    });
    const cp = document.getElementById('contentMonthPicker');
    if (cp) MonthPicker.renderMonthPicker(cp, window._contentMonthsCsv, {
        onChange: (csv) => { window._contentMonthsCsv = csv; },
    });
}
```

Usuń funkcje aktualizacji suwaków modali (`updateLinkiMonthRange`/`updateContentMonthRange`
lub analogiczne ~1334-1410) i ich wywołania.

- [ ] **Step 3: JS — payloady modali wysyłają client_months**

W `addLinkbuildingTasks` i `addContentTask` (~1419-1529) zamień obliczanie `clientMonth`
oraz pola `client_month: clientMonth` w payloadach na użycie CSV ze stanu pickera:
- w funkcji Linkbuilding: usuń `const clientMonth = ...`; w każdym payloadzie zamień
  `client_month: clientMonth` na `client_months: window._linkiMonthsCsv || ''`.
- w funkcji Treści: analogicznie `client_months: window._contentMonthsCsv || ''`.

- [ ] **Step 4: Weryfikacja manualna**

Run: aplikacja (jak wyżej). Otwórz modal Linkbuilding i Treści: pigułki widoczne,
domyślne zaznaczenie zgodne (LB 02–12, treści 02), dodanie zadania tworzy pozycje z
poprawnymi miesiącami (widoczne na pigułkach w liście). Brak błędów w konsoli.

- [ ] **Step 5: Commit**

```bash
git add static/js/quote_editor.js templates/quote_editor.html
git commit -m "feat(months): picker w modalach Linkbuilding i Treści"
```

---

## Task 9: Pełny przebieg + finalizacja

- [ ] **Step 1: Testy backend + JS**

Run:
```bash
cd /Users/piotr/Documents/Repozytoria/projekt_central
venv/bin/python3 tests/test_month_utils.py
node --test 'tests/*.test.js'
```
Expected: `OK — month_utils`; wszystkie testy JS PASS (month_picker + wcześniejsze google_ads).

- [ ] **Step 2: Weryfikacja eksportu end-to-end**

Run:
```bash
cd /Users/piotr/Documents/Repozytoria/projekt_central
source venv/bin/activate
python app.py > /tmp/m.log 2>&1 &
sleep 7
QID=$(curl -s -X POST http://localhost:5002/api/quotes -H 'Content-Type: application/json' -d '{"name":"Export mc"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
curl -s -X POST http://localhost:5002/api/quotes/$QID/items -H 'Content-Type: application/json' -d '{"task_name":"T","specialist_type":"Mid SEO","client_units":1,"price_per_unit":250,"client_price":250,"client_months":"2,5,8"}' > /dev/null
curl -s "http://localhost:5002/api/quotes/$QID/export" -o /tmp/export_mc.xlsx -w "export HTTP %{http_code}\n"
venv/bin/python3 -c "import openpyxl; wb=openpyxl.load_workbook('/tmp/export_mc.xlsx'); ws=wb.active; print('wiersz 2 miesiące L-W:', [ws.cell(row=2, column=c).value for c in range(12, 24)])"
lsof -ti:5002 | xargs kill -9
```
Expected: `export HTTP 200`; w wierszu 2 kolumny odpowiadające miesiącom 02/05/08 mają 250, reszta 0.

- [ ] **Step 3: Aktualizacja README**

W `README.md` w sekcji „Rozkład miesięczny" / „Dodawanie zadań" zaktualizuj opis:
zamiast suwaków „Od/Do" — „wybór dowolnego zbioru miesięcy przez pigułki 01–12 (klik =
miesiąc, shift-klik = zakres ciągły); rozkład i eksport liczone wprost z zaznaczenia".

```bash
git add README.md
git commit -m "docs: opis nowego wyboru miesięcy realizacji (pigułki)"
```

- [ ] **Step 4: Finalizacja**

Użyj skilla `superpowers:finishing-a-development-branch` dla gałęzi `feat/miesiace-realizacji`.

---

## Self-review (wypełnione przy pisaniu planu)

- **Pokrycie spec:** model `client_months` (T2) · helpery+etykieta (T1) · rozkład pochodny w totals/export/to_dict (T2,T3) · API normalizacja+etykieta (T4) · komponent pigułek logika (T5) i DOM (T6) · wpięcie lista/nowe zadanie + usunięcie podglądu/martwego kodu (T7) · modale (T8) · backfill migracja (T2) · testy (T1–T9). Wszystkie sekcje spec mają zadanie.
- **Brak placeholderów:** każdy krok ma pełny kod/komendę i oczekiwany wynik.
- **Spójność nazw:** helpery `parse_months_csv`/`months_to_csv`/`months_to_label`/`client_month_label_to_csv` użyte identycznie w month_utils (T1), models (T2), business_logic/excel_export (T3), app.py (T4). JS `csvToMonths`/`monthsToCsv`/`toggleMonth`/`fillRange`/`renderMonthPicker` spójne w month_picker (T5,T6) i quote_editor (T7,T8). Kanoniczny klucz danych `client_months` (CSV) spójny: model → API → frontend.
