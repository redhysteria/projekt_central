// Quotes list management
let quotes = [];
let quoteToDelete = null;

// Load quotes on page load
document.addEventListener('DOMContentLoaded', function() {
    loadQuotes();
    
    // Setup delete confirmation handler
    const confirmButton = document.getElementById('confirmButton');
    if (confirmButton) {
        confirmButton.addEventListener('click', confirmDelete);
    }
    
    // Clear quoteToDelete when modal is hidden
    const confirmModal = document.getElementById('confirmModal');
    if (confirmModal) {
        confirmModal.addEventListener('hidden.bs.modal', function() {
            quoteToDelete = null;
        });
    }
});

async function loadQuotes() {
    try {
        const response = await fetch('/api/quotes');
        const data = await response.json();
        quotes = data.quotes;
        renderQuotesTable();
    } catch (error) {
        console.error('Error loading quotes:', error);
        showAlert('Błąd podczas ładowania wycen', 'danger');
    }
}

function renderQuotesTable() {
    const tbody = document.querySelector('#quotesTable tbody');
    tbody.innerHTML = '';

    if (quotes.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center text-muted">
                    Brak wycen. <a href="#" onclick="createNewQuote()">Utwórz pierwszą wycenę</a>
                </td>
            </tr>
        `;
        return;
    }

    quotes.forEach(quote => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${quote.name}</td>
            <td>${formatDate(quote.created_at)}</td>
            <td>${formatDate(quote.updated_at)}</td>
            <td>${formatCurrency(quote.total_value)}</td>
            <td>
                <div class="btn-group btn-group-sm" role="group">
                    <button class="btn btn-outline-primary" onclick="editQuote(${quote.id})" title="Edytuj">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-outline-success" onclick="exportQuote(${quote.id})" title="Eksportuj do Excel">
                        <i class="bi bi-file-excel"></i>
                    </button>
                    <button class="btn btn-outline-danger" onclick="deleteQuote(${quote.id})" title="Usuń">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function createNewQuote() {
    document.getElementById('quoteName').value = '';
    const modal = new bootstrap.Modal(document.getElementById('newQuoteModal'));
    modal.show();
}

async function saveNewQuote() {
    const name = document.getElementById('quoteName').value.trim();
    
    if (!name) {
        showAlert('Proszę podać nazwę wyceny', 'warning');
        return;
    }

    try {
        const response = await fetch('/api/quotes', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: name
            })
        });

        if (response.ok) {
            const result = await response.json();
            showAlert('Wycena została utworzona', 'success');
            bootstrap.Modal.getInstance(document.getElementById('newQuoteModal')).hide();
            
            // Redirect to quote editor
            window.location.href = `/quotes?id=${result.id}`;
        } else {
            throw new Error('Failed to create quote');
        }
    } catch (error) {
        console.error('Error creating quote:', error);
        showAlert('Błąd podczas tworzenia wyceny', 'danger');
    }
}

function editQuote(quoteId) {
    window.location.href = `/quotes?id=${quoteId}`;
}

async function exportQuote(quoteId) {
    try {
        const response = await fetch(`/api/quotes/${quoteId}/export`);
        
        if (response.ok) {
            // Get filename from Content-Disposition header
            const contentDisposition = response.headers.get('Content-Disposition');
            let filename = 'wycena.xlsx';
            if (contentDisposition) {
                const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
                if (filenameMatch) {
                    filename = filenameMatch[1].replace(/['"]/g, '');
                }
            }
            
            // Download file
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

function deleteQuote(quoteId) {
    const quote = quotes.find(q => q.id === quoteId);
    if (!quote) return;
    
    quoteToDelete = quoteId;
    
    document.getElementById('confirmMessage').innerHTML = `
        Czy na pewno chcesz usunąć wycenę <strong>"${quote.name}"</strong>?<br>
        <small class="text-muted">Ta operacja nie może być cofnięta.</small>
    `;
    
    const modal = new bootstrap.Modal(document.getElementById('confirmModal'));
    modal.show();
}

async function confirmDelete() {
    if (!quoteToDelete) return;
    
    try {
        const response = await fetch(`/api/quotes/${quoteToDelete}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            showAlert('Wycena została usunięta', 'success');
            // Modal will close automatically due to data-bs-dismiss
            await loadQuotes();
        } else {
            const errorText = await response.text();
            console.error('Failed to delete quote:', response.status, errorText);
            throw new Error(`Failed to delete quote: ${response.status}`);
        }
    } catch (error) {
        console.error('Error deleting quote:', error);
        showAlert('Błąd podczas usuwania wyceny: ' + error.message, 'danger');
    }
}

// Utility functions
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('pl-PL', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('pl-PL', {
        style: 'currency',
        currency: 'PLN'
    }).format(amount);
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
