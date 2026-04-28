# Instrukcja testowania integracji Ahrefs MCP

## Krok 1: Przygotowanie środowiska

### 1.1. Uzyskaj klucz API Ahrefs

1. Zaloguj się na konto Ahrefs: https://ahrefs.com
2. Przejdź do sekcji API: https://ahrefs.com/api
3. Wygeneruj nowy klucz API
4. Skopiuj klucz (powinien zaczynać się od `D7uD.` lub podobnie)

### 1.2. Utwórz plik .env

W katalogu głównym projektu utwórz plik `.env`:

```bash
cd /Users/piotr/Documents/Repozytoria/projekt_central
touch .env
```

### 1.3. Skonfiguruj plik .env

Otwórz plik `.env` w edytorze i dodaj:

```env
# API Keys
AHREFS_MCP_API_KEY=TWOJ_KLUCZ_API_TUTAJ
JINA_API_KEY=
GEMINI_API_KEY=

# Ahrefs MCP Settings
AHREFS_MCP_ENABLED=True
AHREFS_FALLBACK_TO_MOCK=False

# Rate Limits (requests per minute)
AHREFS_RPM=60
JINA_RPM=100
GEMINI_RPM=60

# Application Settings
DEBUG=False
```

**WAŻNE:** Zastąp `TWOJ_KLUCZ_API_TUTAJ` swoim prawdziwym kluczem z Ahrefs!

## Krok 2: Test z linii poleceń

### 2.1. Uruchom skrypt testowy

```bash
python3 test_ahrefs.py
```

### 2.2. Oczekiwane wyniki

Jeśli wszystko działa poprawnie, powinieneś zobaczyć:

```
🧪 Test Ahrefs Service
======================================================================
🔧 Konfiguracja:
   - AHREFS_MCP_ENABLED: True
   - AHREFS_MCP_API_KEY: ***xxxxxxxxxx
   - AHREFS_MCP_ENDPOINT: https://api.ahrefs.com
   - AHREFS_FALLBACK_TO_MOCK: False
   - AHREFS_RPM: 60
======================================================================

🎯 Testuję 2 domen...

📊 Test 1/2: example.com
----------------------------------------------------------------------
🔍 Ahrefs API: Pobieram Domain Rating dla example.com
🌐 Ahrefs API: Wykonuję żądanie do https://api.ahrefs.com/v3/site-explorer/domain-rating...
✅ Ahrefs API: Sukces! Parsuję odpowiedź JSON...
✅ Ahrefs API: Domain Rating dla example.com: 93.0

[... więcej logów ...]

✅ Sukces! Otrzymano dane dla example.com:
   Domain: example.com
   Domain Rating: 93.0
   Referring Domains: 15234
   Keywords TOP 3: 523
   Keywords TOP 10: 1842
   Keywords TOP 50: 8934
   URLs in TOP 10: 412
   URLs in TOP 50: 2134
   Estimated Traffic: 45623
   Data Source: ahrefs_api

[... test 2 ...]

======================================================================
📊 Podsumowanie testów:
   ✅ Sukces: 2/2
   ❌ Błędy: 0/2
======================================================================
```

### 2.3. Diagnozowanie problemów

#### Problem: Brak klucza API

```
❌ BŁĄD: Brak klucza API Ahrefs!
📝 Aby uruchomić testy:
   1. Utwórz plik .env w katalogu głównym projektu
   2. Dodaj linię: AHREFS_MCP_API_KEY=twój_klucz_api
   3. Uruchom ponownie test
```

**Rozwiązanie:** Sprawdź czy plik `.env` istnieje i zawiera klucz API.

#### Problem: Błąd 401 Unauthorized

```
❌ Ahrefs API: Unauthorized (401) - sprawdź klucz API
```

**Rozwiązanie:**
1. Zweryfikuj klucz API na https://ahrefs.com/api
2. Upewnij się że klucz jest poprawnie skopiowany (bez spacji)
3. Sprawdź czy masz aktywną subskrypcję Ahrefs

#### Problem: Błąd 429 Too Many Requests

```
⚠️  Ahrefs API: Rate limit exceeded (429)
```

**Rozwiązanie:**
1. Poczekaj kilka minut
2. Zmniejsz `AHREFS_RPM` w pliku .env (np. do 30)
3. Uruchom ponownie test

#### Problem: Brak klucza w odpowiedzi

```
❌ Ahrefs API: Brak klucza domain_rating w odpowiedzi. 
   Dostępne klucze: ['dr', 'target', 'date']
```

**Rozwiązanie:**
1. To jest oczekiwane zachowanie - kod automatycznie sprawdzi alternatywne klucze
2. Jeśli błąd się powtarza, sprawdź logi dokładniej
3. Kod obsługuje klucze: `domain_rating`, `rating`, `dr`

## Krok 3: Test przez interfejs webowy

### 3.1. Uruchom aplikację

```bash
python3 app.py
```

Powinieneś zobaczyć:
```
* Running on http://127.0.0.1:5002
```

### 3.2. Otwórz aplikację w przeglądarce

Przejdź do: http://localhost:5002

### 3.3. Utwórz lub otwórz wycenę

1. Kliknij **Nowa Wycena** lub wybierz istniejącą
2. Przewiń w dół do sekcji **Analiza ruchu Ahrefs**

### 3.4. Wprowadź domeny do analizy

W polu tekstowym wprowadź domeny (jedna na linię):
```
example.com
wikipedia.org
github.com
```

### 3.5. Uruchom analizę

1. Kliknij **Analizuj domeny SEO**
2. Poczekaj na wyniki (może potrwać kilka sekund)

### 3.6. Sprawdź wyniki

Wyniki powinny pokazać tabelę z kolumnami:
- **Domena** - nazwa domeny
- **DR** - Domain Rating
- **Domains** - Referring Domains  
- **TOP 3** - liczba słów kluczowych w TOP 3
- **TOP 10** - liczba słów kluczowych w TOP 10
- **TOP 50** - liczba słów kluczowych w TOP 50
- **URLs T10** - liczba URL w TOP 10
- **URLs T50** - liczba URL w TOP 50
- **Ruch** - szacowany ruch
- **KW/URL** - średnio słów kluczowych na URL
- **Ruch/KW** - średnio ruchu na słowo kluczowe
- **Źródło** - badge "API" lub "Mock"

**WAŻNE:** Sprawdź czy w kolumnie **Źródło** widać badge **API** (zielony). Jeśli widzisz **Mock** (szary), oznacza to, że dane nie pochodzą z Ahrefs API.

### 3.7. Sprawdź info box

Nad tabelą powinien być zielony info box:
```
ℹ️ Dane z Ahrefs API - Wszystkie wyniki pochodzą z prawdziwego API Ahrefs
```

Jeśli box jest:
- **Żółty** - wszystkie dane mockowane (problem z API)
- **Niebieski** - dane mieszane (część API, część mock)

### 3.8. Eksport do CSV

1. Kliknij **Eksportuj do CSV**
2. Plik `analiza_seo_[nazwa_wyceny].csv` zostanie pobrany
3. Otwórz plik i sprawdź:
   - Wszystkie domeny są obecne
   - Dane są wypełnione
   - Wiersz "ŚREDNIO" na końcu

## Krok 4: Testowanie różnych scenariuszy

### Test 1: Pojedyncza domena
```
example.com
```

### Test 2: Wiele domen
```
example.com
wikipedia.org
github.com
stackoverflow.com
reddit.com
```

### Test 3: Domeny z różnych krajów
```
example.com
example.co.uk
example.de
example.fr
```

### Test 4: Domeny z www
```
www.example.com
example.com
```
(Kod automatycznie usuwa `www.`)

### Test 5: Pełne URL
```
https://example.com/some/path
http://example.com
```
(Kod automatycznie ekstraktuje domenę)

## Krok 5: Weryfikacja danych

### 5.1. Porównaj z Ahrefs Site Explorer

1. Otwórz https://ahrefs.com/site-explorer
2. Wprowadź tę samą domenę co w aplikacji
3. Porównaj wartości:
   - Domain Rating powinien być identyczny
   - Referring Domains powinien być podobny (±1-2%)
   - Keywords mogą się nieznacznie różnić (dane są aktualizowane)

### 5.2. Sprawdź obliczenia

Przykład dla domeny z wynikami:
- TOP 10 keywords: 1000
- URLs in TOP 10: 200
- Estimated Traffic: 50000

Obliczenia:
- **KW/URL** = 1000 / 200 = 5.0 ✅
- **Ruch/KW** = 50000 / 1000 = 50.0 ✅

## Krok 6: Testowanie limitów API

### Test limitów rate

1. Wprowadź 20 domen jednocześnie
2. Obserwuj logi w terminalu
3. Sprawdź czy rate limiting działa (1 żądanie/sekundę)

Oczekiwane logi:
```
⏱️  Ahrefs API: Sprawdzam rate limiting...
✅ Ahrefs API: Rate limiting OK
📡 Ahrefs API: Wysyłam żądanie HTTP GET...
```

### Test przekroczenia limitu

Jeśli wprowadzisz zbyt wiele domen zbyt szybko, możesz zobaczyć:
```
⚠️  Ahrefs API: Rate limit exceeded (429) - próba 1/3
⏳ Ahrefs API: Czekam 1s przed kolejną próbą...
```

To jest **normalne** zachowanie. Kod automatycznie zrobi retry.

## Krok 7: Czyszczenie po testach

Jeśli chcesz usunąć dane testowe:

1. Przejdź do wyceny
2. Przewiń do sekcji "Analiza ruchu Ahrefs"
3. Wprowadź nowe domeny (zastąpią stare)
4. Lub usuń całą wycenę

## Najczęstsze problemy i rozwiązania

| Problem | Objawy | Rozwiązanie |
|---------|--------|-------------|
| Brak klucza API | Badge "Mock", żółty info box | Dodaj klucz do `.env` |
| Nieprawidłowy klucz | Błąd 401 | Zweryfikuj klucz na ahrefs.com |
| Rate limit | Błąd 429 | Zmniejsz `AHREFS_RPM` |
| Timeout | "Timeout" w logach | Sprawdź połączenie internetowe |
| Puste wyniki | Wszystkie wartości 0 | Sprawdź logi dla szczegółów |

## Kontakt i wsparcie

Jeśli masz problemy:

1. **Sprawdź logi** - terminal pokazuje szczegółowe informacje
2. **Uruchom test_ahrefs.py** - da diagnostykę
3. **Sprawdź dokumentację** - AHREFS_SETUP.md
4. **Sprawdź zmiany** - ZMIANY_AHREFS_MCP.md

## Potwierdzenie poprawnej integracji ✅

Integracja działa poprawnie gdy:

- [x] Skrypt `test_ahrefs.py` kończy się sukcesem (2/2)
- [x] W interfejsie webowym widzisz badge "API" (zielony)
- [x] Info box jest zielony: "Dane z Ahrefs API"
- [x] Wszystkie metryki są wypełnione (nie ma 0)
- [x] Eksport CSV działa i zawiera dane
- [x] Wartości zgadzają się z Ahrefs Site Explorer
- [x] Obliczenia (KW/URL, Ruch/KW) są poprawne

Jeśli wszystkie punkty są zaznaczone - gratulacje! Integracja działa poprawnie! 🎉

