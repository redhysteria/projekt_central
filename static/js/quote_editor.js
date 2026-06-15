// Quote Editor functionality
let currentQuote = null;
let quoteItems = [];
let pricelist = [];
let editingItemId = null;

// Load data on page load
document.addEventListener('DOMContentLoaded', async function() {
    console.log('🚀 ===== INICJALIZACJA APLIKACJI ROZPOCZĘTA =====');
    console.log('🎬 DOMContentLoaded event fired');
    
    console.log('⚙️ Inicjalizacja sliderów w modalach...');
    initModalSliders();

    window._newTaskMonthsCsv = '';
    const newPicker = document.getElementById('newTaskMonthPicker');
    if (newPicker) {
        MonthPicker.renderMonthPicker(newPicker, '', {
            onChange: (csv) => { window._newTaskMonthsCsv = csv; },
        });
    }

    console.log('⚙️ Ustawienie handlerów dla nowego zadania...');
    setupNewTaskHandlers();
    
    console.log('📥 Ładowanie cennika...');
    await loadPricelist();
    console.log('✅ Cennik załadowany, pricelist.length =', pricelist.length);
    
    console.log('🔄 Inicjalizacja z URL...');
    await initializeFromURL();

    initAiKeywordsModal();
    
    console.log('🎉 ===== INICJALIZACJA ZAKOŃCZONA =====');
});

function setupNewTaskHandlers() {
    console.log('🎯 setupNewTaskHandlers() wywołana');
    // Handle specialist type change to auto-update price
    const specialistDropdown = document.getElementById('newSpecialistType');
    const clientUnitsInput = document.getElementById('newClientUnits');
    
    console.log('  - specialistDropdown element:', specialistDropdown);
    console.log('  - clientUnitsInput element:', clientUnitsInput);
    
    if (specialistDropdown) {
        console.log('  ✅ Dodaję listener "change" do specialistDropdown');
        specialistDropdown.addEventListener('change', function() {
            console.log('🔄 Specialist dropdown zmieniony, aktualizuję cenę...');
            updateNewTaskPrice();
        });
    } else {
        console.error('  ❌ specialistDropdown nie został znaleziony!');
    }
    
    if (clientUnitsInput) {
        console.log('  ✅ Dodaję listener "input" do clientUnitsInput');
        clientUnitsInput.addEventListener('input', function() {
            console.log('🔄 Liczba jednostek zmieniona, aktualizuję cenę...');
            updateNewTaskPrice();
        });
    } else {
        console.error('  ❌ clientUnitsInput nie został znaleziony!');
    }
}

function updateNewTaskPrice() {
    const specialistDropdown = document.getElementById('newSpecialistType');
    const clientUnitsInput = document.getElementById('newClientUnits');
    const pricePerUnitInput = document.getElementById('newPricePerUnit');
    const totalPriceDisplay = document.getElementById('newTotalPrice');
    
    if (!specialistDropdown || !clientUnitsInput || !pricePerUnitInput || !totalPriceDisplay) {
        return;
    }
    
    const selectedOption = specialistDropdown.selectedOptions[0];
    if (selectedOption && selectedOption.dataset.price) {
        const pricePerUnit = parseFloat(selectedOption.dataset.price);
        const clientUnits = parseFloat(clientUnitsInput.value) || 0;
        
        pricePerUnitInput.value = pricePerUnit.toFixed(2);
        
        const totalPrice = pricePerUnit * clientUnits;
        totalPriceDisplay.textContent = formatCurrency(totalPrice);
    } else {
        pricePerUnitInput.value = '';
        totalPriceDisplay.textContent = '0,00 zł';
    }
}

async function initializeFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const quoteId = urlParams.get('id');
    
    if (quoteId) {
        loadQuote(quoteId);
    } else {
        // New quote - initialize empty form
        currentQuote = {
            name: 'Nowa wycena',
            lb_budget: 0,
            chars_in_thousands: 0,
            rate_per_1000_chars: 0,
            rate_multiplier: 1,
            num_texts: 0
        };
        document.getElementById('quoteTitle').textContent = 'Nowa Wycena';
        renderItemsTable();

        // Load default templates for new quotes
        await loadDefaultTemplatesForNewQuote();
    }
}

async function loadDefaultTemplatesForNewQuote() {
    // This function is no longer used - templates are imported manually via button
    console.log('loadDefaultTemplatesForNewQuote() called but disabled - use importTemplates() button instead');
}

async function importTemplates() {
    if (!currentQuote || !currentQuote.id) {
        showAlert('Najpierw zapisz wycenę, aby móc importować szablony', 'warning');
        return;
    }
    
    if (quoteItems.length > 0) {
        if (!confirm('Lista zadań nie jest pusta. Czy na pewno chcesz dodać szablony? Istniejące zadania nie zostaną usunięte.')) {
            return;
        }
    }
    
    try {
        showAlert('Importuję szablony zadań...', 'info');
        
        const response = await fetch('/api/default-tasks');
        const data = await response.json();
        const defaultTemplates = data.default_tasks;
        
        if (defaultTemplates.length === 0) {
            showAlert('Brak szablonów do zaimportowania', 'warning');
            return;
        }
        
        let successCount = 0;
        let errorCount = 0;
        
        // Import each template as a new quote item
        for (const template of defaultTemplates) {
            try {
                const itemData = {
                    task_name: template.task_name,
                    specialist_type: template.specialist_type,
                    month_execution: template.month_execution,
                    hours_or_units: template.hours_or_units,
                    price_per_unit: template.price_per_unit,
                    total_price: template.total_price,
                    client_units: template.client_units,
                    client_price: template.client_price,
                    client_month: template.client_month
                };
                
                const itemResponse = await fetch(`/api/quotes/${currentQuote.id}/items`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(itemData)
                });
                
                if (itemResponse.ok) {
                    successCount++;
                } else {
                    errorCount++;
                    console.error(`Failed to import template: ${template.task_name}`);
                }
            } catch (error) {
                errorCount++;
                console.error(`Error importing template ${template.task_name}:`, error);
            }
        }
        
        // Reload quote to show all imported items
        await loadQuote(currentQuote.id);
        
        if (successCount > 0) {
            showAlert(`Zaimportowano ${successCount} szablonów zadań${errorCount > 0 ? ` (błędów: ${errorCount})` : ''}`, 'success');
        } else {
            showAlert('Nie udało się zaimportować żadnych szablonów', 'danger');
        }
        
    } catch (error) {
        console.error('Error importing templates:', error);
        showAlert('Błąd podczas importowania szablonów zadań', 'danger');
    }
}

async function loadPricelist() {
    try {
        const response = await fetch('/api/pricelist');
        const data = await response.json();
        pricelist = data.pricelist;
        console.log('Załadowano cennik:', pricelist.length, 'pozycji');
        populateSpecialistDropdown();
    } catch (error) {
        console.error('Error loading pricelist:', error);
        showAlert('Błąd podczas ładowania cennika', 'danger');
    }
}


function populateSpecialistDropdown() {
    console.log('🔧 populateSpecialistDropdown() wywołana');
    console.log('📊 Pricelist zawiera:', pricelist);
    console.log('📊 Długość pricelist:', pricelist.length);
    
    const newDropdown = document.getElementById('newSpecialistType');
    console.log('🎯 Element dropdown znaleziony:', newDropdown);
    
    const setupDropdown = (dropdown) => {
        if (!dropdown) {
            console.error('❌ Nie znaleziono dropdown specjalistów');
            return;
        }
        
        console.log('✅ Dropdown istnieje, wypełniam...');
        console.log('Wypełniam dropdown specjalistów z', pricelist.length, 'pozycjami');
        dropdown.innerHTML = '<option value="">Wybierz specjalistę</option>';
        
        pricelist.forEach((item, index) => {
            console.log(`  Dodaję opcję ${index + 1}:`, item.specialist_type, '- cena:', item.price_per_unit);
            const option = document.createElement('option');
            option.value = item.specialist_type;
            option.textContent = item.specialist_type;
            option.dataset.price = item.price_per_unit;
            dropdown.appendChild(option);
        });
        
        console.log('✅ Dropdown wypełniony, liczba opcji:', dropdown.options.length);
        console.log('📋 Zawartość dropdown:', Array.from(dropdown.options).map(o => o.textContent));
    };
    
    setupDropdown(newDropdown);
}

async function loadQuote(quoteId) {
    try {
        const response = await fetch(`/api/quotes/${quoteId}`);
        const data = await response.json();
        
        currentQuote = data.quote;
        quoteItems = data.items;
        
        // Update form fields
        document.getElementById('quoteTitle').textContent = currentQuote.name;
        document.getElementById('quoteName').value = currentQuote.name;
        syncQuoteNameToDomains(currentQuote.name);
        
        renderItemsTable();

        // Load competitors data
        await loadCompetitors();
        loadBrandBrief();
        window.dispatchEvent(new CustomEvent('quoteReady', { detail: { quoteId } }));

    } catch (error) {
        console.error('Error loading quote:', error);
        showAlert('Błąd podczas ładowania wyceny', 'danger');
    }
}

// Inline editing functionality
async function updateItemField(itemId, fieldName, value) {
    const item = quoteItems.find(i => i.id === itemId);
    if (!item) return;

    // Update local data
    item[fieldName] = value;

    // If updating specialist_type, also update price_per_unit from pricelist
    if (fieldName === 'specialist_type') {
        const specialist = pricelist.find(p => p.specialist_type === value);
        if (specialist) {
            item.price_per_unit = specialist.price_per_unit;
            // Update the price input field
            const priceInput = document.querySelector(`select[onchange*="${itemId}"][onchange*="specialist_type"]`).closest('tr').querySelector('input[onchange*="price_per_unit"]');
            if (priceInput) {
                priceInput.value = specialist.price_per_unit;
            }
        }
    }

    // Recalculate client_price if client_units or price_per_unit changed
    if (fieldName === 'client_units' || fieldName === 'price_per_unit') {
        item.client_price = item.client_units * item.price_per_unit;
        // Update the client price display
        const clientPriceSpan = document.getElementById(`client-price-${itemId}`);
        if (clientPriceSpan) {
            clientPriceSpan.textContent = formatCurrency(item.client_price);
        }
    }

    // Save to server
    try {
        const itemData = {
            task_name: item.task_name,
            specialist_type: item.specialist_type,
            month_execution: item.month_execution,
            hours_or_units: item.hours_or_units,
            price_per_unit: item.price_per_unit,
            total_price: item.total_price,
            client_units: item.client_units,
            client_price: item.client_price,
            client_month: item.client_month,
            client_months: item.client_months
        };

        const response = await fetch(`/api/quotes/${currentQuote.id}/items/${itemId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(itemData)
        });

        if (response.ok) {
            // monthly distribution preview removed
        } else {
            throw new Error('Failed to update item');
        }
    } catch (error) {
        console.error('Error updating item:', error);
        showAlert('Błąd podczas aktualizacji zadania', 'danger');
        // Reload quote to restore correct data
        if (currentQuote.id) {
            loadQuote(currentQuote.id);
        }
    }
}

function renderItemsTable() {
    const tbody = document.querySelector('#itemsTable tbody');
    tbody.innerHTML = '';

    if (quoteItems.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center text-muted">
                    Brak zadań. <a href="#" onclick="addNewItem()">Dodaj pierwsze zadanie</a>
                </td>
            </tr>
        `;
        return;
    }

    quoteItems.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <input type="text" class="form-control form-control-sm" value="${item.task_name}" 
                       onchange="updateItemField(${item.id}, 'task_name', this.value)"
                       ${item.is_auto_generated ? 'readonly' : ''}>
                ${item.is_auto_generated ? '<span class="badge bg-info ms-1">Auto</span>' : ''}
            </td>
            <td>
                <select class="form-select form-select-sm" onchange="updateItemField(${item.id}, 'specialist_type', this.value)"
                        ${item.is_auto_generated ? 'disabled' : ''}>
                    <option value="">Wybierz specjalistę</option>
                    ${pricelist.map(specialist => 
                        `<option value="${specialist.specialist_type}" ${specialist.specialist_type === item.specialist_type ? 'selected' : ''} data-price="${specialist.price_per_unit}">${specialist.specialist_type}</option>`
                    ).join('')}
                </select>
            </td>
            <td>
                <input type="number" class="form-control form-control-sm" value="${item.client_units}" 
                       step="0.01" min="0" onchange="updateItemField(${item.id}, 'client_units', this.value)"
                       ${item.is_auto_generated ? 'readonly' : ''}>
            </td>
            <td>
                <input type="number" class="form-control form-control-sm" value="${item.price_per_unit}" 
                       step="0.01" min="0" onchange="updateItemField(${item.id}, 'price_per_unit', this.value)"
                       ${item.is_auto_generated ? 'readonly' : ''}>
            </td>
            <td class="text-end">
                <span id="client-price-${item.id}">${formatCurrency(item.client_price)}</span>
            </td>
            <td>
                <div class="month-picker-cell" id="monthPicker${item.id}"></div>
            </td>
            <td>
                ${item.is_auto_generated ? '' : `
                    <button class="btn btn-outline-danger btn-sm" onclick="deleteItem(${item.id})" title="Usuń">
                            <i class="bi bi-trash"></i>
                        </button>
                `}
            </td>
        `;
        tbody.appendChild(row);
        const pickerEl = document.getElementById(`monthPicker${item.id}`);
        if (pickerEl) {
            MonthPicker.renderMonthPicker(pickerEl, item.client_months || '', {
                disabled: !!item.is_auto_generated,
                onChange: (csv) => updateItemField(item.id, 'client_months', csv),
            });
        }
    });
}

async function addNewItem() {
    if (!currentQuote.id) {
        showAlert('Proszę najpierw zapisać wycenę', 'warning');
        return;
    }

    const itemData = {
        task_name: 'Nowe zadanie',
        specialist_type: '',
        month_execution: '',
        hours_or_units: 0,
        price_per_unit: 0,
        total_price: 0,
        client_units: 1,
        client_price: 0,
        client_months: ''
    };

    try {
        const response = await fetch(`/api/quotes/${currentQuote.id}/items`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(itemData)
        });

        if (response.ok) {
            showAlert('Dodano nowe zadanie', 'success');
                loadQuote(currentQuote.id);
        } else {
            throw new Error('Failed to add item');
        }
    } catch (error) {
        console.error('Error adding item:', error);
        showAlert('Błąd podczas dodawania zadania', 'danger');
    }
}



async function deleteItem(itemId) {
    if (!confirm('Czy na pewno chcesz usunąć to zadanie?')) {
        return;
    }

    try {
        const response = await fetch(`/api/quotes/${currentQuote.id}/items/${itemId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showAlert('Zadanie zostało usunięte', 'success');
            loadQuote(currentQuote.id);
        } else {
            throw new Error('Failed to delete item');
        }
    } catch (error) {
        console.error('Error deleting item:', error);
        showAlert('Błąd podczas usuwania zadania', 'danger');
    }
}

async function saveQuote() {
    const quoteData = {
        name: document.getElementById('quoteName').value.trim(),
        lb_budget: 0,
        chars_in_thousands: 0,
        rate_per_1000_chars: 0,
        rate_multiplier: 1,
        num_texts: 0,
        lb_marza_month: 'Od Miesiąc 02',
        lb_budzet_month: 'Od Miesiąc 02',
        content_month: 'Od Miesiąc 02'
    };

    if (!quoteData.name) {
        showAlert('Proszę podać nazwę wyceny', 'warning');
        return;
    }

    try {
        const url = currentQuote.id ? `/api/quotes/${currentQuote.id}` : '/api/quotes';
        const method = currentQuote.id ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(quoteData)
        });

        if (response.ok) {
            const result = await response.json();
            
            if (!currentQuote.id) {
                // New quote created
                currentQuote.id = result.id;
                window.history.replaceState({}, '', `?id=${result.id}`);
                window.dispatchEvent(new CustomEvent('quoteReady', { detail: { quoteId: result.id } }));
                
                // If we have template items loaded, save them to the new quote
                if (quoteItems.length > 0) {
                    let savedCount = 0;
                    for (const item of quoteItems) {
                        try {
                            const itemData = {
                                task_name: item.task_name,
                                specialist_type: item.specialist_type,
                                month_execution: item.month_execution,
                                hours_or_units: item.hours_or_units,
                                price_per_unit: item.price_per_unit,
                                total_price: item.total_price,
                                client_units: item.client_units,
                                client_price: item.client_price,
                                client_month: item.client_month
                            };
                            
                            const itemResponse = await fetch(`/api/quotes/${currentQuote.id}/items`, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                },
                                body: JSON.stringify(itemData)
                            });
                            
                            if (itemResponse.ok) {
                                savedCount++;
                            }
                        } catch (error) {
                            console.error('Error saving template item:', error);
                        }
                    }
                    
                    showAlert(`Wycena została zapisana z ${savedCount} zadaniami`, 'success');
                } else {
                    showAlert('Wycena została zapisana', 'success');
                }
            } else {
                showAlert('Wycena została zaktualizowana', 'success');
            }
            
            document.getElementById('quoteTitle').textContent = quoteData.name;
            
            // Reload quote data to get updated auto-items
            if (currentQuote.id) {
                loadQuote(currentQuote.id);
            }
        } else {
            throw new Error('Failed to save quote');
        }
    } catch (error) {
        console.error('Error saving quote:', error);
        showAlert('Błąd podczas zapisywania wyceny', 'danger');
    }
}

async function exportQuote() {
    if (!currentQuote.id) {
        showAlert('Proszę najpierw zapisać wycenę', 'warning');
        return;
    }

    try {
        const response = await fetch(`/api/quotes/${currentQuote.id}/export`);
        
        if (response.ok) {
            const contentDisposition = response.headers.get('Content-Disposition');
            let filename = 'wycena.xlsx';
            if (contentDisposition) {
                const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
                if (filenameMatch) {
                    filename = filenameMatch[1].replace(/['"]/g, '');
                }
            }
            
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            showAlert('Wycena została wyeksportowana', 'success');
        } else {
            throw new Error('Failed to export quote');
        }
    } catch (error) {
        console.error('Error exporting quote:', error);
        showAlert('Błąd podczas eksportu wyceny', 'danger');
    }
}

// Removed duplicate DOMContentLoaded listener - all initialization is now in the main listener at the top

// Inline form functions
async function addTaskInline() {
    const taskName = document.getElementById('newTaskName').value.trim();
    const specialistType = document.getElementById('newSpecialistType').value;
    const clientUnits = parseFloat(document.getElementById('newClientUnits').value) || 0;
    const pricePerUnit = parseFloat(document.getElementById('newPricePerUnit').value) || 0;
    const clientPrice = pricePerUnit * clientUnits;
    
    const clientMonthsCsv = window._newTaskMonthsCsv || '';
    
    if (!taskName || !specialistType || clientUnits <= 0 || pricePerUnit <= 0) {
        showAlert('Proszę wypełnić wszystkie wymagane pola', 'warning');
        return;
    }
    
    if (!currentQuote.id) {
        showAlert('Proszę najpierw zapisać wycenę', 'warning');
        return;
    }
    
    const itemData = {
        task_name: taskName,
        specialist_type: specialistType,
        month_execution: '',
        hours_or_units: clientUnits,
        price_per_unit: pricePerUnit,
        total_price: clientPrice,
        client_units: clientUnits,
        client_price: clientPrice,
        client_months: clientMonthsCsv
    };
    
    try {
        const response = await fetch(`/api/quotes/${currentQuote.id}/items`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(itemData)
        });
        
        if (response.ok) {
            showAlert('Zadanie zostało dodane', 'success');
            clearInlineForm();
            loadQuote(currentQuote.id);
            window._newTaskMonthsCsv = '';
            const np = document.getElementById('newTaskMonthPicker');
            if (np) MonthPicker.renderMonthPicker(np, '', { onChange: (csv) => { window._newTaskMonthsCsv = csv; } });
        } else {
            throw new Error('Failed to add item');
        }
    } catch (error) {
        console.error('Error adding item:', error);
        showAlert('Błąd podczas dodawania zadania', 'danger');
    }
}

function clearInlineForm() {
    console.log('Czyszczę formularz zadania');
    document.getElementById('newTaskName').value = '';
    document.getElementById('newSpecialistType').value = '';
    document.getElementById('newClientUnits').value = '1';
    document.getElementById('newPricePerUnit').value = '';
    document.getElementById('newTotalPrice').textContent = '0,00 zł';
    console.log('Formularz wyczyszczony i zresetowany do wartości domyślnych');
}

// Utility functions
function formatCurrency(amount) {
    return new Intl.NumberFormat('pl-PL', {
        style: 'currency',
        currency: 'PLN'
    }).format(amount);
}

function showAlert(message, type) {
    const existingAlerts = document.querySelectorAll('.alert');
    existingAlerts.forEach(alert => alert.remove());

    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;

    const container = document.querySelector('.container');
    container.insertBefore(alertDiv, container.firstChild);

    setTimeout(() => {
        if (alertDiv.parentNode) {
            alertDiv.remove();
        }
    }, 5000);
}

// SEO Competitors Analysis Functions
async function analyzeCompetitors() {
    console.log('🔍 Rozpoczynam analizę konkurentów...');
    
    if (!currentQuote || !currentQuote.id) {
        console.log('❌ Brak wyceny - nie można analizować');
        showAlert('Najpierw zapisz wycenę, aby móc analizować konkurencję', 'warning');
        return;
    }

    const keywordsText = document.getElementById('keywordsInput').value.trim();
    console.log('📝 Słowa kluczowe:', keywordsText);
    
    if (!keywordsText) {
        console.log('❌ Brak słów kluczowych');
        showAlert('Wprowadź słowa kluczowe do analizy', 'warning');
        return;
    }
    
    // Sprawdź liczbę słów kluczowych
    const keywordsArray = keywordsText.split(/[\n,]/).filter(kw => kw.trim());
    console.log(`📊 Liczba słów kluczowych: ${keywordsArray.length}`);
    
    // Walidacja liczby słów kluczowych
    if (keywordsArray.length < 5) {
        showAlert(`Wprowadzono tylko ${keywordsArray.length} słów kluczowych. Wymagane minimum to 5 słów.`, 'danger');
        return;
    }
    
    if (keywordsArray.length > 500) {
        showAlert(`Wprowadzono ${keywordsArray.length} słów kluczowych. Maksymalna liczba to 500 słów.`, 'danger');
        return;
    }
    
    if (keywordsArray.length > 100) {
        console.log('⚠️ Dużo słów kluczowych - analiza może trwać długo');
        if (!confirm(`Wprowadzono ${keywordsArray.length} słów kluczowych. Analiza może trwać kilka minut. Kontynuować?`)) {
            return;
        }
    }

    // Show loading state
    console.log('⏳ Ustawiam stan ładowania...');
    setCompetitorsLoadingState(true);
    hideCompetitorsError();
    hideCompetitorsResults();

    try {
        console.log(`🚀 Wysyłam żądanie do /api/quotes/${currentQuote.id}/competitors`);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1000000); // 1000 sekund timeout
        
        const response = await fetch(`/api/quotes/${currentQuote.id}/competitors`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                keywords: keywordsText
            }),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);

        console.log('📡 Otrzymano odpowiedź:', response.status, response.statusText);
        const data = await response.json();
        console.log('📊 Dane odpowiedzi:', data);

        if (response.ok) {
            console.log('✅ Analiza zakończona pomyślnie');
            showAlert(data.message, 'success');
            displayCompetitorsResults(data.competitors);
        } else {
            console.log('❌ Błąd w odpowiedzi:', data.error);
            const errorMessage = data.error || 'Błąd podczas analizy konkurencji';
            showCompetitorsError(errorMessage);
            showAlert(errorMessage, 'danger'); // Also show as alert for better visibility
        }
    } catch (error) {
        console.error('💥 Błąd podczas analizy konkurentów:', error);
        
        if (error.name === 'AbortError') {
            showCompetitorsError('Analiza przekroczyła limit czasu (1000 sekund). Spróbuj z mniejszą liczbą słów kluczowych.');
        } else {
            showCompetitorsError('Błąd połączenia z serwerem: ' + error.message);
        }
    } finally {
        console.log('🏁 Kończę analizę - wyłączam stan ładowania');
        setCompetitorsLoadingState(false);
    }
}

async function loadCompetitors() {
    if (!currentQuote || !currentQuote.id) {
        return;
    }

    try {
        const response = await fetch(`/api/quotes/${currentQuote.id}/competitors`);
        const data = await response.json();

        if (response.ok && data.competitors && data.competitors.length > 0) {
            displayCompetitorsResults(data.competitors);
        }
    } catch (error) {
        console.error('Error loading competitors:', error);
    }
}

function displayCompetitorsResults(competitors) {
    const resultsDiv = document.getElementById('competitorsResults');
    const tableBody = document.querySelector('#competitorsTable tbody');
    
    // Clear previous results
    tableBody.innerHTML = '';
    
    const filtered = competitors.filter(c => c.occurrences > 5);
    
    // Add competitors to table
    filtered.forEach((competitor, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>
                <a href="#" class="text-decoration-none add-domain-link" data-domain="${competitor.domain}">
                    ${competitor.domain}
                    <i class="bi bi-box-arrow-up-right ms-1"></i>
                </a>
            </td>
            <td>
                <span class="badge bg-primary">${competitor.occurrences}</span>
            </td>
        `;
        row.querySelector('.add-domain-link').addEventListener('click', (e) => {
            e.preventDefault();
            addDomainToAnalysis(competitor.domain);
        });
        tableBody.appendChild(row);
    });
    
    // Show results
    resultsDiv.classList.remove('d-none');
}

function syncQuoteNameToDomains(name) {
    if (!name) return;
    const textarea = document.getElementById('domainsInput');
    if (!textarea) return;
    const current = textarea.value.trim();
    const lines = current ? current.split('\n').map(l => l.trim()).filter(Boolean) : [];
    if (!lines.some(l => l.toLowerCase() === name.toLowerCase())) {
        lines.unshift(name);
        textarea.value = lines.join('\n');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const quoteNameInput = document.getElementById('quoteName');
    if (quoteNameInput) {
        quoteNameInput.addEventListener('change', () => {
            syncQuoteNameToDomains(quoteNameInput.value.trim());
        });
    }
});

function addDomainToAnalysis(domain) {
    const textarea = document.getElementById('domainsInput');
    if (!textarea) return;
    const current = textarea.value.trim();
    const lines = current ? current.split('\n').map(l => l.trim()).filter(Boolean) : [];
    if (lines.some(l => l.toLowerCase() === domain.toLowerCase())) {
        if (window.showAlert) window.showAlert(`${domain} jest już na liście`, 'info');
        return;
    }
    lines.push(domain);
    textarea.value = lines.join('\n');
    if (window.showAlert) window.showAlert(`Dodano ${domain} do analizy`, 'success');
    textarea.scrollTop = textarea.scrollHeight;
}

let _cachedBrandBrief = null;

function getClientBusinessDescription() {
    if (_cachedBrandBrief?.company_info) {
        const info = _cachedBrandBrief.company_info;
        if (typeof info === 'string') {
            const trimmed = info.trim();
            if (trimmed && trimmed !== 'Brak danych') return trimmed;
        }
    }

    const container = document.getElementById('brandBriefContent');
    const firstP = container?.querySelector('.mb-4 p');
    if (firstP) {
        const t = firstP.textContent.trim();
        if (t && t !== 'Brak danych') return t;
    }

    return '';
}

window.getClientBusinessDescription = getClientBusinessDescription;

function syncAiKeywordsDescription() {
    const display = document.getElementById('aiClientDescriptionDisplay');
    if (!display) return;
    const desc = getClientBusinessDescription();
    if (desc) {
        display.innerHTML = `<span class="text-light" style="white-space: pre-wrap;">${desc.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</span>`;
    } else {
        display.innerHTML = '<span class="text-muted">Wygeneruj <strong class="text-light">Brief AI</strong> u góry strony (Parametry wyceny → Brief AI).</span>';
    }
}

function initAiKeywordsModal() {
    const modal = document.getElementById('aiKeywordsModal');
    if (!modal) return;
    modal.addEventListener('show.bs.modal', syncAiKeywordsDescription);
    window.addEventListener('brandBriefUpdated', syncAiKeywordsDescription);
}

async function generateBrandBrief() {
    const domain = (document.getElementById('quoteName')?.value || '').trim();
    if (!domain) {
        alert('Podaj nazwę wyceny (domenę klienta)');
        return;
    }

    const btn = document.getElementById('generateBriefBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Generuję brief...';

    try {
        const resp = await fetch('/api/brand-brief/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ domain }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Błąd API');

        const brief = data.brief || {};
        renderBrandBrief(brief);
        saveBrandBrief(brief);

        if (window.showAlert) window.showAlert('Brief marki wygenerowany', 'success');
    } catch (e) {
        console.error('Brand brief error:', e);
        if (window.showAlert) window.showAlert(e.message, 'danger');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-stars"></i> Brief AI';
    }
}

function _getQuoteId() {
    if (typeof currentQuoteId !== 'undefined' && currentQuoteId) return currentQuoteId;
    return new URLSearchParams(window.location.search).get('id');
}

async function saveBrandBrief(brief) {
    const qid = _getQuoteId();
    if (!qid || !brief) return;
    try {
        await fetch(`/api/quotes/${qid}/brief`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ brief }),
        });
    } catch (e) {
        console.error('Błąd zapisu briefu:', e);
    }
}

async function loadBrandBrief() {
    const qid = _getQuoteId();
    if (!qid) return;
    try {
        const resp = await fetch(`/api/quotes/${qid}/brief`);
        const data = await resp.json();
        if (data.brief) {
            renderBrandBrief(data.brief);
        }
    } catch (e) {
        console.error('Błąd ładowania briefu:', e);
    }
}

function renderBrandBrief(brief) {
    _cachedBrandBrief = brief || null;
    const section = document.getElementById('brandBriefSection');
    const container = document.getElementById('brandBriefContent');
    if (!section || !container) return;

    const sections = [
        { key: 'company_info', title: 'Podstawowe informacje o firmie', icon: 'bi-building' },
        { key: 'personas', title: 'Persony zakupowe / grupy odbiorców', icon: 'bi-people' },
        { key: 'usp', title: 'Przewagi konkurencyjne / USP', icon: 'bi-trophy' },
        { key: 'channels', title: 'Kanały sprzedażowe i model biznesowy', icon: 'bi-diagram-3' },
        { key: 'reviews', title: 'Opinie o marce', icon: 'bi-chat-quote' },
        { key: 'seasonality', title: 'Sezonowość produktów', icon: 'bi-calendar-event' },
        { key: 'site_structure', title: 'Struktura serwisu', icon: 'bi-layout-text-sidebar' },
        { key: 'revenue', title: 'Przychody spółki', icon: 'bi-cash-stack' },
    ];

    container.innerHTML = sections.map(s => {
        const raw = brief[s.key] || 'Brak danych';
        let formatted;
        if (Array.isArray(raw)) {
            formatted = raw.map(item => {
                if (typeof item === 'object' && item.name) {
                    return `<strong>${item.name}</strong>: ${item.description || ''}`;
                }
                return String(item);
            }).join('<br><br>');
        } else {
            formatted = String(raw).replace(/\n/g, '<br>');
        }
        formatted = formatted.replace(
            /(https?:\/\/[^\s<]+)/g,
            '<a href="$1" target="_blank" class="text-info">$1</a>'
        );
        return `
            <div class="mb-4">
                <h6 class="text-info"><i class="bi ${s.icon} me-2"></i>${s.title}</h6>
                <p class="text-light mb-0" style="white-space: pre-wrap;">${formatted}</p>
            </div>
        `;
    }).join('<hr class="border-secondary">');

    section.classList.remove('d-none');
    window.dispatchEvent(new CustomEvent('brandBriefUpdated'));
}

async function generateAIKeywords() {
    syncAiKeywordsDescription();
    const description = getClientBusinessDescription();
    if (!description) {
        alert('Najpierw wygeneruj Brief AI u góry strony (Parametry wyceny → Brief AI).');
        return;
    }

    const domain = (document.getElementById('quoteName')?.value || '').trim();
    const btn = document.getElementById('generateAIKeywordsBtn');
    const status = document.getElementById('aiKeywordsStatus');

    btn.disabled = true;
    status.classList.remove('d-none');

    try {
        const resp = await fetch('/api/keywords/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ domain, description }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Błąd API');

        const keywords = data.keywords || [];
        if (!keywords.length) throw new Error('Gemini nie zwróciło słów kluczowych');

        const textarea = document.getElementById('keywordsInput');
        const current = (textarea.value || '').trim();
        textarea.value = current ? current + '\n' + keywords.join('\n') : keywords.join('\n');

        const modal = bootstrap.Modal.getInstance(document.getElementById('aiKeywordsModal'));
        if (modal) modal.hide();

        if (window.showAlert) window.showAlert(`Dodano ${keywords.length} słów kluczowych z AI`, 'success');
    } catch (e) {
        console.error('AI Keywords error:', e);
        if (window.showAlert) window.showAlert(e.message, 'danger');
    } finally {
        btn.disabled = false;
        status.classList.add('d-none');
    }
}

function setCompetitorsLoadingState(isLoading) {
    const button = document.getElementById('analyzeCompetitorsBtn');
    const progress = document.getElementById('competitorsProgress');
    
    if (isLoading) {
        button.disabled = true;
        button.innerHTML = '<i class="bi bi-hourglass-split"></i> Analizuję...';
        progress.classList.remove('d-none');
    } else {
        button.disabled = false;
        button.innerHTML = '<i class="bi bi-search"></i> Analizuj konkurencję';
        progress.classList.add('d-none');
    }
}

function showCompetitorsError(message) {
    const errorDiv = document.getElementById('competitorsError');
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.classList.remove('d-none');
    }
}

function hideCompetitorsError() {
    const errorDiv = document.getElementById('competitorsError');
    if (errorDiv) {
        errorDiv.classList.add('d-none');
    }
}

function hideCompetitorsResults() {
    const resultsDiv = document.getElementById('competitorsResults');
    if (resultsDiv) {
        resultsDiv.classList.add('d-none');
    }
}

// Modal Sliders Initialization
function initModalSliders() {
    // Linki modal sliders
    const linkiFrom = document.getElementById('linkiFromMonth');
    const linkiTo = document.getElementById('linkiToMonth');
    
    if (linkiFrom && linkiTo) {
        linkiFrom.addEventListener('input', () => updateLinkiMonthRange());
        linkiTo.addEventListener('input', () => updateLinkiMonthRange());
    }
    
    // Content modal sliders
    const contentFrom = document.getElementById('contentFromMonth');
    const contentTo = document.getElementById('contentToMonth');
    
    if (contentFrom && contentTo) {
        contentFrom.addEventListener('input', () => updateContentMonthRange());
        contentTo.addEventListener('input', () => updateContentMonthRange());
    }
    
    // Content calculation listeners
    const contentChars = document.getElementById('contentChars');
    const contentRate = document.getElementById('contentRate');
    const contentMultiplier = document.getElementById('contentMultiplier');
    const contentNumTexts = document.getElementById('contentNumTexts');
    
    if (contentChars && contentRate && contentMultiplier && contentNumTexts) {
        contentChars.addEventListener('input', updateContentPrice);
        contentRate.addEventListener('input', updateContentPrice);
        contentMultiplier.addEventListener('input', updateContentPrice);
        contentNumTexts.addEventListener('input', updateContentPrice);
    }
}

function updateLinkiMonthRange() {
    const fromMonth = parseInt(document.getElementById('linkiFromMonth').value);
    const toMonth = parseInt(document.getElementById('linkiToMonth').value);
    
    // Ensure from <= to
    if (fromMonth > toMonth) {
        document.getElementById('linkiToMonth').value = fromMonth;
    }
    
    const fromStr = fromMonth.toString().padStart(2, '0');
    const toStr = parseInt(document.getElementById('linkiToMonth').value).toString().padStart(2, '0');
    
    document.getElementById('linkiFromMonthValue').textContent = fromStr;
    document.getElementById('linkiToMonthValue').textContent = toStr;
    
    let displayText;
    if (fromMonth === parseInt(document.getElementById('linkiToMonth').value)) {
        displayText = `Miesiąc ${fromStr}`;
    } else {
        displayText = `Od Miesiąc ${fromStr} do Miesiąc ${toStr}`;
    }
    document.getElementById('linkiMonthDisplay').textContent = displayText;
}

function updateContentMonthRange() {
    const fromMonth = parseInt(document.getElementById('contentFromMonth').value);
    const toMonth = parseInt(document.getElementById('contentToMonth').value);
    
    // Ensure from <= to
    if (fromMonth > toMonth) {
        document.getElementById('contentToMonth').value = fromMonth;
    }
    
    const fromStr = fromMonth.toString().padStart(2, '0');
    const toStr = parseInt(document.getElementById('contentToMonth').value).toString().padStart(2, '0');
    
    document.getElementById('contentFromMonthValue').textContent = fromStr;
    document.getElementById('contentToMonthValue').textContent = toStr;
    
    let displayText;
    if (fromMonth === parseInt(document.getElementById('contentToMonth').value)) {
        displayText = `Miesiąc ${fromStr}`;
    } else {
        displayText = `Od Miesiąc ${fromStr} do Miesiąc ${toStr}`;
    }
    document.getElementById('contentMonthDisplay').textContent = displayText;
}

function updateContentPrice() {
    const chars = parseFloat(document.getElementById('contentChars').value) || 0;
    const rate = parseFloat(document.getElementById('contentRate').value) || 0;
    const multiplier = parseFloat(document.getElementById('contentMultiplier').value) || 1;
    const numTexts = parseInt(document.getElementById('contentNumTexts').value) || 0;
    
    const totalPrice = chars * rate * multiplier * numTexts;
    document.getElementById('contentTotalPrice').textContent = formatCurrency(totalPrice);
}

function getLinkiMonthValue() {
    const fromMonth = parseInt(document.getElementById('linkiFromMonth').value);
    const toMonth = parseInt(document.getElementById('linkiToMonth').value);
    
    if (fromMonth === toMonth) {
        return `Miesiąc ${fromMonth.toString().padStart(2, '0')}`;
    } else {
        return `Od Miesiąc ${fromMonth.toString().padStart(2, '0')}`;
    }
}

function getContentMonthValue() {
    const fromMonth = parseInt(document.getElementById('contentFromMonth').value);
    const toMonth = parseInt(document.getElementById('contentToMonth').value);
    
    if (fromMonth === toMonth) {
        return `Miesiąc ${fromMonth.toString().padStart(2, '0')}`;
    } else {
        return `Od Miesiąc ${fromMonth.toString().padStart(2, '0')}`;
    }
}

// Modal Functions
function addLinkiBudgetTask() {
    const modal = new bootstrap.Modal(document.getElementById('linkiModal'));
    modal.show();
}

function addContentTask() {
    const modal = new bootstrap.Modal(document.getElementById('contentModal'));
    // Update price on modal open
    updateContentPrice();
    modal.show();
}

async function saveLinkiTasks() {
    if (!currentQuote || !currentQuote.id) {
        showAlert('Najpierw zapisz wycenę', 'warning');
        return;
    }
    
    const budget = parseFloat(document.getElementById('linkiBudget').value) || 0;
    
    if (budget <= 0) {
        showAlert('Proszę podać budżet większy niż 0', 'warning');
        return;
    }
    
    const clientMonth = getLinkiMonthValue();
    
    // LB marża (15%)
    const marzaPrice = budget * 0.15;
    const marzaData = {
        task_name: 'LB marża',
        specialist_type: 'Senior SEO',
        month_execution: '',
        hours_or_units: marzaPrice / 300,  // 300 zł per hour for Senior SEO
        price_per_unit: 300,
        total_price: marzaPrice,
        client_units: marzaPrice / 300,
        client_price: marzaPrice,
        client_month: clientMonth
    };
    
    // LB budżet mediowy (85%)
    const budzetPrice = budget * 0.85;
    const budzetData = {
        task_name: 'LB budżet mediowy',
        specialist_type: 'Senior SEO',
        month_execution: '',
        hours_or_units: budzetPrice / 300,
        price_per_unit: 300,
        total_price: budzetPrice,
        client_units: budzetPrice / 300,
        client_price: budzetPrice,
        client_month: clientMonth
    };
    
    try {
        // Save first task
        const response1 = await fetch(`/api/quotes/${currentQuote.id}/items`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(marzaData)
        });
        
        // Save second task
        const response2 = await fetch(`/api/quotes/${currentQuote.id}/items`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(budzetData)
        });
        
        if (response1.ok && response2.ok) {
            showAlert('Dodano 2 zadania linkbuilding', 'success');
            bootstrap.Modal.getInstance(document.getElementById('linkiModal')).hide();
            loadQuote(currentQuote.id);
        } else {
            throw new Error('Failed to add tasks');
        }
    } catch (error) {
        console.error('Error adding linki tasks:', error);
        showAlert('Błąd podczas dodawania zadań', 'danger');
    }
}

async function saveContentTask() {
    if (!currentQuote || !currentQuote.id) {
        showAlert('Najpierw zapisz wycenę', 'warning');
        return;
    }
    
    const chars = parseFloat(document.getElementById('contentChars').value) || 0;
    const rate = parseFloat(document.getElementById('contentRate').value) || 0;
    const multiplier = parseFloat(document.getElementById('contentMultiplier').value) || 1;
    const numTexts = parseInt(document.getElementById('contentNumTexts').value) || 0;
    
    if (chars <= 0 || rate <= 0 || numTexts <= 0) {
        showAlert('Proszę wypełnić wszystkie pola', 'warning');
        return;
    }
    
    const totalPrice = chars * rate * multiplier * numTexts;
    const clientMonth = getContentMonthValue();
    
    const taskData = {
        task_name: `Napisanie treści (${multiplier}x stawka za 1000 znaków)`,
        specialist_type: 'Copywriter Content',
        month_execution: '',
        hours_or_units: chars * numTexts,
        price_per_unit: rate,
        total_price: totalPrice,
        client_units: chars * numTexts,
        client_price: totalPrice,
        client_month: clientMonth
    };
    
    try {
        const response = await fetch(`/api/quotes/${currentQuote.id}/items`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(taskData)
        });
        
        if (response.ok) {
            showAlert('Dodano zadanie napisania treści', 'success');
            bootstrap.Modal.getInstance(document.getElementById('contentModal')).hide();
            loadQuote(currentQuote.id);
        } else {
            throw new Error('Failed to add task');
        }
    } catch (error) {
        console.error('Error adding content task:', error);
        showAlert('Błąd podczas dodawania zadania', 'danger');
    }
}

