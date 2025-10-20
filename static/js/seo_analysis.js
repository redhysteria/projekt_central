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
            // Show success message
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
    results.forEach((result, index) => {
        const dataSourceBadge = getDataSourceBadge(result.data_source);
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${result.domain} ${dataSourceBadge}</td>
            <td>${result.domain_rating}</td>
            <td>${result.referring_domains}</td>
            <td>${result.top3_keywords}</td>
            <td>${result.top10_keywords}</td>
            <td>${result.urls_in_top10}</td>
            <td>${result.urls_in_top50}</td>
            <td>${result.estimated_traffic}</td>
            <td>${result.avg_kw_per_url}</td>
            <td>${result.avg_traffic_per_kw}</td>
        `;
        tbody.appendChild(row);
    });
    
    // Renderuj wiersz ze średnimi
    if (averages) {
        const avgRow = document.createElement('tr');
        avgRow.className = 'table-secondary fw-bold';
        avgRow.innerHTML = `
            <td><strong>ŚREDNIO</strong></td>
            <td><strong>-</strong></td>
            <td><strong>${averages.domain_rating || 0}</strong></td>
            <td><strong>${averages.referring_domains || 0}</strong></td>
            <td><strong>${averages.top3_keywords || 0}</strong></td>
            <td><strong>${averages.top10_keywords || 0}</strong></td>
            <td><strong>${averages.urls_in_top10 || 0}</strong></td>
            <td><strong>${averages.urls_in_top50 || 0}</strong></td>
            <td><strong>${averages.estimated_traffic || 0}</strong></td>
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
        progress.classList.remove('d-none');
        button.disabled = true;
    } else {
        progress.classList.add('d-none');
        button.disabled = false;
    }
}

/**
 * Pokaż wyniki analizy SEO
 */
function showSeoResults() {
    document.getElementById('seoResults').classList.remove('d-none');
}

/**
 * Ukryj wyniki analizy SEO
 */
function hideSeoResults() {
    document.getElementById('seoResults').classList.add('d-none');
}

/**
 * Pokaż błąd analizy SEO
 */
function showSeoError(message) {
    const errorDiv = document.getElementById('seoError');
    errorDiv.textContent = message;
    errorDiv.classList.remove('d-none');
}

/**
 * Ukryj błąd analizy SEO
 */
function hideSeoError() {
    document.getElementById('seoError').classList.add('d-none');
}

/**
 * Zwróć badge dla źródła danych
 */
function getDataSourceBadge(dataSource) {
    if (dataSource === 'ahrefs_api') {
        return '<span class="badge bg-success ms-2">API</span>';
    } else {
        return '<span class="badge bg-secondary ms-2">Mock</span>';
    }
}

/**
 * Wyświetl informację o źródle danych
 */
function displayDataSourceInfo(results) {
    if (!results || results.length === 0) return;
    
    // Sprawdź czy wszystkie wyniki mają to samo źródło
    const apiCount = results.filter(r => r.data_source === 'ahrefs_api').length;
    const mockCount = results.filter(r => r.data_source === 'mock').length;
    
    let infoBox = document.getElementById('seoDataSourceInfo');
    if (!infoBox) {
        // Utwórz info box jeśli nie istnieje
        infoBox = document.createElement('div');
        infoBox.id = 'seoDataSourceInfo';
        infoBox.className = 'alert mb-3';
        
        const resultsDiv = document.getElementById('seoResults');
        resultsDiv.insertBefore(infoBox, resultsDiv.firstChild);
    }
    
    if (apiCount > 0 && mockCount === 0) {
        infoBox.className = 'alert alert-success mb-3';
        infoBox.innerHTML = `
            <i class="bi bi-check-circle-fill"></i>
            <strong>Dane z Ahrefs API</strong> - Wszystkie wyniki pochodzą z prawdziwego API Ahrefs
        `;
    } else if (mockCount > 0 && apiCount === 0) {
        infoBox.className = 'alert alert-warning mb-3';
        infoBox.innerHTML = `
            <i class="bi bi-exclamation-triangle-fill"></i>
            <strong>Dane mockowane</strong> - Wyniki są symulowane (brak lub błąd API Ahrefs)
        `;
    } else {
        infoBox.className = 'alert alert-info mb-3';
        infoBox.innerHTML = `
            <i class="bi bi-info-circle-fill"></i>
            <strong>Dane mieszane</strong> - ${apiCount} z Ahrefs API, ${mockCount} mockowane
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
