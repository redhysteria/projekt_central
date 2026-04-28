/**
 * Moduł estymacji 12-miesięcznej (ruch + ROI).
 *
 * Zależności:
 *   - Chart.js v4 (CDN)
 *   - seo_analysis.js (currentQuoteId, dane SEO)
 */

let _forecastSeoResults = [];
let _forecastAverages = {};
let _forecastQuoteName = '';
let _trafficChart = null;
let _roiChart = null;
let _prophetForecast = null;
let _prophetEnabled = false;

let _top10Chart = null;
let _top3Chart = null;
let _trafficSenutoChart = null;
let _trafficGA4Chart = null;
let _revenueChart = null;
let _domainCharts = {};

const MONTH_LABELS = ['Sty','Lut','Mar','Kwi','Maj','Cze','Lip','Sie','Wrz','Paź','Lis','Gru'];
const CONTENT_RAMP = [0, 0.10, 0.50, 0.80, 1.00];

// ---------------------------------------------------------------------------
// Inicjalizacja sekcji estymacji (wywoływana z seo_analysis.js)
// ---------------------------------------------------------------------------
function initEstimationSection(seoResults, averages, quoteName) {
    _forecastSeoResults = seoResults || [];
    _forecastAverages = averages || {};
    _forecastQuoteName = quoteName || '';

    if (!_forecastSeoResults.length) return;

    const section = document.getElementById('estimationSection');
    if (!section) return;
    section.classList.remove('d-none');

    populateDomainDropdowns();
    setupProphetToggle();
    renderDomainComparisonCharts(_forecastSeoResults);
    loadSavedForecast();
    updateEfficiencyPreview();
}

// ---------------------------------------------------------------------------
// Wypełnij dropdowny klient / lider
// ---------------------------------------------------------------------------
function populateDomainDropdowns() {
    const clientSelect = document.getElementById('forecastClientDomain');
    const leaderSelect = document.getElementById('forecastLeaderDomain');
    if (!clientSelect || !leaderSelect) return;

    clientSelect.innerHTML = '';
    leaderSelect.innerHTML = '';

    const clientDomainGuess = extractClientDomain(_forecastQuoteName);

    _forecastSeoResults.forEach(r => {
        const opt1 = new Option(r.domain, r.domain);
        const opt2 = new Option(r.domain, r.domain);
        clientSelect.add(opt1);
        leaderSelect.add(opt2);
    });

    if (clientDomainGuess) {
        const match = _forecastSeoResults.find(
            r => r.domain.toLowerCase() === clientDomainGuess.toLowerCase()
        );
        if (match) clientSelect.value = match.domain;
    }

    autoSelectLeader();
}

function extractClientDomain(name) {
    if (!name) return null;
    const m = name.toLowerCase().match(/[a-z0-9]([a-z0-9-]*[a-z0-9])?\.[a-z]{2,}(\.[a-z]{2,})?/);
    return m ? m[0] : null;
}

function autoSelectLeader() {
    const clientSelect = document.getElementById('forecastClientDomain');
    const leaderSelect = document.getElementById('forecastLeaderDomain');
    if (!clientSelect || !leaderSelect) return;

    const clientDomain = clientSelect.value;
    let best = null;
    let bestTraffic = -1;
    _forecastSeoResults.forEach(r => {
        if (r.domain !== clientDomain && (r.estimated_traffic || 0) > bestTraffic) {
            bestTraffic = r.estimated_traffic || 0;
            best = r.domain;
        }
    });
    if (best) leaderSelect.value = best;
}

// ---------------------------------------------------------------------------
// Sezonowość z Ahrefs
// ---------------------------------------------------------------------------
async function loadSeasonalityFromAhrefs() {
    const leaderDomain = document.getElementById('forecastLeaderDomain').value;
    if (!leaderDomain) {
        alert('Wybierz lidera rynku');
        return;
    }
    const btn = document.getElementById('loadSeasonalityBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Pobieram...';

    try {
        const resp = await fetch(
            `/api/quotes/${currentQuoteId}/forecast/seasonality?leader=${encodeURIComponent(leaderDomain)}`
        );
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Błąd API');

        const s = data.seasonality || [];
        for (let i = 0; i < 12; i++) {
            const el = document.getElementById(`season${i}`);
            if (el) el.value = (s[i] || 1).toFixed(2);
        }
        if (window.showAlert) {
            window.showAlert(`Sezonowość wczytana z Ahrefs (${leaderDomain})`, 'success');
        }
    } catch (e) {
        console.error('Błąd sezonowości:', e);
        if (window.showAlert) window.showAlert(e.message, 'danger');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-cloud-download"></i> Wczytaj sezonowość z Ahrefs';
    }
}

// ---------------------------------------------------------------------------
// GA4 Upload + Prophet
// ---------------------------------------------------------------------------
async function uploadGA4CSV() {
    const fileInput = document.getElementById('ga4FileInput');
    if (!fileInput || !fileInput.files.length) {
        alert('Wybierz plik CSV z GA4');
        return;
    }
    const statusEl = document.getElementById('ga4Status');
    statusEl.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Przetwarzam...';

    const formData = new FormData();
    formData.append('file', fileInput.files[0]);

    try {
        const resp = await fetch(`/api/quotes/${currentQuoteId}/forecast/ga4-upload`, {
            method: 'POST',
            body: formData,
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Błąd uploadu');

        _prophetForecast = {
            forecast: data.prophet_forecast || [],
            seasonality: data.seasonality || [],
            ga4_metrics: data.ga4_metrics || {},
        };

        statusEl.innerHTML = `<span class="text-success">&#10003;</span> ${data.filename} (${data.data_months} mc danych → ${data.forecast_months} mc prognozy)`;

        const toggle = document.getElementById('useProphetToggle');
        toggle.disabled = false;
        toggle.checked = true;
        _prophetEnabled = true;

        document.getElementById('removeGA4Btn').classList.remove('d-none');

        if (data.seasonality && data.seasonality.length === 12) {
            for (let i = 0; i < 12; i++) {
                const el = document.getElementById(`season${i}`);
                if (el) el.value = (data.seasonality[i] || 1).toFixed(2);
            }
        }

        if (data.ga4_metrics) {
            if (data.ga4_metrics.avg_conversion_rate) {
                document.getElementById('forecastConversionRate').value =
                    Math.round(data.ga4_metrics.avg_conversion_rate * 10000) / 100;
            }
            if (data.ga4_metrics.avg_aov) {
                document.getElementById('forecastAov').value = Math.round(data.ga4_metrics.avg_aov);
            }
        }

        if (window.showAlert) window.showAlert('GA4 + Prophet: dane przetworzone', 'success');
        runForecast();
    } catch (e) {
        statusEl.innerHTML = `<span class="text-danger">Błąd: ${e.message}</span>`;
        console.error('GA4 upload error:', e);
    }
}

async function removeGA4Data() {
    if (!currentQuoteId) return;
    try {
        await fetch(`/api/quotes/${currentQuoteId}/forecast/ga4-upload`, { method: 'DELETE' });
    } catch (e) { /* ignore */ }

    _prophetForecast = null;
    _prophetEnabled = false;

    const toggle = document.getElementById('useProphetToggle');
    toggle.disabled = true;
    toggle.checked = false;
    document.getElementById('removeGA4Btn').classList.add('d-none');
    document.getElementById('ga4Status').innerHTML = '';
    document.getElementById('ga4FileInput').value = '';

    if (window.showAlert) window.showAlert('Dane GA4 usunięte', 'info');
    runForecast();
}

function setupProphetToggle() {
    const toggle = document.getElementById('useProphetToggle');
    if (toggle) {
        toggle.addEventListener('change', () => {
            _prophetEnabled = toggle.checked;
            runForecast();
        });
    }
}

// ---------------------------------------------------------------------------
// Odczyt inputów
// ---------------------------------------------------------------------------
function readSeasonality() {
    const s = [];
    for (let i = 0; i < 12; i++) {
        const el = document.getElementById(`season${i}`);
        s.push(parseFloat(el?.value) || 1.0);
    }
    return s;
}

function getClientResult() {
    const domain = document.getElementById('forecastClientDomain')?.value;
    return _forecastSeoResults.find(r => r.domain === domain) || null;
}

function getCompetitorResults() {
    const clientDomain = document.getElementById('forecastClientDomain')?.value;
    return _forecastSeoResults.filter(r => r.domain !== clientDomain);
}

// ---------------------------------------------------------------------------
// Kalkulacja (klient-side, mirror forecast_logic.py)
// ---------------------------------------------------------------------------
function calculateForecast() {
    const client = getClientResult();
    if (!client) return null;

    const competitors = getCompetitorResults();
    const clientRD = client.referring_domains || 0;

    let avgCompetitorRD = 0;
    if (competitors.length) {
        avgCompetitorRD = competitors.reduce((s, c) => s + (c.referring_domains || 0), 0) / competitors.length;
    }

    const conversionRate = (parseFloat(document.getElementById('forecastConversionRate')?.value) || 0) / 100;
    const aov = parseFloat(document.getElementById('forecastAov')?.value) || 0;
    const margin = (parseFloat(document.getElementById('forecastMargin')?.value) || 0) / 100;
    const fixedSeoBudget = parseFloat(document.getElementById('forecastSeoBudget')?.value) || 0;
    const monthlyContentVolume = parseInt(document.getElementById('forecastContentVolume')?.value) || 0;
    const seasonality = readSeasonality();

    const rawAvgKwPerUrl = client.avg_kw_per_url || _forecastAverages.avg_kw_per_url || 0;
    const rawAvgTrafficPerKw = client.avg_traffic_per_kw || _forecastAverages.avg_traffic_per_kw || 0;
    const kwPerUrlPct = (parseFloat(document.getElementById('forecastKwPerUrlPct')?.value) || 100) / 100;
    const trafficPerKwPct = (parseFloat(document.getElementById('forecastTrafficPerKwPct')?.value) || 100) / 100;
    const avgKwPerUrl = rawAvgKwPerUrl * kwPerUrlPct;
    const avgTrafficPerKw = rawAvgTrafficPerKw * trafficPerKwPct;

    const kwValEl = document.getElementById('forecastKwPerUrlVal');
    const trValEl = document.getElementById('forecastTrafficPerKwVal');
    if (kwValEl) kwValEl.textContent = avgKwPerUrl.toFixed(1);
    if (trValEl) trValEl.textContent = avgTrafficPerKw.toFixed(1);

    const domainGap = avgCompetitorRD - clientRD;

    const lbRateInput = document.getElementById('forecastLbRate')?.value;
    const lbCostInput = document.getElementById('forecastLbCost')?.value;

    const autoLBRate = domainGap <= 0 ? 0.005 : Math.min((domainGap / 12) / 100, 0.02);
    const autoLBCost = domainGap > 0 ? (domainGap / 12) * 400 : 0;

    const monthlyLBRate = (lbRateInput !== '' && lbRateInput != null)
        ? parseFloat(lbRateInput) / 100
        : autoLBRate;
    const monthlyLBCost = (lbCostInput !== '' && lbCostInput != null)
        ? parseFloat(lbCostInput)
        : autoLBCost;
    const maxBatchTraffic = monthlyContentVolume * avgKwPerUrl * avgTrafficPerKw;

    const now = new Date();
    const currentMonthIdx = now.getMonth();
    const currentSeason = seasonality[currentMonthIdx] > 0 ? seasonality[currentMonthIdx] : 1;
    let baseTraffic = (client.estimated_traffic || 0) / currentSeason;
    const baseInitial = baseTraffic;

    const clientTop10 = client.top10_keywords || 0;
    const clientTop3 = client.top3_keywords || 0;
    let top10Base = clientTop10;
    let top3Base = clientTop3;

    const useProphet = _prophetEnabled && _prophetForecast && _prophetForecast.forecast && _prophetForecast.forecast.length >= 12;

    const rows = [];
    let cumNet = 0;
    let breakEvenMonth = null;

    const NO_EFFECT_MONTHS = 2;

    for (let i = 1; i <= 12; i++) {
        const seasonIdx = (currentMonthIdx + i) % 12;
        const seasonMul = seasonality[seasonIdx];
        const noSeoTraffic = Math.round(baseInitial * seasonMul);
        const noSeoRevenue = Math.round(noSeoTraffic * conversionRate * aov);

        let prophetBaseline = null;
        if (useProphet) {
            prophetBaseline = _prophetForecast.forecast[i - 1].yhat;
        }

        if (i <= NO_EFFECT_MONTHS) {
            let effTraffic = noSeoTraffic;
            let effLower = noSeoTraffic;
            let effUpper = noSeoTraffic;
            if (useProphet) {
                effTraffic = Math.round(prophetBaseline);
                effLower = effTraffic;
                effUpper = effTraffic;
            }

            const orders = effTraffic * conversionRate;
            const revenue = orders * aov;
            const gross = revenue * margin;
            const totalCost = fixedSeoBudget + monthlyLBCost;
            const net = gross - totalCost;
            cumNet += net;
            if (breakEvenMonth === null && cumNet > 0) breakEvenMonth = i;

            rows.push({
                month: i,
                monthLabel: MONTH_LABELS[seasonIdx],
                baseLB: Math.round(baseInitial),
                content: 0,
                pureTraffic: Math.round(baseInitial),
                seasonalityMul: seasonMul,
                baseInitial: Math.round(baseInitial),
                finalTraffic: effTraffic,
                trafficLower: effLower,
                trafficUpper: effUpper,
                prophetBaseline: prophetBaseline != null ? Math.round(prophetBaseline) : null,
                top10: clientTop10,
                top3: clientTop3,
                noSeoTraffic,
                noSeoRevenue,
                totalCost: Math.round(totalCost),
                revenue: Math.round(revenue),
                gross: Math.round(gross),
                net: Math.round(net),
                cumNet: Math.round(cumNet),
            });
            continue;
        }

        const effectiveI = i - NO_EFFECT_MONTHS;

        baseTraffic *= (1 + monthlyLBRate);
        top10Base *= (1 + monthlyLBRate);
        top3Base *= (1 + monthlyLBRate * 0.6);

        let contentTraffic = 0;
        let contentKw = 0;
        for (let j = 1; j <= effectiveI; j++) {
            const age = effectiveI - j;
            contentTraffic += maxBatchTraffic * CONTENT_RAMP[Math.min(age, 4)];
            contentKw += monthlyContentVolume * avgKwPerUrl * CONTENT_RAMP[Math.min(age, 4)];
        }

        const top10Val = Math.round(top10Base + contentKw);
        const top3Val = Math.round(top3Base + contentKw * 0.3);

        const pureTraffic = baseTraffic + contentTraffic;
        let finalTraffic, trafficLower, trafficUpper;

        const MAX_GROWTH_FACTOR = 3;
        const maxIntervention = baseInitial * MAX_GROWTH_FACTOR;
        let rawIntervention = (baseTraffic - baseInitial) + contentTraffic;
        const intervention = Math.min(rawIntervention, maxIntervention);

        if (useProphet) {
            const pRow = _prophetForecast.forecast[i - 1];
            finalTraffic = Math.round(pRow.yhat + intervention);
            trafficLower = Math.round(pRow.yhat_lower + intervention);
            trafficUpper = Math.round(pRow.yhat_upper + intervention);
        } else {
            const cappedPure = baseInitial + intervention;
            finalTraffic = Math.round(cappedPure * seasonMul);
            trafficLower = finalTraffic;
            trafficUpper = finalTraffic;
        }

        const orders = finalTraffic * conversionRate;
        const revenue = orders * aov;
        const gross = revenue * margin;
        const totalCost = fixedSeoBudget + monthlyLBCost;
        const net = gross - totalCost;
        cumNet += net;

        if (breakEvenMonth === null && cumNet > 0) breakEvenMonth = i;

        rows.push({
            month: i,
            monthLabel: MONTH_LABELS[seasonIdx],
            baseLB: Math.round(baseTraffic),
            content: Math.round(contentTraffic),
            pureTraffic: Math.round(pureTraffic),
            seasonalityMul: seasonMul,
            baseInitial: Math.round(baseInitial),
            finalTraffic,
            trafficLower,
            trafficUpper,
            prophetBaseline: prophetBaseline != null ? Math.round(prophetBaseline) : null,
            top10: top10Val,
            top3: top3Val,
            noSeoTraffic,
            noSeoRevenue,
            totalCost: Math.round(totalCost),
            revenue: Math.round(revenue),
            gross: Math.round(gross),
            net: Math.round(net),
            cumNet: Math.round(cumNet),
        });
    }

    return {
        domainGap: Math.round(domainGap),
        monthlyLBRate: (monthlyLBRate * 100).toFixed(2),
        monthlyLBCost: Math.round(monthlyLBCost),
        autoLBRate: (autoLBRate * 100).toFixed(2),
        autoLBCost: Math.round(autoLBCost),
        lbRateOverridden: lbRateInput !== '' && lbRateInput != null,
        lbCostOverridden: lbCostInput !== '' && lbCostInput != null,
        maxBatchTraffic: Math.round(maxBatchTraffic),
        breakEvenMonth,
        rows,
        useProphet,
        clientTop10,
        clientTop3,
        conversionRate,
        aov,
    };
}

// ---------------------------------------------------------------------------
// Uruchom przeliczenie i rendering
// ---------------------------------------------------------------------------
function runForecast() {
    const result = calculateForecast();
    if (!result) {
        if (window.showAlert) window.showAlert('Wybierz domenę klienta', 'warning');
        return;
    }
    renderForecastSummary(result);
    renderForecastTable(result);
    renderTrafficChart(result);
    renderRoiChart(result);
    renderAllScenarioCharts(result);
    renderDomainComparisonCharts(_forecastSeoResults);
    saveForecast();
}

// ---------------------------------------------------------------------------
// Podsumowanie
// ---------------------------------------------------------------------------
function renderForecastSummary(result) {
    const el = document.getElementById('forecastSummary');
    if (!el) return;
    el.classList.remove('d-none');

    const beText = result.breakEvenMonth
        ? `<span class="text-success fw-bold">Miesiąc ${result.breakEvenMonth}</span>`
        : '<span class="text-danger">nie w ciągu 12 mc</span>';

    const lbRateLabel = result.lbRateOverridden ? '(ręcznie)' : '(auto)';
    const lbCostLabel = result.lbCostOverridden ? '(ręcznie)' : '(auto)';

    const modeLabel = result.useProphet
        ? '<span class="badge bg-info">Prophet + SEO</span>'
        : '<span class="badge bg-secondary">Deterministyczny</span>';

    el.innerHTML = `
        ${modeLabel}
        <strong>Domain Gap:</strong> ${result.domainGap} RD |
        <strong>LB rate:</strong> ${result.monthlyLBRate}% / mc ${lbRateLabel} |
        <strong>LB koszt:</strong> ${fmt(result.monthlyLBCost)} zł / mc ${lbCostLabel} |
        <strong>Max batch traffic:</strong> ${fmt(result.maxBatchTraffic)} |
        <strong>Break-even:</strong> ${beText}
    `;

    updateLbPlaceholders(result);
}

function updateLbPlaceholders(result) {
    const rateEl = document.getElementById('forecastLbRate');
    const costEl = document.getElementById('forecastLbCost');
    if (rateEl) rateEl.placeholder = `auto: ${result.autoLBRate}%`;
    if (costEl) costEl.placeholder = `auto: ${fmt(result.autoLBCost)} zł`;
}

// ---------------------------------------------------------------------------
// Tabela 12 miesięcy
// ---------------------------------------------------------------------------
function renderForecastTable(result) {
    const tbody = document.querySelector('#forecastTable tbody');
    const tfoot = document.getElementById('forecastTotalsRow');
    if (!tbody || !tfoot) return;

    tbody.innerHTML = '';
    tfoot.innerHTML = '';

    let sumCost = 0, sumRevenue = 0, sumGross = 0, sumNet = 0;

    result.rows.forEach(r => {
        sumCost += r.totalCost;
        sumRevenue += r.revenue;
        sumGross += r.gross;
        sumNet += r.net;

        const cls = (result.breakEvenMonth === r.month) ? 'table-success' : '';
        const tr = document.createElement('tr');
        tr.className = cls;

        let trafficCell = fmt(r.finalTraffic);
        if (result.useProphet && r.trafficLower !== r.finalTraffic) {
            trafficCell = `${fmt(r.trafficLower)} / <strong>${fmt(r.finalTraffic)}</strong> / ${fmt(r.trafficUpper)}`;
        }

        tr.innerHTML = `
            <td>${r.month} (${r.monthLabel})</td>
            <td>${fmt(r.baseLB)}</td>
            <td>${fmt(r.content)}</td>
            <td>${trafficCell}</td>
            <td>${fmt(r.totalCost)} zł</td>
            <td>${fmt(r.revenue)} zł</td>
            <td>${fmt(r.gross)} zł</td>
            <td class="${r.net >= 0 ? 'text-success' : 'text-danger'}">${fmt(r.net)} zł</td>
            <td class="${r.cumNet >= 0 ? 'text-success' : 'text-danger'}">${fmt(r.cumNet)} zł</td>
        `;
        tbody.appendChild(tr);
    });

    tfoot.innerHTML = `
        <td>SUMA</td><td></td><td></td><td></td>
        <td>${fmt(sumCost)} zł</td>
        <td>${fmt(sumRevenue)} zł</td>
        <td>${fmt(sumGross)} zł</td>
        <td class="${sumNet >= 0 ? 'text-success' : 'text-danger'}">${fmt(sumNet)} zł</td>
        <td></td>
    `;
}

function fmt(v) {
    if (v == null) return '0';
    return Number(v).toLocaleString('pl-PL');
}

// ---------------------------------------------------------------------------
// Wykres 1: Traffic Forecast (stacked bar + line / 3 scenariusze Prophet)
// ---------------------------------------------------------------------------
function renderTrafficChart(result) {
    const canvas = document.getElementById('trafficForecastChart');
    if (!canvas) return;
    if (_trafficChart) _trafficChart.destroy();

    const labels = result.rows.map(r => `${r.month} (${r.monthLabel})`);

    let datasets;

    if (result.useProphet) {
        datasets = [
            {
                label: 'Baseline Prophet (bez SEO)',
                data: result.rows.map(r => r.prophetBaseline),
                type: 'line',
                borderColor: 'rgba(150,150,150,0.8)',
                backgroundColor: 'rgba(150,150,150,0.05)',
                borderDash: [5, 5],
                tension: 0.3,
                fill: false,
                pointRadius: 2,
                order: 4,
            },
            {
                label: 'Pesymistyczny (Prophet lower + SEO)',
                data: result.rows.map(r => r.trafficLower),
                type: 'line',
                borderColor: 'rgba(255,99,132,0.8)',
                backgroundColor: 'rgba(255,99,132,0.05)',
                tension: 0.3,
                fill: false,
                pointRadius: 2,
                order: 3,
            },
            {
                label: 'Realistyczny (Prophet + SEO)',
                data: result.rows.map(r => r.finalTraffic),
                type: 'line',
                borderColor: 'rgba(75,192,192,1)',
                backgroundColor: 'rgba(75,192,192,0.15)',
                tension: 0.3,
                fill: '-1',
                pointRadius: 4,
                borderWidth: 3,
                order: 1,
            },
            {
                label: 'Optymistyczny (Prophet upper + SEO)',
                data: result.rows.map(r => r.trafficUpper),
                type: 'line',
                borderColor: 'rgba(54,162,235,0.8)',
                backgroundColor: 'rgba(54,162,235,0.05)',
                tension: 0.3,
                fill: '-1',
                pointRadius: 2,
                order: 2,
            },
        ];
    } else {
        datasets = [
            {
                label: 'Ruch bazowy',
                data: result.rows.map(r => Math.round(r.baseInitial * r.seasonalityMul)),
                backgroundColor: 'rgba(54,162,235,0.7)',
                stack: 'traffic',
                order: 2,
            },
            {
                label: 'Wzrost z Link Buildingu',
                data: result.rows.map(r => Math.round((r.baseLB - r.baseInitial) * r.seasonalityMul)),
                backgroundColor: 'rgba(153,102,255,0.7)',
                stack: 'traffic',
                order: 2,
            },
            {
                label: 'Wzrost z contentu',
                data: result.rows.map(r => Math.round(r.content * r.seasonalityMul)),
                backgroundColor: 'rgba(75,192,192,0.7)',
                stack: 'traffic',
                order: 2,
            },
            {
                label: 'Ruch końcowy (sezonowy)',
                data: result.rows.map(r => r.finalTraffic),
                type: 'line',
                borderColor: 'rgba(255,159,64,1)',
                backgroundColor: 'rgba(255,159,64,0.1)',
                tension: 0.3,
                fill: false,
                pointRadius: 4,
                order: 1,
            },
        ];
    }

    _trafficChart = new Chart(canvas, {
        type: result.useProphet ? 'line' : 'bar',
        data: { labels, datasets },
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: result.useProphet ? 'Prognoza ruchu — Prophet + SEO (3 scenariusze)' : 'Prognoza ruchu (12 mc)',
                    color: '#ccc',
                },
                legend: { labels: { color: '#ccc' } },
            },
            scales: {
                x: { ticks: { color: '#aaa' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                y: { ticks: { color: '#aaa' }, grid: { color: 'rgba(255,255,255,0.05)' }, beginAtZero: true },
            },
        },
    });
}

// ---------------------------------------------------------------------------
// Wykres 2: ROI — kumulatywne koszty vs marża brutto
// ---------------------------------------------------------------------------
function renderRoiChart(result) {
    const canvas = document.getElementById('roiChart');
    if (!canvas) return;
    if (_roiChart) _roiChart.destroy();

    const labels = result.rows.map(r => `${r.month} (${r.monthLabel})`);

    let cumCost = 0;
    let cumGross = 0;
    const cumCosts = [];
    const cumGrosses = [];
    result.rows.forEach(r => {
        cumCost += r.totalCost;
        cumGross += r.gross;
        cumCosts.push(cumCost);
        cumGrosses.push(cumGross);
    });

    _roiChart = new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Łączne wydatki na SEO',
                    data: cumCosts,
                    borderColor: 'rgba(255,99,132,1)',
                    backgroundColor: 'rgba(255,99,132,0.1)',
                    tension: 0.3,
                    fill: true,
                },
                {
                    label: 'Łączny zysk ze sprzedaży',
                    data: cumGrosses,
                    borderColor: 'rgba(75,192,192,1)',
                    backgroundColor: 'rgba(75,192,192,0.1)',
                    tension: 0.3,
                    fill: true,
                },
            ],
        },
        options: {
            responsive: true,
            plugins: {
                title: { display: true, text: 'Zwrot z inwestycji — wydatki SEO vs zysk ze sprzedaży', color: '#ccc' },
                legend: { labels: { color: '#ccc' } },
            },
            scales: {
                x: { ticks: { color: '#aaa' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                y: { ticks: { color: '#aaa' }, grid: { color: 'rgba(255,255,255,0.05)' }, beginAtZero: true },
            },
        },
    });
}

// ---------------------------------------------------------------------------
// Zapis / odczyt
// ---------------------------------------------------------------------------
async function saveForecast() {
    if (!currentQuoteId) return;

    const result = calculateForecast();
    const lbRateVal = document.getElementById('forecastLbRate')?.value;
    const lbCostVal = document.getElementById('forecastLbCost')?.value;
    const payload = {
        client_domain: document.getElementById('forecastClientDomain')?.value || '',
        leader_domain: document.getElementById('forecastLeaderDomain')?.value || '',
        conversion_rate: parseFloat(document.getElementById('forecastConversionRate')?.value) || 0,
        aov: parseFloat(document.getElementById('forecastAov')?.value) || 0,
        margin: parseFloat(document.getElementById('forecastMargin')?.value) || 0,
        fixed_seo_budget: parseFloat(document.getElementById('forecastSeoBudget')?.value) || 0,
        monthly_content_volume: parseInt(document.getElementById('forecastContentVolume')?.value) || 0,
        lb_rate_override: lbRateVal !== '' ? parseFloat(lbRateVal) : null,
        lb_cost_override: lbCostVal !== '' ? parseFloat(lbCostVal) : null,
        seasonality: readSeasonality(),
        variance_top: parseFloat(document.getElementById('forecastTopVariance')?.value) || 20,
        variance_traffic: parseFloat(document.getElementById('forecastTrafficVariance')?.value) || 30,
        variance_revenue: parseFloat(document.getElementById('forecastRevenueVariance')?.value) || 30,
        kw_per_url_pct: parseFloat(document.getElementById('forecastKwPerUrlPct')?.value) || 100,
        traffic_per_kw_pct: parseFloat(document.getElementById('forecastTrafficPerKwPct')?.value) || 100,
        forecast: result,
    };

    try {
        const resp = await fetch(`/api/quotes/${currentQuoteId}/forecast`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (resp.ok && window.showAlert) {
            window.showAlert('Estymacja zapisana', 'success');
        }
    } catch (e) {
        console.error('Błąd zapisu forecastu:', e);
    }
}

async function loadSavedForecast() {
    if (!currentQuoteId) return;

    try {
        const resp = await fetch(`/api/quotes/${currentQuoteId}/forecast`);
        const data = await resp.json();
        const fs = data.forecast_settings;
        if (!fs) return;

        if (fs.client_domain) {
            const el = document.getElementById('forecastClientDomain');
            if (el) el.value = fs.client_domain;
        }
        if (fs.leader_domain) {
            const el = document.getElementById('forecastLeaderDomain');
            if (el) el.value = fs.leader_domain;
        }
        if (fs.conversion_rate != null) {
            const cr = fs.conversion_rate < 1 ? Math.round(fs.conversion_rate * 10000) / 100 : fs.conversion_rate;
            document.getElementById('forecastConversionRate').value = cr;
        }
        if (fs.aov != null) document.getElementById('forecastAov').value = fs.aov;
        if (fs.margin != null) {
            const m = fs.margin < 1 ? Math.round(fs.margin * 10000) / 100 : fs.margin;
            document.getElementById('forecastMargin').value = m;
        }
        if (fs.fixed_seo_budget != null) document.getElementById('forecastSeoBudget').value = fs.fixed_seo_budget;
        if (fs.monthly_content_volume != null) document.getElementById('forecastContentVolume').value = fs.monthly_content_volume;
        if (fs.lb_rate_override != null) document.getElementById('forecastLbRate').value = fs.lb_rate_override;
        if (fs.lb_cost_override != null) document.getElementById('forecastLbCost').value = fs.lb_cost_override;

        if (fs.variance_top != null) document.getElementById('forecastTopVariance').value = fs.variance_top;
        if (fs.variance_traffic != null) document.getElementById('forecastTrafficVariance').value = fs.variance_traffic;
        if (fs.variance_revenue != null) document.getElementById('forecastRevenueVariance').value = fs.variance_revenue;
        if (fs.kw_per_url_pct != null) document.getElementById('forecastKwPerUrlPct').value = fs.kw_per_url_pct;
        if (fs.traffic_per_kw_pct != null) document.getElementById('forecastTrafficPerKwPct').value = fs.traffic_per_kw_pct;
        updateEfficiencyPreview();

        const s = fs.seasonality;
        if (s && Array.isArray(s) && s.length === 12) {
            for (let i = 0; i < 12; i++) {
                const el = document.getElementById(`season${i}`);
                if (el) el.value = parseFloat(s[i]).toFixed(2);
            }
        }

        if (fs.prophet_forecast && fs.prophet_forecast.length > 0) {
            _prophetForecast = {
                forecast: fs.prophet_forecast,
                seasonality: fs.ga4_seasonality || [],
            };
            const toggle = document.getElementById('useProphetToggle');
            if (toggle) {
                toggle.disabled = false;
                toggle.checked = true;
            }
            _prophetEnabled = true;
            document.getElementById('removeGA4Btn')?.classList.remove('d-none');
            const statusEl = document.getElementById('ga4Status');
            if (statusEl && fs.ga4_csv_filename) {
                statusEl.innerHTML = `<span class="text-success">&#10003;</span> ${fs.ga4_csv_filename}`;
            }
        }

        if (fs.forecast && fs.forecast.rows) {
            renderForecastSummary(fs.forecast);
            renderForecastTable(fs.forecast);
            renderTrafficChart(fs.forecast);
            renderRoiChart(fs.forecast);
            renderAllScenarioCharts(fs.forecast);
        }
    } catch (e) {
        console.error('Błąd ładowania forecastu:', e);
    }
}

// ---------------------------------------------------------------------------
// Variance inputs
// ---------------------------------------------------------------------------
function readVariances() {
    return {
        top: (parseFloat(document.getElementById('forecastTopVariance')?.value) || 10) / 100,
        traffic: (parseFloat(document.getElementById('forecastTrafficVariance')?.value) || 15) / 100,
        revenue: (parseFloat(document.getElementById('forecastRevenueVariance')?.value) || 15) / 100,
    };
}

// ---------------------------------------------------------------------------
// Shared Chart.js theme for scenario charts
// ---------------------------------------------------------------------------
const SCENARIO_COLORS = {
    pessimistic: { border: 'rgba(255,99,132,0.8)', bg: 'rgba(255,99,132,0.05)' },
    realistic:   { border: 'rgba(75,192,192,1)',   bg: 'rgba(75,192,192,0.15)' },
    optimistic:  { border: 'rgba(54,162,235,0.8)', bg: 'rgba(54,162,235,0.05)' },
    noSeo:       { border: 'rgba(150,150,150,0.8)', bg: 'rgba(150,150,150,0.05)' },
};

function makeScenarioDatasets(labels, data) {
    return [
        {
            label: 'Bez działań SEO',
            data: data.noSeo,
            borderColor: SCENARIO_COLORS.noSeo.border,
            backgroundColor: SCENARIO_COLORS.noSeo.bg,
            borderDash: [5, 5],
            tension: 0.3, fill: false, pointRadius: 2, order: 4,
        },
        {
            label: 'Pesymistyczny',
            data: data.pessimistic,
            borderColor: SCENARIO_COLORS.pessimistic.border,
            backgroundColor: SCENARIO_COLORS.pessimistic.bg,
            tension: 0.3, fill: false, pointRadius: 2, order: 3,
        },
        {
            label: 'Realistyczny',
            data: data.realistic,
            borderColor: SCENARIO_COLORS.realistic.border,
            backgroundColor: SCENARIO_COLORS.realistic.bg,
            tension: 0.3, fill: false, pointRadius: 4, borderWidth: 3, order: 1,
        },
        {
            label: 'Optymistyczny',
            data: data.optimistic,
            borderColor: SCENARIO_COLORS.optimistic.border,
            backgroundColor: SCENARIO_COLORS.optimistic.bg,
            tension: 0.3, fill: false, pointRadius: 2, order: 2,
        },
    ];
}

function scenarioChartOptions(titleText) {
    return {
        responsive: true,
        plugins: {
            title: { display: true, text: titleText, color: '#ccc' },
            legend: { labels: { color: '#ccc' } },
        },
        scales: {
            x: { ticks: { color: '#aaa' }, grid: { color: 'rgba(255,255,255,0.05)' } },
            y: { ticks: { color: '#aaa' }, grid: { color: 'rgba(255,255,255,0.05)' }, beginAtZero: true },
        },
    };
}

// ---------------------------------------------------------------------------
// Render all 5 scenario charts
// ---------------------------------------------------------------------------
function renderAllScenarioCharts(result) {
    const v = readVariances();
    renderTop10ScenarioChart(result, v.top);
    renderTop3ScenarioChart(result, v.top);
    renderTrafficSenutoChart(result, v.traffic);
    renderTrafficGA4Chart(result, v.traffic);
    renderRevenueScenarioChart(result, v.revenue);
}

// ---------------------------------------------------------------------------
// 1. Top 10 scenario chart
// ---------------------------------------------------------------------------
function renderTop10ScenarioChart(result, vTop) {
    const canvas = document.getElementById('chartTop10Forecast');
    if (!canvas) return;
    if (_top10Chart) _top10Chart.destroy();

    const labels = result.rows.map(r => `${r.month} (${r.monthLabel})`);
    const noSeoVal = result.clientTop10 || (result.rows.length ? result.rows[0].top10 : 0);

    _top10Chart = new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: makeScenarioDatasets(labels, {
                realistic:   result.rows.map(r => r.top10),
                pessimistic: result.rows.map(r => Math.round(r.top10 * (1 - vTop * r.month / 12))),
                optimistic:  result.rows.map(r => Math.round(r.top10 * (1 + vTop * r.month / 12))),
                noSeo:       result.rows.map(() => noSeoVal),
            }),
        },
        options: scenarioChartOptions('Prognoza Top 10 — słowa kluczowe (12 mc)'),
    });
}

// ---------------------------------------------------------------------------
// 2. Top 3 scenario chart
// ---------------------------------------------------------------------------
function renderTop3ScenarioChart(result, vTop) {
    const canvas = document.getElementById('chartTop3Forecast');
    if (!canvas) return;
    if (_top3Chart) _top3Chart.destroy();

    const labels = result.rows.map(r => `${r.month} (${r.monthLabel})`);
    const noSeoVal = result.clientTop3 || (result.rows.length ? result.rows[0].top3 : 0);

    _top3Chart = new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: makeScenarioDatasets(labels, {
                realistic:   result.rows.map(r => r.top3),
                pessimistic: result.rows.map(r => Math.round(r.top3 * (1 - vTop * r.month / 12))),
                optimistic:  result.rows.map(r => Math.round(r.top3 * (1 + vTop * r.month / 12))),
                noSeo:       result.rows.map(() => noSeoVal),
            }),
        },
        options: scenarioChartOptions('Prognoza Top 3 — słowa kluczowe (12 mc)'),
    });
}

// ---------------------------------------------------------------------------
// 3. Traffic with Senuto/Ahrefs seasonality
// ---------------------------------------------------------------------------
function renderTrafficSenutoChart(result, vTraffic) {
    const canvas = document.getElementById('chartTrafficSenuto');
    if (!canvas) return;
    if (_trafficSenutoChart) _trafficSenutoChart.destroy();

    const labels = result.rows.map(r => `${r.month} (${r.monthLabel})`);

    const senutoTraffic = result.rows.map(r => Math.round(r.pureTraffic * r.seasonalityMul));

    _trafficSenutoChart = new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: makeScenarioDatasets(labels, {
                realistic:   senutoTraffic,
                pessimistic: senutoTraffic.map((v, idx) => Math.round(v * (1 - vTraffic * (idx + 1) / 12))),
                optimistic:  senutoTraffic.map((v, idx) => Math.round(v * (1 + vTraffic * (idx + 1) / 12))),
                noSeo:       result.rows.map(r => r.noSeoTraffic),
            }),
        },
        options: scenarioChartOptions('Szacowany ruch z sezonowością Senuto/Ahrefs (12 mc)'),
    });
}

// ---------------------------------------------------------------------------
// 4. Traffic with GA4 / Prophet
// ---------------------------------------------------------------------------
function renderTrafficGA4Chart(result, vTraffic) {
    const canvas = document.getElementById('chartTrafficGA4');
    const placeholder = document.getElementById('chartTrafficGA4Placeholder');
    if (!canvas) return;

    if (_trafficGA4Chart) _trafficGA4Chart.destroy();

    if (!result.useProphet) {
        canvas.style.display = 'none';
        if (placeholder) {
            placeholder.classList.remove('d-none');
            placeholder.style.display = 'flex';
        }
        return;
    }

    canvas.style.display = '';
    if (placeholder) {
        placeholder.classList.add('d-none');
        placeholder.style.display = 'none';
    }

    const labels = result.rows.map(r => `${r.month} (${r.monthLabel})`);

    _trafficGA4Chart = new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: makeScenarioDatasets(labels, {
                realistic:   result.rows.map(r => r.finalTraffic),
                pessimistic: result.rows.map(r => r.trafficLower),
                optimistic:  result.rows.map(r => r.trafficUpper),
                noSeo:       result.rows.map(r => r.prophetBaseline || r.noSeoTraffic),
            }),
        },
        options: scenarioChartOptions('Szacowany ruch — GA4 + Prophet (12 mc)'),
    });
}

// ---------------------------------------------------------------------------
// 5. Revenue scenario chart
// ---------------------------------------------------------------------------
function renderRevenueScenarioChart(result, vRevenue) {
    const canvas = document.getElementById('chartRevenueForecast');
    if (!canvas) return;
    if (_revenueChart) _revenueChart.destroy();

    const labels = result.rows.map(r => `${r.month} (${r.monthLabel})`);

    _revenueChart = new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: makeScenarioDatasets(labels, {
                realistic:   result.rows.map(r => r.revenue),
                pessimistic: result.rows.map(r => Math.round(r.revenue * (1 - vRevenue * r.month / 12))),
                optimistic:  result.rows.map(r => Math.round(r.revenue * (1 + vRevenue * r.month / 12))),
                noSeo:       result.rows.map(r => r.noSeoRevenue),
            }),
        },
        options: scenarioChartOptions('Szacowane przychody klienta (12 mc)'),
    });
}

// ---------------------------------------------------------------------------
// Domain comparison bar charts
// ---------------------------------------------------------------------------
function renderDomainComparisonCharts(seoResults) {
    const section = document.getElementById('domainComparisonSection');
    if (!section || !seoResults || !seoResults.length) return;
    section.classList.remove('d-none');

    const clientDomain = document.getElementById('forecastClientDomain')?.value || '';

    const metrics = [
        { key: 'domain_rating',    canvasId: 'chartDR',        title: 'Domain Rating' },
        { key: 'referring_domains', canvasId: 'chartDomains',   title: 'Referring Domains' },
        { key: 'urls_in_top10',     canvasId: 'chartUrlsTop10', title: 'Liczba URL w Top 10' },
        { key: 'top10_keywords',    canvasId: 'chartCompTop10', title: 'Top 10 — słowa kluczowe' },
        { key: 'top3_keywords',     canvasId: 'chartCompTop3',  title: 'Top 3 — słowa kluczowe' },
    ];

    metrics.forEach(m => {
        const canvas = document.getElementById(m.canvasId);
        if (!canvas) return;

        if (_domainCharts[m.canvasId]) _domainCharts[m.canvasId].destroy();

        const sorted = [...seoResults].sort((a, b) => (b[m.key] || 0) - (a[m.key] || 0));
        const labels = sorted.map(r => r.domain);
        const data = sorted.map(r => r[m.key] || 0);
        const colors = sorted.map(r =>
            r.domain.toLowerCase() === clientDomain.toLowerCase()
                ? 'rgba(75,192,192,0.85)'
                : 'rgba(100,120,160,0.6)'
        );

        _domainCharts[m.canvasId] = new Chart(canvas, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: m.title,
                    data,
                    backgroundColor: colors,
                    borderColor: colors.map(c => c.replace(/[\d.]+\)$/, '1)')),
                    borderWidth: 1,
                }],
            },
            options: {
                responsive: true,
                indexAxis: 'y',
                plugins: {
                    title: { display: true, text: m.title, color: '#ccc' },
                    legend: { display: false },
                },
                scales: {
                    x: { ticks: { color: '#aaa' }, grid: { color: 'rgba(255,255,255,0.05)' }, beginAtZero: true },
                    y: { ticks: { color: '#aaa' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                },
            },
        });
    });
}

function updateEfficiencyPreview() {
    const clientDomain = document.getElementById('forecastClientDomain')?.value;
    const client = _forecastSeoResults.find(r => r.domain === clientDomain) || {};

    const rawKw = client.avg_kw_per_url || _forecastAverages.avg_kw_per_url || 0;
    const rawTr = client.avg_traffic_per_kw || _forecastAverages.avg_traffic_per_kw || 0;

    const kwPct = (parseFloat(document.getElementById('forecastKwPerUrlPct')?.value) || 100) / 100;
    const trPct = (parseFloat(document.getElementById('forecastTrafficPerKwPct')?.value) || 100) / 100;

    const kwValEl = document.getElementById('forecastKwPerUrlVal');
    const trValEl = document.getElementById('forecastTrafficPerKwVal');
    if (kwValEl) kwValEl.textContent = (rawKw * kwPct).toFixed(1);
    if (trValEl) trValEl.textContent = (rawTr * trPct).toFixed(1);
}

document.addEventListener('DOMContentLoaded', () => {
    const kwPctInput = document.getElementById('forecastKwPerUrlPct');
    const trPctInput = document.getElementById('forecastTrafficPerKwPct');
    if (kwPctInput) kwPctInput.addEventListener('input', updateEfficiencyPreview);
    if (trPctInput) trPctInput.addEventListener('input', updateEfficiencyPreview);
});

async function suggestEstimationParams() {
    const briefSection = document.getElementById('brandBriefContent');
    let companyInfo = '';

    if (briefSection) {
        const firstP = briefSection.querySelector('p');
        if (firstP) companyInfo = firstP.textContent.trim();
    }

    if (!companyInfo) {
        alert('Najpierw wygeneruj Brief AI, żeby mieć opis firmy');
        return;
    }

    const btn = document.getElementById('aiEstimationBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> AI myśli...';

    try {
        const resp = await fetch('/api/estimation/suggest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ company_info: companyInfo }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Błąd API');

        const s = data.suggestion || {};
        showAiSuggestion('aiSuggestConversion', s.conversion_rate, '%', s.conversion_rate_reason);
        showAiSuggestion('aiSuggestAov', s.aov, ' zł', s.aov_reason);
        showAiSuggestion('aiSuggestMargin', s.margin, '%', s.margin_reason);

    } catch (e) {
        console.error('AI estimation error:', e);
        if (window.showAlert) window.showAlert(e.message, 'danger');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-stars"></i> Podpowiedz AI (Konwersja, AOV, Marża)';
    }
}

function showAiSuggestion(containerId, value, suffix, reason) {
    const container = document.getElementById(containerId);
    if (!container || value === undefined || value === null) return;
    const small = container.querySelector('small');
    small.innerHTML = `<i class="bi bi-lightbulb me-1"></i>AI: <strong>${value}${suffix}</strong> — ${reason || ''} <i class="bi bi-arrow-down-circle ms-1" title="Zastosuj"></i>`;
    small.dataset.value = value;
    container.classList.remove('d-none');
}

function applyAiSuggestion(inputId, smallEl) {
    const input = document.getElementById(inputId);
    if (!input || !smallEl) return;
    input.value = smallEl.dataset.value;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    smallEl.closest('div').classList.add('d-none');
    if (window.showAlert) window.showAlert('Wartość AI zastosowana', 'success');
}
