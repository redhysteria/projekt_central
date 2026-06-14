# Moduł kampanii produktowej (Shopping/PMax) — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dodać drugi tor budżetu mediowego (kampania produktowa Shopping/PMax) napędzany celem ROAS, z wynagrodzeniem agencji liczonym od SUMY budżetu Search + Produktowy.

**Architecture:** Czysta logika wyliczeń wydzielona do testowalnego modułu `google_ads_compute.js` (UMD: działa w przeglądarce i w `node --test`). Planer DOM (`google_ads_planner.js`) zbiera wejścia i woła czyste funkcje. Tabela progowa opłat (`google_ads_calculator.js`) niezmieniona — dostaje tylko sumę zamiast samego Search. Nowe parametry trwale zapisywane w `GoogleAdsSettings`.

**Tech Stack:** Vanilla JS (UMD), wbudowany `node --test` (Node v22), Flask + SQLAlchemy + SQLite, Bootstrap 5.

Spec: `docs/superpowers/specs/2026-06-14-kampania-produktowa-design.md`

---

## Struktura plików

- **Modify** `static/js/google_ads_calculator.js` — node-safe (guard DOM) + UMD export `computeGoogleAdsManagementFee`.
- **Create** `static/js/google_ads_compute.js` — czyste funkcje `computeProductCampaign`, `computeCombinedSummary` (UMD).
- **Create** `tests/google_ads_compute.test.js` — testy `node --test`.
- **Modify** `static/js/google_ads_planner.js` — wpięcie toru produktowego w `recalcSummary`, `collectSettingsPayload`, `applySettings`, `bindPersistListeners`.
- **Modify** `templates/quote_editor.html` — karta UI kampanii produktowej + include `google_ads_compute.js` + bump wersji skryptów.
- **Modify** `models.py` — kolumny produktowe w `GoogleAdsSettings` + `to_dict`.
- **Modify** `app.py` — migracje `ALTER TABLE` + obsługa nowych pól w `GoogleAdsAPI.post`.
- **Create** `tests/test_google_ads_settings.py` — smoke test serializacji `to_dict` (styl repo).

---

## Task 1: calculator.js — node-safe + UMD export

Aby testy w Node mogły użyć prawdziwej tabeli progowej opłat, moduł musi dać się
zaimportować w Node (dziś jego stopka woła `document` i wybucha poza przeglądarką).

**Files:**
- Modify: `static/js/google_ads_calculator.js:143-150`
- Test: `tests/google_ads_compute.test.js`

- [ ] **Step 1: Utwórz katalog testów i napisz failujący test importu**

Create `tests/google_ads_compute.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const { computeGoogleAdsManagementFee } = require(
    path.join(__dirname, '..', 'static', 'js', 'google_ads_calculator.js')
);

test('fee: próg do 6000 zł = stałe 1500', () => {
    assert.strictEqual(computeGoogleAdsManagementFee(0).fee, 1500);
    assert.strictEqual(computeGoogleAdsManagementFee(6000).fee, 1500);
});

test('fee: 10000 zł = 1900 + 18% ponad 8000 = 2260', () => {
    assert.strictEqual(computeGoogleAdsManagementFee(10000).fee, 2260);
});
```

- [ ] **Step 2: Uruchom test — ma paść**

Run: `node --test tests/google_ads_compute.test.js`
Expected: FAIL — `ReferenceError: document is not defined` (stopka IIFE woła `document.readyState` przy imporcie).

- [ ] **Step 3: Dodaj guard DOM + UMD export**

W `static/js/google_ads_calculator.js` zamień końcówkę (linie ~143-150):

```js
    window.computeGoogleAdsManagementFee = computeGoogleAdsManagementFee;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initCalc);
    } else {
        initCalc();
    }
})();
```

na:

```js
    if (typeof window !== 'undefined') {
        window.computeGoogleAdsManagementFee = computeGoogleAdsManagementFee;
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { computeGoogleAdsManagementFee };
    }

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initCalc);
        } else {
            initCalc();
        }
    }
})();
```

- [ ] **Step 4: Uruchom test — ma przejść**

Run: `node --test tests/google_ads_compute.test.js`
Expected: PASS (2 testy).

- [ ] **Step 5: Commit**

```bash
git add static/js/google_ads_calculator.js tests/google_ads_compute.test.js
git commit -m "feat(google-ads): node-safe UMD export kalkulatora opłat agencji"
```

---

## Task 2: computeProductCampaign — czysta logika toru produktowego

**Files:**
- Create: `static/js/google_ads_compute.js`
- Test: `tests/google_ads_compute.test.js`

- [ ] **Step 1: Dopisz failujące testy `computeProductCampaign`**

Dopisz na końcu `tests/google_ads_compute.test.js`:

```js
const { computeProductCampaign, computeCombinedSummary } = require(
    path.join(__dirname, '..', 'static', 'js', 'google_ads_compute.js')
);

test('produkt: wyłączony => same zera', () => {
    const r = computeProductCampaign({ enabled: false, targetRevenue: 40000, targetRoas: 4, cpc: 1, cvr: 2, aov: 1000 });
    assert.deepStrictEqual(r, { budget: 0, clicks: 0, conversions: 0, impliedRevenue: 0 });
});

test('produkt: budżet = przychód / ROAS', () => {
    const r = computeProductCampaign({ enabled: true, targetRevenue: 40000, targetRoas: 4, cpc: 2, cvr: 2.5, aov: 1000 });
    assert.strictEqual(r.budget, 10000);          // 40000 / 4
    assert.strictEqual(r.clicks, 5000);           // 10000 / 2
    assert.strictEqual(r.conversions, 125);       // 5000 * 0.025
    assert.strictEqual(r.impliedRevenue, 125000); // 125 * 1000
});

test('produkt: brak CPC => kliki/konwersje 0, budżet dalej liczony', () => {
    const r = computeProductCampaign({ enabled: true, targetRevenue: 40000, targetRoas: 4, cpc: 0, cvr: 2.5, aov: 1000 });
    assert.strictEqual(r.budget, 10000);
    assert.strictEqual(r.clicks, 0);
    assert.strictEqual(r.conversions, 0);
});
```

- [ ] **Step 2: Uruchom test — ma paść**

Run: `node --test tests/google_ads_compute.test.js`
Expected: FAIL — `Cannot find module '.../google_ads_compute.js'`.

- [ ] **Step 3: Utwórz `static/js/google_ads_compute.js` z `computeProductCampaign`**

```js
/**
 * Czysta logika wyliczeń planera Google Ads (bez DOM).
 * UMD: działa w przeglądarce (window.GoogleAdsCompute) i w Node (module.exports).
 */
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (typeof root !== 'undefined' && root) {
        root.GoogleAdsCompute = api;
    }
}(typeof self !== 'undefined' ? self : this, function () {

    /**
     * Tor kampanii produktowej (Shopping/PMax), driver = cel ROAS.
     * @param {{enabled:boolean,targetRevenue:number,targetRoas:number,cpc:number,cvr:number,aov:number}} p
     * @returns {{budget:number,clicks:number,conversions:number,impliedRevenue:number}}
     */
    function computeProductCampaign(p) {
        const targetRevenue = Number(p.targetRevenue) || 0;
        const targetRoas = Number(p.targetRoas) || 0;
        const cpc = Number(p.cpc) || 0;
        const cvr = Number(p.cvr) || 0;
        const aov = Number(p.aov) || 0;

        if (!p.enabled) {
            return { budget: 0, clicks: 0, conversions: 0, impliedRevenue: 0 };
        }

        const budget = (targetRevenue > 0 && targetRoas > 0) ? targetRevenue / targetRoas : 0;
        const clicks = cpc > 0 ? budget / cpc : 0;
        const conversions = clicks * (cvr > 0 ? cvr / 100 : 0);
        const impliedRevenue = conversions * (aov > 0 ? aov : 0);

        return { budget, clicks, conversions, impliedRevenue };
    }

    return { computeProductCampaign };
}));
```

- [ ] **Step 4: Uruchom test — ma przejść**

Run: `node --test tests/google_ads_compute.test.js`
Expected: PASS — 3 testy `computeProductCampaign` (z Taska 2) + testy opłat z Taska 1.

> Uwaga: `computeCombinedSummary` jest destrukturyzowane z importu, ale na tym etapie żaden test go nie używa (jest `undefined`) — testy go wywołujące dodajemy w Tasku 3. Nie ma to wpływu na ten przebieg.

- [ ] **Step 5: Commit**

```bash
git add static/js/google_ads_compute.js tests/google_ads_compute.test.js
git commit -m "feat(google-ads): computeProductCampaign — tor produktowy (cel ROAS)"
```

---

## Task 3: computeCombinedSummary — opłaty agencji OD SUMY

To rdzeń wymogu biznesowego: opłata agencji liczona od `search + produkt`.

**Files:**
- Modify: `static/js/google_ads_compute.js`
- Test: `tests/google_ads_compute.test.js`

- [ ] **Step 1: Dopisz failujące testy `computeCombinedSummary`**

Dopisz na końcu `tests/google_ads_compute.test.js`:

```js
test('suma: opłata agencji liczona od budżetu łącznego, nie samego Search', () => {
    // Search 4000 + Produkt 4000 = 8000 łącznie.
    // Sam Search (4000) => próg 1500. Suma 8000 => też 1500 (próg <=8000),
    // ale 4000+5000=9000 pokaże różnicę:
    const s = computeCombinedSummary({
        searchBudget: 4000, searchConversions: 2, searchRevenue: 2000,
        productBudget: 5000, productConversions: 3, productRevenue: 20000,
        margin: 0.15,
        feeFn: (b) => computeGoogleAdsManagementFee(b).fee,
    });
    assert.strictEqual(s.combinedBudget, 9000);
    // 9000 => próg 8001-12000: 1900 + 18% ponad 8000 = 1900 + 180 = 2080
    assert.strictEqual(s.agencyFee, 2080);
    assert.strictEqual(s.totalCost, 11080);           // 9000 + 2080
    assert.strictEqual(s.combinedConversions, 5);     // 2 + 3
    assert.strictEqual(s.combinedRevenue, 22000);     // 2000 + 20000
    assert.ok(Math.abs(s.roas - 22000 / 11080) < 1e-9);
    assert.ok(Math.abs(s.netMargin - (22000 * 0.15 - 11080)) < 1e-9);
});

test('suma: produkt = 0 => zachowanie jak sam Search', () => {
    const s = computeCombinedSummary({
        searchBudget: 4000, searchConversions: 2, searchRevenue: 2000,
        productBudget: 0, productConversions: 0, productRevenue: 0,
        margin: 0.15,
        feeFn: (b) => computeGoogleAdsManagementFee(b).fee,
    });
    assert.strictEqual(s.combinedBudget, 4000);
    assert.strictEqual(s.agencyFee, 1500);   // próg <=6000
    assert.strictEqual(s.totalCost, 5500);
});
```

- [ ] **Step 2: Uruchom test — ma paść**

Run: `node --test tests/google_ads_compute.test.js`
Expected: FAIL — `computeCombinedSummary is not a function`.

- [ ] **Step 3: Dodaj `computeCombinedSummary` do `google_ads_compute.js`**

W `static/js/google_ads_compute.js` przed `return { computeProductCampaign };` wstaw funkcję, i rozszerz return:

```js
    /**
     * Podsumowanie zbiorcze obu torów. Opłata agencji liczona OD SUMY budżetów.
     * @param {{searchBudget:number,searchConversions:number,searchRevenue:number,
     *          productBudget:number,productConversions:number,productRevenue:number,
     *          margin:number, feeFn:function(number):number}} p
     */
    function computeCombinedSummary(p) {
        const searchBudget = Number(p.searchBudget) || 0;
        const productBudget = Number(p.productBudget) || 0;
        const margin = Number(p.margin) || 0;

        const combinedBudget = searchBudget + productBudget;
        const agencyFee = typeof p.feeFn === 'function' ? (Number(p.feeFn(combinedBudget)) || 0) : 0;
        const totalCost = combinedBudget + agencyFee;

        const combinedConversions = (Number(p.searchConversions) || 0) + (Number(p.productConversions) || 0);
        const combinedRevenue = (Number(p.searchRevenue) || 0) + (Number(p.productRevenue) || 0);
        const roas = totalCost > 0 ? combinedRevenue / totalCost : 0;
        const netMargin = combinedRevenue * margin - totalCost;

        return { combinedBudget, agencyFee, totalCost, combinedConversions, combinedRevenue, roas, netMargin };
    }

    return { computeProductCampaign, computeCombinedSummary };
```

(usuń poprzednie `return { computeProductCampaign };`)

- [ ] **Step 4: Uruchom CAŁY plik testowy — wszystko ma przejść**

Run: `node --test tests/google_ads_compute.test.js`
Expected: PASS (wszystkie testy z Tasków 1–3).

- [ ] **Step 5: Commit**

```bash
git add static/js/google_ads_compute.js tests/google_ads_compute.test.js
git commit -m "feat(google-ads): computeCombinedSummary — opłata agencji od sumy budżetów"
```

---

## Task 4: Backend — kolumny produktowe w GoogleAdsSettings + to_dict

**Files:**
- Modify: `models.py:224-257`
- Test: `tests/test_google_ads_settings.py`

- [ ] **Step 1: Napisz failujący smoke test serializacji**

Create `tests/test_google_ads_settings.py`:

```python
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
```

- [ ] **Step 2: Uruchom test — ma paść**

Run: `python3 tests/test_google_ads_settings.py`
Expected: FAIL — `AttributeError`/`AssertionError` (kolumny i klucze nie istnieją).

- [ ] **Step 3: Dodaj kolumny i pola w `to_dict`**

W `models.py` w klasie `GoogleAdsSettings` po linii `usd_pln_rate = db.Column(db.Float, default=3.64)` dodaj:

```python
    product_enabled = db.Column(db.Boolean, default=False)
    product_target_revenue = db.Column(db.Float, nullable=True, default=None)
    product_target_roas = db.Column(db.Float, default=4.0)
    product_cpc = db.Column(db.Float, nullable=True, default=None)
    product_cvr = db.Column(db.Float, nullable=True, default=None)
```

W metodzie `to_dict`, w zwracanym słowniku przed `'updated_at': ...` dodaj:

```python
            'product_enabled': bool(self.product_enabled),
            'product_target_revenue': self.product_target_revenue,
            'product_target_roas': self.product_target_roas if self.product_target_roas is not None else 4.0,
            'product_cpc': self.product_cpc,
            'product_cvr': self.product_cvr,
```

- [ ] **Step 4: Uruchom test — ma przejść**

Run: `python3 tests/test_google_ads_settings.py`
Expected: PASS — `OK — to_dict zawiera pola produktowe`.

- [ ] **Step 5: Commit**

```bash
git add models.py tests/test_google_ads_settings.py
git commit -m "feat(google-ads): kolumny kampanii produktowej w GoogleAdsSettings"
```

---

## Task 5: Backend — migracja ALTER TABLE + zapis pól w GoogleAdsAPI.post

**Files:**
- Modify: `app.py:42-50` (blok migracji)
- Modify: `app.py:892-928` (`GoogleAdsAPI.post`)

- [ ] **Step 1: Dodaj migracje kolumn produktowych**

W `app.py` w krotce `for _col_stmt in (...)` (linie ~42-45) dopisz pięć instrukcji:

```python
    for _col_stmt in (
        'ALTER TABLE forecast_settings ADD COLUMN prophet_transactions_forecast_json TEXT',
        'ALTER TABLE forecast_settings ADD COLUMN prophet_transactions_fit_json TEXT',
        'ALTER TABLE google_ads_settings ADD COLUMN product_enabled BOOLEAN DEFAULT 0',
        'ALTER TABLE google_ads_settings ADD COLUMN product_target_revenue FLOAT',
        'ALTER TABLE google_ads_settings ADD COLUMN product_target_roas FLOAT DEFAULT 4.0',
        'ALTER TABLE google_ads_settings ADD COLUMN product_cpc FLOAT',
        'ALTER TABLE google_ads_settings ADD COLUMN product_cvr FLOAT',
    ):
```

- [ ] **Step 2: Obsłuż nowe pola w `GoogleAdsAPI.post`**

W `app.py` w `GoogleAdsAPI.post`, przed `keywords = data.get('keywords')` dodaj:

```python
        if 'product_enabled' in data:
            settings.product_enabled = bool(data.get('product_enabled'))

        for _f in ('product_target_revenue', 'product_target_roas', 'product_cpc', 'product_cvr'):
            if _f in data:
                _v = data.get(_f)
                setattr(settings, _f, float(_v) if _v is not None and _v != '' else None)
```

- [ ] **Step 3: Weryfikacja — migracja na istniejącej bazie + round-trip API**

Run:
```bash
source venv/bin/activate && python app.py > /tmp/pc.log 2>&1 &
sleep 6
# utwórz wycenę testową
QID=$(curl -s -X POST http://localhost:5002/api/quotes -H 'Content-Type: application/json' -d '{"name":"PC test"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
# zapisz pola produktowe
curl -s -X POST http://localhost:5002/api/quotes/$QID/google-ads -H 'Content-Type: application/json' \
  -d '{"product_enabled":true,"product_target_revenue":40000,"product_target_roas":4,"product_cpc":2,"product_cvr":2.5}' > /dev/null
# odczytaj
curl -s http://localhost:5002/api/quotes/$QID/google-ads
echo
lsof -ti:5002 | xargs kill -9
```
Expected: JSON zawiera `"product_enabled": true, "product_target_revenue": 40000.0, "product_target_roas": 4.0, "product_cpc": 2.0, "product_cvr": 2.5`. Brak błędu migracji w `/tmp/pc.log`.

- [ ] **Step 4: Commit**

```bash
git add app.py
git commit -m "feat(google-ads): migracja + zapis pól kampanii produktowej w API"
```

---

## Task 6: Frontend — UI karty produktowej + include modułu compute

**Files:**
- Modify: `templates/quote_editor.html:772-773` (wstawka karty), `:941-942` (include + wersje)

- [ ] **Step 1: Wstaw kartę kampanii produktowej**

W `templates/quote_editor.html` między zamknięciem rzędu „Parametry" (linia 772 `</div>`) a komentarzem `<!-- Boks wyniku -->` (linia 774) wstaw:

```html
                            <!-- Kampania produktowa (Shopping/PMax) -->
                            <div class="rounded-3 border border-secondary py-3 px-3 mb-3"
                                style="background: rgba(15, 20, 32, 0.55);">
                                <div class="form-check form-switch mb-2">
                                    <input class="form-check-input" type="checkbox" id="googleAdsProductEnabled">
                                    <label class="form-check-label text-light fw-semibold" for="googleAdsProductEnabled">
                                        Kampania produktowa (Shopping / PMax)
                                    </label>
                                </div>
                                <div class="row g-3">
                                    <div class="col-6 col-md-3">
                                        <label class="form-label text-light small mb-1" for="googleAdsProductRevenue">Docelowy przychód / mc (zł)</label>
                                        <input type="number" class="form-control form-control-sm" id="googleAdsProductRevenue"
                                            placeholder="np. 40000" min="0" step="100">
                                    </div>
                                    <div class="col-6 col-md-3">
                                        <label class="form-label text-light small mb-1" for="googleAdsProductRoas">Docelowy ROAS (×)</label>
                                        <input type="number" class="form-control form-control-sm" id="googleAdsProductRoas"
                                            value="4" min="0.1" step="0.1">
                                    </div>
                                    <div class="col-6 col-md-3">
                                        <label class="form-label text-light small mb-1" for="googleAdsProductCpc">CPC Shopping (zł)</label>
                                        <input type="number" class="form-control form-control-sm" id="googleAdsProductCpc"
                                            placeholder="np. 0.80" min="0" step="0.01">
                                    </div>
                                    <div class="col-6 col-md-3">
                                        <label class="form-label text-light small mb-1" for="googleAdsProductCvr">CVR Shopping (%)</label>
                                        <input type="number" class="form-control form-control-sm" id="googleAdsProductCvr"
                                            placeholder="np. 2.0" min="0" step="0.1">
                                    </div>
                                </div>
                                <div class="form-text text-secondary small mt-2">
                                    Budżet produktowy = przychód ÷ ROAS. Opłata agencji liczona od <strong class="text-light">sumy</strong> (Search + Produktowa).
                                </div>
                            </div>

```

- [ ] **Step 2: Dołącz moduł compute i podbij wersje skryptów**

W `templates/quote_editor.html` zamień (linie 941-942):

```html
    <script src="{{ url_for('static', filename='js/google_ads_calculator.js') }}?v=2"></script>
    <script src="{{ url_for('static', filename='js/google_ads_planner.js') }}?v=6"></script>
```

na:

```html
    <script src="{{ url_for('static', filename='js/google_ads_calculator.js') }}?v=3"></script>
    <script src="{{ url_for('static', filename='js/google_ads_compute.js') }}?v=1"></script>
    <script src="{{ url_for('static', filename='js/google_ads_planner.js') }}?v=7"></script>
```

(`google_ads_compute.js` MUSI być przed `google_ads_planner.js` — planer go używa.)

- [ ] **Step 3: Weryfikacja — strona ładuje moduł bez błędów konsoli**

Run:
```bash
source venv/bin/activate && python app.py > /tmp/pc.log 2>&1 &
sleep 6
curl -s http://localhost:5002/static/js/google_ads_compute.js -o /dev/null -w "compute.js HTTP %{http_code}\n"
QID=$(curl -s -X POST http://localhost:5002/api/quotes -H 'Content-Type: application/json' -d '{"name":"UI test"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
curl -s "http://localhost:5002/quote-editor?id=$QID" | grep -c "googleAdsProductEnabled"
lsof -ti:5002 | xargs kill -9
```
Expected: `compute.js HTTP 200` oraz licznik `>= 1` (pole obecne w wyrenderowanym HTML).

- [ ] **Step 4: Commit**

```bash
git add templates/quote_editor.html
git commit -m "feat(google-ads): UI karty kampanii produktowej + include modułu compute"
```

---

## Task 7: Frontend — wpięcie toru produktowego w planer (recalcSummary + zapis)

**Files:**
- Modify: `static/js/google_ads_planner.js` — `collectSettingsPayload` (34-48), `applySettings` (71-97), `recalcSummary` (230-329), `bindPersistListeners` (479-493).

- [ ] **Step 1: Rozszerz `collectSettingsPayload` o pola produktowe**

W `collectSettingsPayload` przed `};` zamykającym zwracany obiekt dodaj (po `media_budget: ...`):

```js
            product_enabled: !!document.getElementById('googleAdsProductEnabled')?.checked,
            product_target_revenue: parseFloat(document.getElementById('googleAdsProductRevenue')?.value) || null,
            product_target_roas: parseFloat(document.getElementById('googleAdsProductRoas')?.value) || null,
            product_cpc: parseFloat(document.getElementById('googleAdsProductCpc')?.value) || null,
            product_cvr: parseFloat(document.getElementById('googleAdsProductCvr')?.value) || null,
```

- [ ] **Step 2: Rozszerz `applySettings` o przywracanie pól produktowych**

W `applySettings`, przed zamknięciem funkcji (po bloku `budgetEl`) dodaj:

```js
        const prodEnabled = document.getElementById('googleAdsProductEnabled');
        if (prodEnabled) prodEnabled.checked = !!data.product_enabled;

        setNum('googleAdsProductRevenue', data.product_target_revenue);
        setNum('googleAdsProductRoas', data.product_target_roas);
        setNum('googleAdsProductCpc', data.product_cpc);
        setNum('googleAdsProductCvr', data.product_cvr);
```

- [ ] **Step 3: Podłącz pola produktowe do zapisu i przeliczeń**

W `bindPersistListeners` rozszerz tablicę `persistIds`:

```js
        const persistIds = [
            'googleAdsCtr', 'googleAdsSafety',
            'googleAdsManualClicks', 'googleAdsUsdPln', 'googleAdsMediaBudget',
            'googleAdsProductEnabled', 'googleAdsProductRevenue', 'googleAdsProductRoas',
            'googleAdsProductCpc', 'googleAdsProductCvr',
        ];
```

(Pola produktowe nie są wyłączane z `recalcSummary` — domyślna gałąź `if (id !== 'googleAdsMediaBudget') recalcSummary();` je przeliczy.)

- [ ] **Step 4: Przepisz końcówkę `recalcSummary` na tor produktowy + sumę**

W `static/js/google_ads_planner.js` zamień fragment `recalcSummary` OD linii
`const feeResult = typeof window.computeGoogleAdsManagementFee === 'function'`
DO końca funkcji (do zamykającego `}` przed `function onTableInput`) na:

```js
        const clicks = weightedCpc > 0 ? suggestedBudget / weightedCpc : 0;
        const cvr = readCvr();
        const aov = readAov();
        const margin = readMargin();

        const searchConversions = clicks * cvr;
        const searchRevenue = searchConversions * aov;

        const product = window.GoogleAdsCompute.computeProductCampaign({
            enabled: !!document.getElementById('googleAdsProductEnabled')?.checked,
            targetRevenue: parseFloat(document.getElementById('googleAdsProductRevenue')?.value) || 0,
            targetRoas: parseFloat(document.getElementById('googleAdsProductRoas')?.value) || 0,
            cpc: parseFloat(document.getElementById('googleAdsProductCpc')?.value) || 0,
            cvr: parseFloat(document.getElementById('googleAdsProductCvr')?.value) || 0,
            aov: aov,
        });

        const summary = window.GoogleAdsCompute.computeCombinedSummary({
            searchBudget: suggestedBudget,
            searchConversions,
            searchRevenue,
            productBudget: product.budget,
            productConversions: product.conversions,
            productRevenue: product.budget > 0 ? (parseFloat(document.getElementById('googleAdsProductRevenue')?.value) || 0) : 0,
            margin,
            feeFn: (b) => (typeof window.computeGoogleAdsManagementFee === 'function'
                ? window.computeGoogleAdsManagementFee(b).fee : 0),
        });

        const agencyFee = summary.agencyFee;
        const totalCost = summary.totalCost;
        const roas = summary.roas;
        const netMargin = summary.netMargin;
        const conversions = summary.combinedConversions;
        const revenue = summary.combinedRevenue;

        const mainInput = document.getElementById('googleAdsMediaBudget');
        if (mainInput && suggestedBudget > 0) {
            mainInput.value = suggestedBudget;
            mainInput.dispatchEvent(new Event('input', { bubbles: true }));
        }

        const el = document.getElementById('googleAdsPlannerSummary');
        if (!el) return;

        const hasData = (withCpc.length > 0 && targetClicks > 0) || product.budget > 0;

        const productRow = product.budget > 0 ? `
                <div class="col-6 col-md-3">
                    <div class="small text-secondary">Budżet produktowy / mc</div>
                    <div class="fw-bold text-warning">${fmtPl(product.budget)} zł</div>
                </div>` : '';

        el.innerHTML = hasData ? `
            <div class="row g-3 text-light">
                <div class="col-6 col-md-3">
                    <div class="small text-secondary">Śr. ważony CPC (Search)</div>
                    <div class="fw-bold">${fmtPl(weightedCpc, 2)} zł</div>
                </div>
                <div class="col-6 col-md-3">
                    <div class="small text-secondary">Budżet Search / mc</div>
                    <div class="fw-bold">${fmtPl(suggestedBudget)} zł</div>
                </div>
                ${productRow}
                <div class="col-6 col-md-3">
                    <div class="small text-secondary">Budżet łączny / mc</div>
                    <div class="fw-bold text-warning fs-5">${fmtPl(summary.combinedBudget)} zł</div>
                </div>
                <div class="col-6 col-md-3">
                    <div class="small text-secondary">Opłata agencji (od sumy)</div>
                    <div class="fw-bold">${fmtPl(agencyFee)} zł</div>
                </div>
                <div class="col-6 col-md-3">
                    <div class="small text-secondary">Łączny koszt / mc</div>
                    <div class="fw-bold">${fmtPl(totalCost)} zł</div>
                </div>
                <div class="col-6 col-md-3">
                    <div class="small text-secondary">Konwersje / mc (razem)</div>
                    <div class="fw-bold">${fmtPl(conversions, 1)}</div>
                </div>
                <div class="col-6 col-md-3">
                    <div class="small text-secondary">Przychód / mc (razem)</div>
                    <div class="fw-bold text-info">${fmtPl(Math.round(revenue))} zł</div>
                </div>
                <div class="col-6 col-md-3">
                    <div class="small text-secondary">ROAS (razem)</div>
                    <div class="fw-bold ${roas >= 1 ? 'text-success' : 'text-danger'}">${fmtPl(roas, 2)}x</div>
                </div>
                <div class="col-12">
                    <div class="small text-secondary mt-1">Marża netto / mc (razem)</div>
                    <div class="fw-bold ${netMargin >= 0 ? 'text-success' : 'text-danger'}">${fmtPl(Math.round(netMargin))} zł</div>
                    <div class="form-text text-secondary" style="font-size:0.72rem">
                        CVR ${(cvr * 100).toFixed(1)}% · AOV ${fmtPl(aov)} zł · marża ${(margin * 100).toFixed(0)}%
                        (z sekcji Estymacja 12mc, edytowalne tamże)
                    </div>
                </div>
            </div>
        ` : `<div class="text-secondary small py-2">Uzupełnij CPC i wolumen (Search) lub włącz kampanię produktową, aby zobaczyć prognozę.</div>`;
    }
```

- [ ] **Step 5: Weryfikacja manualna w przeglądarce**

Run: `source venv/bin/activate && python app.py` (osobny terminal), otwórz edytor wyceny, rozwiń „Planer Google Ads".
Sprawdź:
1. Włącz „Kampania produktowa", wpisz przychód 40000, ROAS 4, CPC 2, CVR 2.5 → „Budżet produktowy / mc" = 10 000 zł.
2. „Budżet łączny" = Search + 10 000; „Opłata agencji (od sumy)" rośnie względem samego Search.
3. Wyłącz włącznik → budżet produktowy znika, opłata wraca do wartości z samego Search.
4. Odśwież stronę → ustawienia produktowe wczytane z DB (persisted).
Expected: wszystkie 4 punkty zgodne.

- [ ] **Step 6: Commit**

```bash
git add static/js/google_ads_planner.js
git commit -m "feat(google-ads): wpięcie toru produktowego w planer + opłata od sumy"
```

---

## Task 8: Pełny przebieg testów + finalizacja gałęzi

- [ ] **Step 1: Uruchom wszystkie testy JS**

Run: `node --test tests/`
Expected: PASS — wszystkie testy z `tests/google_ads_compute.test.js`.

- [ ] **Step 2: Uruchom smoke test backendu**

Run: `python3 tests/test_google_ads_settings.py`
Expected: PASS — `OK — to_dict zawiera pola produktowe`.

- [ ] **Step 3: Weryfikacja end-to-end (sekcja „Plan testów" ze spec)**

Powtórz weryfikacje z Task 5 Step 3 i Task 7 Step 5 na czystym uruchomieniu.
Expected: zapis/odczyt API zgodny, UI liczy opłatę od sumy, wyłącznik wraca do stanu wyjściowego.

- [ ] **Step 4: Aktualizacja README (sekcja Google Ads)**

W `README.md` w opisie planera Google Ads dopisz zdanie o kampanii produktowej:
„Kampania produktowa (Shopping/PMax): budżet = docelowy przychód ÷ docelowy ROAS; opłata agencji liczona od sumy budżetu Search + Produktowego."

```bash
git add README.md
git commit -m "docs: opis kampanii produktowej w planerze Google Ads"
```

- [ ] **Step 5: Finalizacja**

Użyj skilla `superpowers:finishing-a-development-branch` aby zdecydować o scaleniu `feat/kampania-produktowa` do `main`.

---

## Self-review (wypełnione przy pisaniu planu)

- **Pokrycie spec:** model wyliczeń (Task 2,3,7) · opłata od sumy (Task 3,7) · UI (Task 6) · zapis/migracja (Task 4,5) · prognoza zbiorcza (Task 3,7) · plan testów (Task 8). Wszystkie sekcje spec mają zadanie.
- **Brak placeholderów:** każdy krok zawiera pełny kod/komendę i oczekiwany wynik.
- **Spójność typów/nazw:** `computeProductCampaign({enabled,targetRevenue,targetRoas,cpc,cvr,aov})` i `computeCombinedSummary({searchBudget,searchConversions,searchRevenue,productBudget,productConversions,productRevenue,margin,feeFn})` użyte identycznie w testach (Task 2,3) i w planerze (Task 7). Klucze API/DB (`product_enabled,product_target_revenue,product_target_roas,product_cpc,product_cvr`) spójne między modelem (Task 4), API (Task 5) i frontem (Task 7).
