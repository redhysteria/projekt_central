/**
 * JavaScript dla analizy SEO domen
 */

// Globalne zmienne
let currentQuoteId = null;

/**
 * Inicjalizacja analizy SEO
 */
function initSeoAnalysis() {
    // Pobierz ID wyceny z URL
    const urlParams = new URLSearchParams(window.location.search);
    currentQuoteId = urlParams.get('id');
    
    if (currentQuoteId) {
        // Załaduj istniejące wyniki analizy SEO
        loadSeoResults();
    }
}

/**
 * Analizuj domeny SEO
 */
async function analyzeSeoCompetitors() {
    if (!currentQuoteId) {
        showSeoError('Brak ID wyceny');
        return;
    }
    
    const domainsText = document.getElementById('domainsInput').value.trim();
    
    if (!domainsText) {
        showSeoError('Wprowadź domeny do analizy');
        return;
    }
    
    // Pokaż progress indicator
    showSeoProgress(true);
    hideSeoError();
    hideSeoResults();
    
    try {
        const response = await fetch(`/api/quotes/${currentQuoteId}/seo-analysis`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                domains: domainsText
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            console.log('✅ Analiza SEO zakończona:', data);
            renderSeoResultsTable(data.seo_results, data.averages);
            showSeoResults();
            const qName = document.getElementById('quoteName')?.value || '';
            if (typeof initEstimationSection === 'function') {
                initEstimationSection(data.seo_results, data.averages, qName);
            }
            if (window.showAlert) {
                window.showAlert(`Przeanalizowano ${data.count} domen pomyślnie`, 'success');
            }
        } else {
            console.error('❌ Błąd analizy SEO:', data);
            const errorMessage = data.error || 'Błąd podczas analizy SEO';
            showSeoError(errorMessage);
            // Also show as alert for better visibility
            if (window.showAlert) {
                window.showAlert(errorMessage, 'danger');
            }
        }
        
    } catch (error) {
        console.error('💥 Błąd sieci:', error);
        const errorMessage = 'Błąd połączenia z serwerem';
        showSeoError(errorMessage);
        if (window.showAlert) {
            window.showAlert(errorMessage, 'danger');
        }
    } finally {
        showSeoProgress(false);
    }
}

/**
 * Załaduj istniejące wyniki analizy SEO
 */
async function loadSeoResults() {
    if (!currentQuoteId) {
        return;
    }
    
    try {
        const response = await fetch(`/api/quotes/${currentQuoteId}/seo-analysis`);
        const data = await response.json();
        
        if (response.ok && data.seo_results && data.seo_results.length > 0) {
            console.log('📊 Załadowano wyniki analizy SEO:', data);
            renderSeoResultsTable(data.seo_results, data.averages);
            showSeoResults();
            const qName = document.getElementById('quoteName')?.value || '';
            if (typeof initEstimationSection === 'function') {
                initEstimationSection(data.seo_results, data.averages, qName);
            }
        }
        
    } catch (error) {
        console.error('💥 Błąd ładowania wyników SEO:', error);
    }
}

/**
 * Renderuj tabelę z wynikami analizy SEO
 */
function renderSeoResultsTable(results, averages) {
    const tbody = document.querySelector('#seoTable tbody');
    const averagesRow = document.getElementById('seoAveragesRow');
    
    // Wyczyść poprzednie wyniki
    tbody.innerHTML = '';
    averagesRow.innerHTML = '';
    
    // Sprawdź źródło danych i pokaż info
    displayDataSourceInfo(results);
    
    // Renderuj wiersze z danymi
    const fmt = (v) => (v == null ? 0 : Number(v).toLocaleString('pl-PL'));

    results.forEach((result, index) => {
        const dataSourceBadge = getDataSourceBadge(result.data_source);
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${result.domain} ${dataSourceBadge}</td>
            <td>${result.domain_rating}</td>
            <td>${fmt(result.referring_domains)}</td>
            <td>${fmt(result.backlinks)}</td>
            <td>${fmt(result.top3_keywords)}</td>
            <td>${fmt(result.top10_keywords)}</td>
            <td>${fmt(result.urls_in_top10)}</td>
            <td>${fmt(result.urls_in_top50)}</td>
            <td>${fmt(result.estimated_traffic)}</td>
            <td>${result.avg_kw_per_url}</td>
            <td>${result.avg_traffic_per_kw}</td>
        `;
        tbody.appendChild(row);
    });

    if (averages) {
        const avgRow = document.createElement('tr');
        avgRow.className = 'table-secondary fw-bold';
        avgRow.innerHTML = `
            <td><strong>ŚREDNIO</strong></td>
            <td><strong>-</strong></td>
            <td><strong>${averages.domain_rating || 0}</strong></td>
            <td><strong>${fmt(averages.referring_domains)}</strong></td>
            <td><strong>${fmt(averages.backlinks)}</strong></td>
            <td><strong>${fmt(averages.top3_keywords)}</strong></td>
            <td><strong>${fmt(averages.top10_keywords)}</strong></td>
            <td><strong>${fmt(averages.urls_in_top10)}</strong></td>
            <td><strong>${fmt(averages.urls_in_top50)}</strong></td>
            <td><strong>${fmt(averages.estimated_traffic)}</strong></td>
            <td><strong>${averages.avg_kw_per_url || 0}</strong></td>
            <td><strong>${averages.avg_traffic_per_kw || 0}</strong></td>
        `;
        averagesRow.appendChild(avgRow);
    }
}

/**
 * Eksportuj wyniki do CSV
 */
async function exportSeoToCsv() {
    if (!currentQuoteId) {
        showSeoError('Brak ID wyceny');
        return;
    }
    
    try {
        const response = await fetch(`/api/quotes/${currentQuoteId}/seo-analysis/export`);
        
        if (response.ok) {
            // Pobierz plik
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `analiza_seo_${currentQuoteId}.csv`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            console.log('✅ Eksport CSV zakończony pomyślnie');
        } else {
            const data = await response.json();
            console.error('❌ Błąd eksportu CSV:', data);
            showSeoError(data.error || 'Błąd podczas eksportu CSV');
        }
        
    } catch (error) {
        console.error('💥 Błąd eksportu CSV:', error);
        showSeoError('Błąd połączenia z serwerem podczas eksportu');
    }
}

/**
 * Pokaż/ukryj progress indicator
 */
function showSeoProgress(show) {
    const progress = document.getElementById('seoProgress');
    const button = document.getElementById('analyzeSeoBtn');
    
    if (show) {
        if (progress) progress.classList.remove('d-none');
        if (button) button.disabled = true;
    } else {
        if (progress) progress.classList.add('d-none');
        if (button) button.disabled = false;
    }
}

/**
 * Pokaż wyniki analizy SEO
 */
function showSeoResults() {
    const resultsDiv = document.getElementById('seoResults');
    if (resultsDiv) {
        resultsDiv.classList.remove('d-none');
    }
}

/**
 * Ukryj wyniki analizy SEO
 */
function hideSeoResults() {
    const resultsDiv = document.getElementById('seoResults');
    if (resultsDiv) {
        resultsDiv.classList.add('d-none');
    }
}

/**
 * Pokaż błąd analizy SEO
 */
function showSeoError(message) {
    const errorDiv = document.getElementById('seoError');
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.classList.remove('d-none');
    } else {
        console.error('Element seoError nie został znaleziony');
    }
}

/**
 * Ukryj błąd analizy SEO
 */
function hideSeoError() {
    const errorDiv = document.getElementById('seoError');
    if (errorDiv) {
        errorDiv.classList.add('d-none');
    }
}

/**
 * Zwróć badge dla źródła danych
 */
function getDataSourceBadge(dataSource) {
    switch (dataSource) {
        case 'senuto+ahrefs':
            return '<span class="badge bg-primary ms-2" title="Senuto (TOP/URL/ruch) + Ahrefs (DR/Domains)">Senuto+Ahrefs</span>';
        case 'senuto':
            return '<span class="badge bg-info ms-2" title="Dane z Senuto API">Senuto</span>';
        case 'ahrefs_api':
            return '<span class="badge bg-success ms-2" title="Dane z Ahrefs API">Ahrefs</span>';
        case 'mock':
            return '<span class="badge bg-secondary ms-2">Mock</span>';
        default:
            return `<span class="badge bg-dark ms-2">${dataSource || 'unknown'}</span>`;
    }
}

/**
 * Wyświetl informację o źródle danych
 */
function displayDataSourceInfo(results) {
    if (!results || results.length === 0) return;

    const counts = results.reduce((acc, r) => {
        const key = r.data_source || 'unknown';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});

    let infoBox = document.getElementById('seoDataSourceInfo');
    if (!infoBox) {
        infoBox = document.createElement('div');
        infoBox.id = 'seoDataSourceInfo';
        infoBox.className = 'alert mb-3';
        const resultsDiv = document.getElementById('seoResults');
        resultsDiv.insertBefore(infoBox, resultsDiv.firstChild);
    }

    const sources = Object.keys(counts);
    const total = results.length;
    const sourceLabels = {
        'senuto+ahrefs': 'Senuto + Ahrefs',
        'senuto': 'Senuto',
        'ahrefs_api': 'Ahrefs API',
        'mock': 'mockowane',
        'unknown': 'nieznane'
    };

    if (sources.length === 1) {
        const only = sources[0];
        if (only === 'senuto+ahrefs') {
            infoBox.className = 'alert alert-success mb-3';
            infoBox.innerHTML = `
                <i class="bi bi-check-circle-fill"></i>
                <strong>Dane hybrydowe</strong> – TOP/URL/ruch z <em>Senuto</em>, Domain Rating i Referring Domains z <em>Ahrefs</em>.
            `;
        } else if (only === 'senuto') {
            infoBox.className = 'alert alert-info mb-3';
            infoBox.innerHTML = `
                <i class="bi bi-info-circle-fill"></i>
                <strong>Dane z Senuto API</strong> – DR i Referring Domains niedostępne (Ahrefs wyłączony lub błąd).
            `;
        } else if (only === 'ahrefs_api') {
            infoBox.className = 'alert alert-warning mb-3';
            infoBox.innerHTML = `
                <i class="bi bi-exclamation-triangle-fill"></i>
                <strong>Dane wyłącznie z Ahrefs</strong> – Senuto niedostępne (sprawdź <code>SENUTO_API_TOKEN</code>).
            `;
        } else if (only === 'mock') {
            infoBox.className = 'alert alert-warning mb-3';
            infoBox.innerHTML = `
                <i class="bi bi-exclamation-triangle-fill"></i>
                <strong>Dane mockowane</strong> – Senuto i Ahrefs nie odpowiadają.
            `;
        } else {
            infoBox.className = 'alert alert-secondary mb-3';
            infoBox.innerHTML = `<i class="bi bi-info-circle"></i> Źródło danych: <strong>${only}</strong>`;
        }
    } else {
        const breakdown = sources
            .map(s => `${counts[s]}× ${sourceLabels[s] || s}`)
            .join(', ');
        infoBox.className = 'alert alert-info mb-3';
        infoBox.innerHTML = `
            <i class="bi bi-info-circle-fill"></i>
            <strong>Dane mieszane</strong> (${total} domen) – ${breakdown}.
        `;
    }
}

// Inicjalizacja po załadowaniu DOM
document.addEventListener('DOMContentLoaded', function() {
    // Sprawdź czy jesteśmy na stronie edytora wyceny
    if (window.location.pathname.includes('/quotes')) {
        initSeoAnalysis();
    }
});
