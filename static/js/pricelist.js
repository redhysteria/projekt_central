// Pricelist management
let pricelist = [];
let hasUnsavedChanges = false;

// Load pricelist on page load
document.addEventListener('DOMContentLoaded', function() {
    loadPricelist();
});

async function loadPricelist() {
    try {
        const response = await fetch('/api/pricelist');
        const data = await response.json();
        pricelist = data.pricelist;
        renderPricelistTable();
    } catch (error) {
        console.error('Error loading pricelist:', error);
        showAlert('Błąd podczas ładowania cennika', 'danger');
    }
}

function renderPricelistTable() {
    const tbody = document.querySelector('#pricelistTable tbody');
    tbody.innerHTML = '';

    pricelist.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item.specialist_type}</td>
            <td>
                <div class="input-group input-group-sm">
                    <input type="number" class="form-control price-input" 
                           value="${item.price_per_unit}" 
                           data-id="${item.id}"
                           step="0.01" min="0">
                    <span class="input-group-text">zł</span>
                </div>
            </td>
            <td>
                <span class="badge bg-secondary">${getUnitTypeLabel(item.unit_type)}</span>
            </td>
            <td>
                <span class="badge bg-success">Zapisane</span>
            </td>
        `;
        tbody.appendChild(row);
    });

    // Add event listeners to price inputs
    const priceInputs = document.querySelectorAll('.price-input');
    priceInputs.forEach(input => {
        input.addEventListener('input', function() {
            markAsChanged(this);
        });
    });
}

function getUnitTypeLabel(unitType) {
    const labels = {
        'hour': 'godzina',
        '1000chars': '1000 znaków',
        'piece': 'sztuka'
    };
    return labels[unitType] || unitType;
}

function markAsChanged(input) {
    hasUnsavedChanges = true;
    
    // Update status badge
    const row = input.closest('tr');
    const statusBadge = row.querySelector('.badge');
    statusBadge.textContent = 'Nie zapisane';
    statusBadge.className = 'badge bg-warning';
    
    // Enable save button
    const saveButton = document.querySelector('button[onclick="saveAllPrices()"]');
    if (saveButton) {
        saveButton.disabled = false;
        saveButton.innerHTML = '<i class="bi bi-check-circle"></i> Zapisz wszystkie zmiany';
    }
}

async function saveAllPrices() {
    if (!hasUnsavedChanges) {
        showAlert('Brak zmian do zapisania', 'info');
        return;
    }

    const priceInputs = document.querySelectorAll('.price-input');
    const updates = [];

    for (const input of priceInputs) {
        const id = input.dataset.id;
        const newPrice = parseFloat(input.value);
        
        if (isNaN(newPrice) || newPrice < 0) {
            showAlert('Proszę podać prawidłową cenę (liczba >= 0)', 'warning');
            input.focus();
            return;
        }

        const currentItem = pricelist.find(item => item.id == id);
        if (currentItem && currentItem.price_per_unit !== newPrice) {
            updates.push({ id: id, price_per_unit: newPrice });
        }
    }

    if (updates.length === 0) {
        showAlert('Brak zmian do zapisania', 'info');
        return;
    }

    try {
        // Save all updates
        const promises = updates.map(update => 
            fetch(`/api/pricelist/${update.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    price_per_unit: update.price_per_unit
                })
            })
        );

        await Promise.all(promises);
        
        // Update local data
        updates.forEach(update => {
            const item = pricelist.find(item => item.id == update.id);
            if (item) {
                item.price_per_unit = update.price_per_unit;
            }
        });

        // Reset UI
        hasUnsavedChanges = false;
        renderPricelistTable();
        
        showAlert(`Zapisano ${updates.length} zmian w cenniku`, 'success');

    } catch (error) {
        console.error('Error saving prices:', error);
        showAlert('Błąd podczas zapisywania zmian', 'danger');
    }
}

function showAlert(message, type) {
    // Remove existing alerts
    const existingAlerts = document.querySelectorAll('.alert');
    existingAlerts.forEach(alert => alert.remove());

    // Create new alert
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;

    // Insert at top of container
    const container = document.querySelector('.container');
    container.insertBefore(alertDiv, container.firstChild);

    // Auto-hide after 5 seconds
    setTimeout(() => {
        if (alertDiv.parentNode) {
            alertDiv.remove();
        }
    }, 5000);
}

// Warn user before leaving page with unsaved changes
window.addEventListener('beforeunload', function(e) {
    if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = 'Masz niezapisane zmiany w cenniku. Czy na pewno chcesz opuścić stronę?';
    }
});
