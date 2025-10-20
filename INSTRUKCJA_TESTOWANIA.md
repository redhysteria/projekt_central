# Instrukcja testowania napraw

## WAŻNE! Przed testowaniem:

### 1. **Wyczyść cache przeglądarki**
- **Chrome/Edge**: Ctrl+Shift+Delete (Windows) lub Cmd+Shift+Delete (Mac)
- **Firefox**: Ctrl+Shift+Delete (Windows) lub Cmd+Shift+Delete (Mac)
- LUB po prostu naciśnij **Ctrl+F5** (Windows) lub **Cmd+Shift+R** (Mac) na stronie

### 2. **Otwórz konsolę deweloperską**
- Naciśnij **F12** lub **Ctrl+Shift+I** (Windows) / **Cmd+Option+I** (Mac)
- Przejdź do zakładki **Console**
- Sprawdź czy NIE MA błędów JavaScript (czerwone komunikaty)

## Co zostało naprawione:

### ✅ 1. Lista specjalistów w "Dodaj nowe zadanie"
**Problem:** Dropdown był pusty  
**Rozwiązanie:** Naprawiono funkcję `populateSpecialistDropdown()`

**Jak przetestować:**
1. Otwórz wycenę (http://localhost:5002/quotes?id=5)
2. Znajdź sekcję "Dodaj nowe zadanie"
3. Kliknij na dropdown "Specjalista"
4. **POWINNO SIĘ POJAWIĆ:** Lista wszystkich specjalistów (Mid SEO, Senior SEO, etc.)

### ✅ 2. Automatyczna aktualizacja ceny
**Problem:** Po wyborze specjalisty cena się nie aktualizowała  
**Rozwiązanie:** Dodano event handlery do aktualizacji ceny

**Jak przetestować:**
1. W sekcji "Dodaj nowe zadanie"
2. Wybierz specjalistę z dropdown (np. "Mid SEO")
3. **POWINNO SIĘ AUTOMATYCZNIE POJAWIĆ:** Cena j.m. (np. 250,00 dla Mid SEO)
4. Zmień "Liczba j.m." na np. 10
5. **POWINNO SIĘ AUTOMATYCZNIE ZAKTUALIZOWAĆ:** Cena całkowita (np. 2500,00 zł)

### ✅ 3. Dodawanie zadania
**Problem:** Nie można było dodać zadania  
**Rozwiązanie:** Naprawiono walidację i wysyłanie do API

**Jak przetestować:**
1. W sekcji "Dodaj nowe zadanie":
   - Wpisz nazwę: "Test Zadanie"
   - Wybierz specjalistę: "Mid SEO"
   - Ustaw liczbę j.m.: 10
   - Zostaw miesiące: 01-01
2. Kliknij "Dodaj zadanie"
3. **POWINNO SIĘ POJAWIĆ:** 
   - Zielony komunikat "Zadanie zostało dodane"
   - Nowy wiersz w tabeli "Lista zadań"

### ✅ 4. Analiza konkurencji SEO
**Problem:** Kliknięcie "Analizuj konkurencję" nic nie robiło  
**Rozwiązanie:** Backend działał, należy sprawdzić czy frontend wyświetla wyniki

**Jak przetestować:**
1. W sekcji "Analiza konkurencji SEO"
2. Wpisz słowa kluczowe (po jednym w linii):
   ```
   opony zimowe
   felgi aluminiowe
   serwis samochodowy
   naprawy aut
   lakiernia samochodowa
   ```
3. Kliknij "Analizuj konkurencję"
4. **POWINNO SIĘ POJAWIĆ:**
   - Spinner z tekstem "Analizuję słowa kluczowe..."
   - Po ~10-30 sekundach tabela z wynikami
   - Lista domen konkurentów z liczbą wystąpień

**Jeśli nic się nie dzieje:**
- Otwórz konsolę (F12)
- Sprawdź czy są błędy JavaScript
- Sprawdź zakładkę Network - czy request do `/api/quotes/5/competitors` się wykonał

### ✅ 5. Analiza SEO domen
**Problem:** Kliknięcie "Analizuj domeny SEO" nic nie robiło  
**Rozwiązanie:** Backend działał, należy sprawdzić czy frontend wyświetla wyniki

**Jak przetestować:**
1. W sekcji "Analiza SEO konkurencji"
2. Wpisz domeny (po jednej w linii):
   ```
   oponeo.pl
   opony.com.pl
   intercars.pl
   ```
3. Kliknij "Analizuj domeny SEO"
4. **POWINNO SIĘ POJAWIĆ:**
   - Spinner z tekstem "Analizuję domeny SEO..."
   - Po ~5-10 sekundach tabela z wynikami
   - Dane SEO: Domain Rating, TOP 3, TOP 10, etc.
   - Wiersz "ŚREDNIO" na dole tabeli
   - Przycisk "Eksportuj do CSV"

**Jeśli nic się nie dzieje:**
- Otwórz konsolę (F12)
- Sprawdź czy są błędy JavaScript
- Sprawdź zakładkę Network - czy request do `/api/quotes/5/seo-analysis` się wykonał

## Sprawdzenie czy aplikacja działa:

### Test 1: Backend API
```bash
# Otwórz terminal i wykonaj:
curl http://localhost:5002/api/quotes/5/competitors
# Powinno zwrócić JSON z listą konkurentów

curl http://localhost:5002/api/quotes/5/seo-analysis
# Powinno zwrócić JSON z wynikami SEO
```

### Test 2: Frontend JavaScript
1. Otwórz http://localhost:5002/quotes?id=5
2. Otwórz konsolę deweloperską (F12)
3. W konsoli wpisz:
   ```javascript
   console.log('Pricelist:', pricelist);
   console.log('Current Quote:', currentQuote);
   ```
4. Powinny się wyświetlić obiekty z danymi

## Jeśli coś nadal nie działa:

### 1. JavaScript się nie ładuje
- Sprawdź konsolę - czy są błędy?
- Sprawdź zakładkę Network - czy pliki .js się pobrały?

### 2. Funkcje nie działają
- Otwórz konsolę
- Kliknij na problematyczny przycisk
- Sprawdź czy pojawił się błąd w konsoli
- Skopiuj błąd i przekaż mi

### 3. API nie zwraca danych
- Sprawdź terminal gdzie działa aplikacja
- Sprawdź czy w terminalu pojawiają się logi z emoji (🔍, ✅, ❌)
- Jeśli widzisz błędy - przekaż mi

## Logi aplikacji

Sprawdź logi aplikacji:
```bash
tail -f /tmp/app_log.txt
```

Powinny się wyświetlać emoji:
- 🔍 = rozpoczęcie analizy
- ✅ = sukces
- ❌ = błąd
- 📊 = przetwarzanie danych

## Kontakt

Jeśli coś nadal nie działa, wyślij mi:
1. Screenshot konsoli deweloperskiej (F12 -> Console)
2. Screenshot zakładki Network (F12 -> Network) 
3. Dokładny opis co robisz i co się dzieje (lub nie dzieje)

