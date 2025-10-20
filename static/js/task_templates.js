// Task Templates management functionality
let templates = [];
let pricelist = [];
let editingTemplateId = null;

// Load data on page load
document.addEventListener('DOMContentLoaded', function() {
    loadPricelist();
    loadTemplates();
});

async function loadPricelist() {
    try {
        const response = await fetch('/api/pricelist');
        const data = await response.json();
        pricelist = data.pricelist;
        populateSpecialistDropdown();
    } catch (error) {
        console.error('Error loading pricelist:', error);
        showAlert('Błąd podczas ładowania cennika', 'danger');
    }
}

function populateSpecialistDropdown() {
    const dropdown = document.getElementById('templateSpecialistType');
    dropdown.innerHTML = '<option value="">Wybierz specjalistę</option>';
    
    pricelist.forEach(item => {
        const option = document.createElement('option');
        option.value = item.specialist_type;
        option.textContent = item.specialist_type;
        option.dataset.price = item.price_per_unit;
        dropdown.appendChild(option);
    });
}

async function loadTemplates() {
    try {
        const response = await fetch('/api/default-tasks');
        const data = await response.json();
        templates = data.default_tasks;
        renderTemplatesTable();
    } catch (error) {
        console.error('Error loading templates:', error);
        showAlert('Błąd podczas ładowania szablonów', 'danger');
    }
}

function renderTemplatesTable() {
    const tbody = document.querySelector('#templatesTable tbody');
    tbody.innerHTML = '';

    if (templates.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="10" class="text-center text-muted">
                    Brak szablonów. <a href="#" onclick="addNewTemplate()">Dodaj pierwszy szablon</a>
                </td>
            </tr>
        `;
        return;
    }

    templates.forEach(template => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${template.task_name}</td>
            <td>${template.specialist_type}</td>
            <td>${template.month_execution || ''}</td>
            <td>${template.hours_or_units}</td>
            <td>${formatCurrency(template.price_per_unit)}</td>
            <td>${formatCurrency(template.total_price)}</td>
            <td>${template.client_units}</td>
            <td>${formatCurrency(template.client_price)}</td>
            <td>${template.client_month || ''}</td>
            <td>
                <div class="btn-group btn-group-sm" role="group">
                    <button class="btn btn-outline-primary" onclick="editTemplate(${template.id})" title="Edytuj">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-outline-danger" onclick="deleteTemplate(${template.id})" title="Usuń">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function addNewTemplate() {
    editingTemplateId = null;
    document.getElementById('templateModalTitle').textContent = 'Dodaj nowy szablon';
    document.getElementById('templateForm').reset();
    document.getElementById('templatePricePerUnit').value = '';
    document.getElementById('templateTotalPrice').value = '';
    
    const modal = new bootstrap.Modal(document.getElementById('templateModal'));
    modal.show();
}

function editTemplate(templateId) {
    const template = templates.find(t => t.id === templateId);
    if (!template) return;

    editingTemplateId = templateId;
    document.getElementById('templateModalTitle').textContent = 'Edytuj szablon';
    
    // Fill form with template data
    document.getElementById('templateTaskName').value = template.task_name;
    document.getElementById('templateSpecialistType').value = template.specialist_type;
    document.getElementById('templateMonthExecution').value = template.month_execution || '';
    document.getElementById('templateHoursOrUnits').value = template.hours_or_units || 0;
    document.getElementById('templatePricePerUnit').value = template.price_per_unit || 0;
    document.getElementById('templateTotalPrice').value = template.total_price || 0;
    document.getElementById('templateClientUnits').value = template.client_units || 0;
    document.getElementById('templateClientPrice').value = template.client_price || 0;
    document.getElementById('templateClientMonth').value = template.client_month || '';
    
    const modal = new bootstrap.Modal(document.getElementById('templateModal'));
    modal.show();
}

async function saveTemplate() {
    const form = document.getElementById('templateForm');
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    const templateData = {
        task_name: document.getElementById('templateTaskName').value.trim(),
        specialist_type: document.getElementById('templateSpecialistType').value,
        month_execution: document.getElementById('templateMonthExecution').value.trim(),
        hours_or_units: parseFloat(document.getElementById('templateHoursOrUnits').value) || 0,
        price_per_unit: parseFloat(document.getElementById('templatePricePerUnit').value) || 0,
        total_price: parseFloat(document.getElementById('templateTotalPrice').value) || 0,
        client_units: parseFloat(document.getElementById('templateClientUnits').value) || 0,
        client_price: parseFloat(document.getElementById('templateClientPrice').value) || 0,
        client_month: document.getElementById('templateClientMonth').value
    };

    try {
        const url = editingTemplateId 
            ? `/api/default-tasks/${editingTemplateId}`
            : '/api/default-tasks';
        
        const method = editingTemplateId ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(templateData)
        });

        if (response.ok) {
            showAlert(editingTemplateId ? 'Szablon został zaktualizowany' : 'Szablon został dodany', 'success');
            bootstrap.Modal.getInstance(document.getElementById('templateModal')).hide();
            loadTemplates();
        } else {
            throw new Error('Failed to save template');
        }
    } catch (error) {
        console.error('Error saving template:', error);
        showAlert('Błąd podczas zapisywania szablonu', 'danger');
    }
}

async function deleteTemplate(templateId) {
    if (!confirm('Czy na pewno chcesz usunąć ten szablon?')) {
        return;
    }

    try {
        const response = await fetch(`/api/default-tasks/${templateId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showAlert('Szablon został usunięty', 'success');
            loadTemplates();
        } else {
            throw new Error('Failed to delete template');
        }
    } catch (error) {
        console.error('Error deleting template:', error);
        showAlert('Błąd podczas usuwania szablonu', 'danger');
    }
}

// Event listeners for specialist selection and price calculation
document.addEventListener('DOMContentLoaded', function() {
    const specialistSelect = document.getElementById('templateSpecialistType');
    const pricePerUnitInput = document.getElementById('templatePricePerUnit');
    const hoursOrUnitsInput = document.getElementById('templateHoursOrUnits');
    const totalPriceInput = document.getElementById('templateTotalPrice');
    
    if (specialistSelect) {
        specialistSelect.addEventListener('change', function() {
            const selectedOption = this.options[this.selectedIndex];
            const price = selectedOption.dataset.price;
            if (price) {
                pricePerUnitInput.value = price;
                calculateTemplateTotalPrice();
            }
        });
    }
    
    if (hoursOrUnitsInput) {
        hoursOrUnitsInput.addEventListener('input', calculateTemplateTotalPrice);
    }
    
    function calculateTemplateTotalPrice() {
        const pricePerUnit = parseFloat(pricePerUnitInput.value) || 0;
        const hoursOrUnits = parseFloat(hoursOrUnitsInput.value) || 0;
        const total = pricePerUnit * hoursOrUnits;
        totalPriceInput.value = total.toFixed(2);
    }
});

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
