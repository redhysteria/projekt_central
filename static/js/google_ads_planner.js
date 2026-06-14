/**
 * Google Ads Planner — tabela KW + sugerowany budżet startowy + prognoza 1 mc.
 *
 * Zależności:
 *   - google_ads_calculator.js (window.computeGoogleAdsManagementFee)
 *   - /api/keywords/generate  (Gemini AI)
 *   - /api/keywords/enrich    (Ahrefs Keywords Explorer)
 *   - /api/quotes/:id/google-ads (persist w DB)
 */
(function googleAdsPlannerIIFE() {

    const fmtPl = (n, decimals) => {
        if (n == null || isNaN(n)) return '—';
        return Number(n).toLocaleString('pl-PL', {
            minimumFractionDigits: decimals ?? 0,
            maximumFractionDigits: decimals ?? 0,
        });
    };

    const numOrNull = (raw) => {
        if (raw === undefined || raw === null || String(raw).trim() === '') return null;
        const n = parseFloat(raw);
        return isNaN(n) ? null : n;
    };

    function getQuoteId() {
        const params = new URLSearchParams(window.location.search);
        const id = params.get('id');
        return id && /^\d+$/.test(id) ? id : null;
    }

    function storageKey() {
        return `googleAdsPlan_${getQuoteId() || 'unknown'}`;
    }

    let _rows = [];
    let _saveTimer = null;
    let _loadedFromDb = false;

    function collectSettingsPayload() {
        const manualRaw = document.getElementById('googleAdsManualClicks')?.value;
        const manualParsed = parseFloat(manualRaw);
        const mediaRaw = document.getElementById('googleAdsMediaBudget')?.value;
        const mediaParsed = parseFloat(mediaRaw);

        return {
            keywords: _rows,
            ctr: parseFloat(document.getElementById('googleAdsCtr')?.value) || 4,
            safety_factor: parseFloat(document.getElementById('googleAdsSafety')?.value) || 1.2,
            manual_clicks: manualRaw === '' || isNaN(manualParsed) ? null : manualParsed,
            usd_pln_rate: parseFloat(document.getElementById('googleAdsUsdPln')?.value) || 3.64,
            media_budget: mediaRaw === '' || isNaN(mediaParsed) ? null : mediaParsed,
            product_enabled: !!document.getElementById('googleAdsProductEnabled')?.checked,
            product_target_revenue: numOrNull(document.getElementById('googleAdsProductRevenue')?.value),
            product_target_roas: numOrNull(document.getElementById('googleAdsProductRoas')?.value),
            product_cpc: numOrNull(document.getElementById('googleAdsProductCpc')?.value),
            product_cvr: numOrNull(document.getElementById('googleAdsProductCvr')?.value),
        };
    }

    function resolveBusinessDescription() {
        if (typeof window.getClientBusinessDescription === 'function') {
            return window.getClientBusinessDescription();
        }
        const firstP = document.getElementById('brandBriefContent')?.querySelector('p');
        return (firstP?.textContent || '').trim();
    }

    function syncBusinessDescriptionDisplay() {
        const el = document.getElementById('googleAdsBusinessDescriptionDisplay');
        if (!el) return;
        const desc = resolveBusinessDescription();
        if (desc) {
            el.innerHTML = `<span class="text-light" style="white-space: pre-wrap;">${escHtml(desc.substring(0, 1200))}</span>`;
        } else {
            el.innerHTML = '<span class="text-muted">Wygeneruj <strong class="text-light">Brief AI</strong> u góry strony (Parametry wyceny → Brief AI).</span>';
        }
    }

    window.syncGoogleAdsBusinessDescription = syncBusinessDescriptionDisplay;

    function applySettings(data) {
        if (!data) return;

        if (Array.isArray(data.keywords)) {
            _rows = data.keywords;
        }

        const setNum = (id, val) => {
            const el = document.getElementById(id);
            if (el && val != null && !isNaN(val)) el.value = val;
        };

        setNum('googleAdsCtr', data.ctr);
        setNum('googleAdsSafety', data.safety_factor);
        setNum('googleAdsUsdPln', data.usd_pln_rate);

        const manualEl = document.getElementById('googleAdsManualClicks');
        if (manualEl) {
            manualEl.value = data.manual_clicks != null ? data.manual_clicks : '';
        }

        const budgetEl = document.getElementById('googleAdsMediaBudget');
        if (budgetEl && data.media_budget != null && data.media_budget > 0) {
            budgetEl.value = data.media_budget;
            budgetEl.dispatchEvent(new Event('input', { bubbles: true }));
        }

        const prodEnabled = document.getElementById('googleAdsProductEnabled');
        if (prodEnabled) prodEnabled.checked = !!data.product_enabled;

        setNum('googleAdsProductRevenue', data.product_target_revenue);
        setNum('googleAdsProductRoas', data.product_target_roas);
        setNum('googleAdsProductCpc', data.product_cpc);
        setNum('googleAdsProductCvr', data.product_cvr);
    }

    function saveStateLocalFallback() {
        try {
            localStorage.setItem(storageKey(), JSON.stringify(collectSettingsPayload()));
        } catch (_) { /* ignore */ }
    }

    async function saveStateToDb() {
        const quoteId = getQuoteId();
        saveStateLocalFallback();

        if (!quoteId) return;

        try {
            const resp = await fetch(`/api/quotes/${quoteId}/google-ads`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(collectSettingsPayload()),
            });
            if (!resp.ok) {
                const err = await resp.json().catch(() => ({}));
                console.warn('Google Ads save:', err.error || resp.status);
            }
        } catch (e) {
            console.warn('Google Ads save failed:', e);
        }
    }

    function saveState() {
        if (_saveTimer) clearTimeout(_saveTimer);
        _saveTimer = setTimeout(() => {
            saveStateToDb();
        }, 400);
    }

    async function loadStateFromDb() {
        const quoteId = getQuoteId();
        if (!quoteId) {
            loadStateLocalFallbackOnly();
            return;
        }

        try {
            const resp = await fetch(`/api/quotes/${quoteId}/google-ads`);
            if (!resp.ok) throw new Error('load failed');
            const data = await resp.json();
            const settings = data.google_ads_settings;

            if (settings) {
                applySettings(settings);
                _loadedFromDb = true;
                renderTable();
                return;
            }
        } catch (e) {
            console.warn('Google Ads load from DB:', e);
        }

        loadStateLocalFallbackOnly();
    }

    function loadStateLocalFallbackOnly() {
        try {
            const raw = localStorage.getItem(storageKey());
            if (raw) {
                applySettings(JSON.parse(raw));
                if (getQuoteId()) saveState();
            }
        } catch (_) { /* ignore */ }
    }

    function readCvr() {
        const v = parseFloat(document.getElementById('forecastConversionRate')?.value);
        return (v > 0 ? v : 1.8) / 100;
    }
    function readAov() {
        const v = parseFloat(document.getElementById('forecastAov')?.value);
        return v > 0 ? v : 1000;
    }
    function readMargin() {
        const v = parseFloat(document.getElementById('forecastMargin')?.value);
        return (v > 0 ? v : 15) / 100;
    }

    function renderTable() {
        const tbody = document.getElementById('googleAdsKwTableBody');
        if (!tbody) return;

        if (_rows.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-3">
                Brak fraz — wygeneruj z AI lub dodaj ręcznie.
            </td></tr>`;
            recalcSummary();
            return;
        }

        tbody.innerHTML = _rows.map((r, i) => `
            <tr data-idx="${i}">
                <td>
                    <input type="text" class="form-control form-control-sm kw-input" value="${escHtml(r.keyword)}"
                        data-field="keyword" data-idx="${i}">
                </td>
                <td style="width:120px">
                    <input type="number" class="form-control form-control-sm kw-input" value="${r.monthly_searches ?? ''}"
                        data-field="monthly_searches" data-idx="${i}" min="0" step="10">
                </td>
                <td style="width:110px">
                    <input type="number" class="form-control form-control-sm kw-input" value="${r.cpc ?? ''}"
                        data-field="cpc" data-idx="${i}" min="0" step="0.01">
                </td>
                <td style="width:140px">
                    <select class="form-select form-select-sm kw-input" data-field="intent" data-idx="${i}">
                        <option value="transakcyjna" ${r.intent === 'transakcyjna' ? 'selected' : ''}>transakcyjna</option>
                        <option value="komercyjna" ${r.intent === 'komercyjna' ? 'selected' : ''}>komercyjna</option>
                        <option value="informacyjna" ${r.intent === 'informacyjna' ? 'selected' : ''}>informacyjna</option>
                    </select>
                </td>
                <td style="width:50px">
                    <button class="btn btn-sm btn-outline-danger kw-remove" data-idx="${i}" title="Usuń">
                        <i class="bi bi-x-lg"></i>
                    </button>
                </td>
            </tr>
        `).join('');

        recalcSummary();
    }

    function escHtml(s) {
        return String(s || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    function recalcSummary() {
        const ctr = (parseFloat(document.getElementById('googleAdsCtr')?.value) || 4) / 100;
        const safety = parseFloat(document.getElementById('googleAdsSafety')?.value) || 1.2;

        const withCpc = _rows.filter(r => r.cpc != null && r.cpc > 0);
        const withVol = _rows.filter(r => r.monthly_searches != null && r.monthly_searches > 0);

        let weightedCpc = 0;
        if (withCpc.length) {
            const volCpc = withCpc.filter(r => r.monthly_searches > 0);
            if (volCpc.length) {
                const sumVolCpc = volCpc.reduce((s, r) => s + r.cpc * r.monthly_searches, 0);
                const sumVol = volCpc.reduce((s, r) => s + r.monthly_searches, 0);
                weightedCpc = sumVolCpc / sumVol;
            } else {
                weightedCpc = withCpc.reduce((s, r) => s + r.cpc, 0) / withCpc.length;
            }
        }

        const totalVolume = withVol.reduce((s, r) => s + r.monthly_searches, 0);
        let targetClicks = totalVolume * ctr;

        const manualClicks = parseFloat(document.getElementById('googleAdsManualClicks')?.value);
        if (manualClicks > 0) targetClicks = manualClicks;

        const rawBudget = weightedCpc > 0 ? weightedCpc * targetClicks * safety : 0;
        const suggestedBudget = Math.max(Math.round(rawBudget / 100) * 100, rawBudget > 0 ? 3000 : 0);

        const clicks = weightedCpc > 0 ? suggestedBudget / weightedCpc : 0;
        const cvr = readCvr();
        const aov = readAov();
        const margin = readMargin();

        const searchConversions = clicks * cvr;
        const searchRevenue = searchConversions * aov;

        if (!window.GoogleAdsCompute) {
            console.error('GoogleAdsCompute module not loaded — pomijam przeliczenie planera.');
            return;
        }

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

    function onTableInput(e) {
        const el = e.target;
        if (!el.classList.contains('kw-input')) return;
        const idx = parseInt(el.dataset.idx, 10);
        const field = el.dataset.field;
        if (isNaN(idx) || !_rows[idx]) return;

        if (field === 'keyword' || field === 'intent') {
            _rows[idx][field] = el.value;
        } else {
            const v = parseFloat(el.value);
            _rows[idx][field] = isNaN(v) ? null : v;
        }

        saveState();
        recalcSummary();
    }

    function onTableClick(e) {
        const btn = e.target.closest('.kw-remove');
        if (!btn) return;
        const idx = parseInt(btn.dataset.idx, 10);
        if (!isNaN(idx)) {
            _rows.splice(idx, 1);
            saveState();
            renderTable();
        }
    }

    function addRow() {
        _rows.push({ keyword: '', monthly_searches: null, cpc: null, intent: 'transakcyjna', source: 'manual' });
        saveState();
        renderTable();
        const tbody = document.getElementById('googleAdsKwTableBody');
        const lastInput = tbody?.querySelector('tr:last-child input[data-field="keyword"]');
        if (lastInput) lastInput.focus();
    }

    function clearAll() {
        if (!confirm('Usunąć wszystkie frazy z tabeli?')) return;
        _rows = [];
        saveState();
        renderTable();
    }

    async function generateKeywords() {
        syncBusinessDescriptionDisplay();
        const description = resolveBusinessDescription();
        if (!description) {
            alert('Najpierw wygeneruj Brief AI u góry strony (Parametry wyceny → Brief AI).');
            return;
        }

        const domain = (document.getElementById('quoteName')?.value || '').trim();
        const btn = document.getElementById('googleAdsGenerateKwBtn');
        const origHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Generuję...';

        try {
            const resp = await fetch('/api/keywords/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ domain, description }),
            });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.error || 'Błąd API');

            const keywords = data.keywords || [];
            keywords.forEach(kw => {
                if (_rows.some(r => r.keyword.toLowerCase() === kw.toLowerCase())) return;
                _rows.push({ keyword: kw, monthly_searches: null, cpc: null, intent: 'transakcyjna', source: 'ai' });
            });

            saveState();
            renderTable();

            if (window.showAlert) window.showAlert(`Dodano ${keywords.length} fraz z AI`, 'success');
        } catch (e) {
            console.error('Google Ads KW generate error:', e);
            if (window.showAlert) window.showAlert(e.message, 'danger');
        } finally {
            btn.disabled = false;
            btn.innerHTML = origHtml;
        }
    }

    async function enrichKeywords() {
        if (!_rows.length) {
            alert('Najpierw dodaj frazy (wygeneruj z AI lub dodaj ręcznie).');
            return;
        }
        const toEnrich = _rows.filter(r => r.keyword.trim() && (r.cpc == null || r.cpc === 0));
        if (!toEnrich.length) {
            alert('Wszystkie frazy mają już CPC — nie ma czego wzbogacać.');
            return;
        }

        const btn = document.getElementById('googleAdsEnrichBtn');
        const origHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Pobieram z Ahrefs...';

        try {
            const usdPln = parseFloat(document.getElementById('googleAdsUsdPln')?.value) || 3.64;
            const resp = await fetch('/api/keywords/enrich', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ keywords: toEnrich.map(r => r.keyword), usd_pln_rate: usdPln }),
            });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.error || 'Błąd API');

            const enriched = data.keywords || [];
            const warnings = data.warnings || [];

            const map = {};
            enriched.forEach(e => { map[e.keyword.toLowerCase()] = e; });

            _rows.forEach(r => {
                const match = map[r.keyword.toLowerCase()];
                if (!match) return;
                if (match.cpc != null) r.cpc = match.cpc;
                if (match.monthly_searches != null) r.monthly_searches = match.monthly_searches;
                if (match.difficulty != null) r.difficulty = match.difficulty;
                if (match.intent) r.intent = match.intent;
                if (match.source) r.source = match.source;
            });

            saveState();
            renderTable();

            if (warnings.length && window.showAlert) {
                window.showAlert(warnings.join(' '), 'warning');
            } else if (window.showAlert) {
                window.showAlert('Dane z Ahrefs zaktualizowane', 'success');
            }
        } catch (e) {
            console.error('Google Ads enrich error:', e);
            if (window.showAlert) window.showAlert(e.message, 'danger');
        } finally {
            btn.disabled = false;
            btn.innerHTML = origHtml;
        }
    }

    function autofillDescription() { /* legacy noop — opis z Brief AI */ }

    function bindPersistListeners() {
        const persistIds = [
            'googleAdsCtr', 'googleAdsSafety',
            'googleAdsManualClicks', 'googleAdsUsdPln', 'googleAdsMediaBudget',
            'googleAdsProductEnabled', 'googleAdsProductRevenue', 'googleAdsProductRoas',
            'googleAdsProductCpc', 'googleAdsProductCvr',
        ];
        persistIds.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('input', () => {
                saveState();
                if (id !== 'googleAdsMediaBudget') recalcSummary();
            });
            el.addEventListener('change', saveState);
        });
    }

    async function init() {
        const tbody = document.getElementById('googleAdsKwTableBody');
        if (!tbody) return;

        await loadStateFromDb();

        tbody.addEventListener('input', onTableInput);
        tbody.addEventListener('change', onTableInput);
        tbody.addEventListener('click', onTableClick);

        document.getElementById('googleAdsAddRowBtn')?.addEventListener('click', addRow);
        document.getElementById('googleAdsClearKwBtn')?.addEventListener('click', clearAll);
        document.getElementById('googleAdsGenerateKwBtn')?.addEventListener('click', generateKeywords);
        document.getElementById('googleAdsEnrichBtn')?.addEventListener('click', enrichKeywords);

        bindPersistListeners();
        syncBusinessDescriptionDisplay();
        renderTable();
    }

    window.reloadGoogleAdsPlanner = loadStateFromDb;

    window.addEventListener('quoteReady', () => {
        syncBusinessDescriptionDisplay();
        if (!_loadedFromDb) loadStateFromDb().then(() => renderTable());
    });

    window.addEventListener('brandBriefUpdated', syncBusinessDescriptionDisplay);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
