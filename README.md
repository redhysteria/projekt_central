# Aplikacja Wyceny SEO/Content

Aplikacja webowa do tworzenia i zarządzania wycenami projektów SEO i Content Marketing z automatycznym rozkładem miesięcznym i eksportem do Excel.

## Funkcjonalności

### 🎯 Główne funkcje
- **Tworzenie wycen** - zarządzanie projektami SEO/Content
- **Automatyczne zadania** - auto-generowanie zadań LB marża, LB budżet mediowy, Napisanie treści
- **Rozkład miesięczny** - automatyczny rozkład kosztów na 12 miesięcy
- **Zarządzanie cennikiem** - edycja stawek specjalistów
- **Eksport Excel** - eksport wycen w formacie identycznym z Google Sheets

### 📊 Automatyczne zadania
- **LB marża** (15% kwoty LB) - rozkład od wybranego miesiąca
- **LB budżet mediowy** (85% kwoty LB) - rozkład od wybranego miesiąca  
- **Napisanie treści** - kalkulacja: stawka × mnożnik × znaki × liczba tekstów

### 📅 Rozkład miesięczny
- **"Miesiąc XX"** - kwota trafia do konkretnego miesiąca
- **"Od Miesiąc XX"** - kwota trafia od wybranego miesiąca do końca roku
- **Automatyczne sumy** - suma miesięczna i suma zadań

## Instalacja i uruchomienie

### Wymagania
- Python 3.8+
- pip

### Kroki instalacji

1. **Sklonuj repozytorium**
```bash
cd /Users/piotr/Documents/Repozytoria/projekt_central
```

2. **Zainstaluj zależności**
```bash
pip install -r requirements.txt
```

3. **Uruchom aplikację**
```bash
python app.py
```

4. **Otwórz przeglądarkę**
```
http://localhost:5000
```

## Struktura aplikacji

```
projekt_central/
├── app.py                 # Główna aplikacja Flask + API
├── models.py              # Modele SQLAlchemy
├── business_logic.py      # Logika auto-zadań i rozkładu miesięcznego
├── excel_export.py        # Eksport do Excel
├── requirements.txt       # Zależności Python
├── static/
│   ├── css/style.css     # Style CSS
│   └── js/               # JavaScript (quotes.js, pricelist.js, quote_editor.js)
├── templates/            # Szablony HTML
└── temp/                 # Pliki tymczasowe (eksport Excel)
```

## Użytkowanie

### 1. Zarządzanie cennikiem
- Przejdź do **Cennik**
- Edytuj stawki specjalistów
- Kliknij **Zapisz wszystkie zmiany**

### 2. Tworzenie wyceny
- Kliknij **Nowa Wycena** na stronie głównej
- Wprowadź nazwę wyceny
- W **Parametrach globalnych** ustaw:
  - Kwotę LB (auto-generuje zadania LB)
  - Dane o treściach (auto-generuje "Napisanie treści")

### 3. Dodawanie zadań
- Kliknij **Dodaj zadanie**
- Wypełnij formularz:
  - Nazwa zadania
  - Specjalista (wybiera stawkę z cennika)
  - J.m. klient (liczba jednostek)
  - Cena klient
  - Miesiąc realizacji - klient

### 4. Rozkład miesięczny
- Automatycznie kalkulowany na podstawie "Miesiąc realizacji - klient"
- Widoczny w tabeli **Rozkład miesięczny**
- Sumy miesięczne i sumy zadań

### 5. Eksport
- Kliknij **Eksport Excel** w edytorze wyceny
- Pobierany plik ma strukturę identyczną z Google Sheets

## API Endpoints

```
GET    /api/pricelist                 # Pobierz cennik
PUT    /api/pricelist/:id             # Aktualizuj stawkę
POST   /api/quotes                    # Utwórz nową wycenę
GET    /api/quotes                    # Lista wycen
GET    /api/quotes/:id                # Szczegóły wyceny
PUT    /api/quotes/:id                # Aktualizuj wycenę
DELETE /api/quotes/:id                # Usuń wycenę
POST   /api/quotes/:id/items          # Dodaj pozycję
PUT    /api/quotes/:id/items/:item_id # Aktualizuj pozycję
DELETE /api/quotes/:id/items/:item_id # Usuń pozycję
GET    /api/quotes/:id/export         # Eksport do Excel
```

## Technologie

- **Backend**: Flask 3.0 + Flask-RESTful
- **Baza danych**: SQLite + SQLAlchemy 2.0
- **Frontend**: HTML5 + Bootstrap 5 + Vanilla JavaScript
- **Eksport**: openpyxl
- **Styling**: Bootstrap 5 + Custom CSS

## Cennik domyślny

Aplikacja inicjalizuje się z następującymi stawkami:

| Specjalista | Stawka | Jednostka |
|-------------|--------|-----------|
| Expert SEO | 300 zł | godzina |
| Senior SEO | 300 zł | godzina |
| Mid SEO | 250 zł | godzina |
| Junior SEO | 150 zł | godzina |
| Senior Content | 200 zł | godzina |
| Mid Content | 150 zł | godzina |
| Junior Content | 100 zł | godzina |
| Copywriter Content | 40 zł | 1000 znaków |
| Copywriter LB | 20 zł | 1000 znaków |
| Copywriter Treści marketingowe | 80 zł | 1000 znaków |
| Copywriter Treści AI | 20 zł | 1000 znaków |
| Formatka | 50 zł | sztuka |
| 1 link (średnia cena) | 400 zł | sztuka |

## Rozwiązywanie problemów

### Błąd importu
```bash
pip install --upgrade -r requirements.txt
```

### Błąd bazy danych
Usuń plik `quotes.db` i uruchom aplikację ponownie (zostanie utworzona nowa baza).

### Błąd eksportu Excel
Sprawdź czy katalog `temp/` istnieje i ma uprawnienia do zapisu.

## Licencja

Aplikacja została stworzona na potrzeby projektu central SEO/Content.
