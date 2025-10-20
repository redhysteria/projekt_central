# Konfiguracja Ahrefs MCP API

Ten dokument opisuje jak skonfigurować i używać integracji Ahrefs MCP API w aplikacji wyceny SEO.

## Spis treści

1. [Co to jest Ahrefs MCP](#co-to-jest-ahrefs-mcp)
2. [Wymagania](#wymagania)
3. [Konfiguracja](#konfiguracja)
4. [Użytkowanie](#użytkowanie)
5. [Limity API](#limity-api)
6. [Troubleshooting](#troubleshooting)

## Co to jest Ahrefs MCP

Ahrefs MCP (Model Context Protocol) to interfejs do komunikacji z Ahrefs API v4, który pozwala na pobieranie prawdziwych metryk SEO dla domen, takich jak:

- **Domain Rating** - ocena siły domeny (0-100)
- **Referring Domains** - liczba domen odsyłających
- **Organic Keywords** - słowa kluczowe w top 3, top 10, top 50
- **Organic Traffic** - szacowany ruch organiczny
- **URLs Ranking** - liczba URL-i rankujących się w top pozycjach

## Wymagania

- Python 3.7+
- Klucz API Ahrefs (można uzyskać na https://ahrefs.com/api)
- Biblioteka `requests` (automatycznie instalowana przez `requirements.txt`)

## Konfiguracja

### Krok 1: Uzyskanie klucza API

1. Zaloguj się do konta Ahrefs
2. Przejdź do sekcji API: https://ahrefs.com/api
3. Wygeneruj nowy klucz API dla MCP
4. Skopiuj klucz (format: `D7uD.xxxx...`)

### Krok 2: Konfiguracja pliku .env

1. Skopiuj plik `.env.example` i nazwij go `.env`:
   ```bash
   cp .env.example .env
   ```

2. Edytuj plik `.env` i wklej swój klucz API:
   ```env
   AHREFS_MCP_API_KEY=D7uD.your_actual_api_key_here
   AHREFS_MCP_ENABLED=True
   AHREFS_FALLBACK_TO_MOCK=True
   AHREFS_RPM=60
   ```

### Krok 3: Instalacja zależności

```bash
pip install -r requirements.txt
```

### Krok 4: Uruchomienie aplikacji

```bash
python3 app.py
```

Aplikacja automatycznie wykryje klucz API i użyje Ahrefs API zamiast mockowanych danych.

## Konfiguracja zaawansowana

### Parametry w .env

| Parametr | Opis | Domyślna wartość |
|----------|------|------------------|
| `AHREFS_MCP_API_KEY` | Klucz API Ahrefs | (wymagany) |
| `AHREFS_MCP_ENABLED` | Włącz/wyłącz integrację Ahrefs API | `True` |
| `AHREFS_FALLBACK_TO_MOCK` | Użyj mocków przy błędzie API | `True` |
| `AHREFS_RPM` | Limit żądań na minutę | `60` |

### Przykłady konfiguracji

**Tylko Ahrefs API (bez fallback):**
```env
AHREFS_MCP_ENABLED=True
AHREFS_FALLBACK_TO_MOCK=False
```

**Tylko mockowane dane:**
```env
AHREFS_MCP_ENABLED=False
```

**Ahrefs API z fallback (rekomendowane):**
```env
AHREFS_MCP_ENABLED=True
AHREFS_FALLBACK_TO_MOCK=True
```

## Użytkowanie

### W aplikacji webowej

1. Otwórz edytor wyceny
2. Przewiń do sekcji "Analiza SEO konkurencji"
3. Wprowadź domeny (jedna na linię)
4. Kliknij "Analizuj domeny SEO"
5. Wyniki pokażą badge "API" lub "Mock" dla każdej domeny
6. Info box nad tabelą pokaże źródło danych

### Interpretacja wyników

- 🟢 **Badge "API"** - dane pochodzą z Ahrefs API
- 🔴 **Badge "Mock"** - dane są symulowane (fallback lub brak API)
- **Info box zielony** - wszystkie dane z API
- **Info box żółty** - wszystkie dane mockowane
- **Info box niebieski** - dane mieszane (część API, część mock)

### Eksport wyników

Kliknij "Eksportuj do CSV" aby pobrać wyniki z informacją o źródle danych.

## Limity API

### Plan Lite (domyślny)

- **60 requestów na minutę**
- **Timeout:** 30 sekund na żądanie
- **Retry:** 3 próby z exponential backoff (1s, 2s, 4s)

### Automatyczne zarządzanie limitami

Aplikacja automatycznie:
- Stosuje rate limiting (1 request/second)
- Retry przy błędach 429 (Too Many Requests)
- Fallback do mocków przy przekroczeniu limitów

### Jak uniknąć błędów limitów

1. **Analizuj w małych partiach** - max 10-20 domen na raz
2. **Użyj fallback** - ustaw `AHREFS_FALLBACK_TO_MOCK=True`
3. **Zwiększ plan** - rozważ upgrade planu Ahrefs

## Troubleshooting

### Problem: Brak klucza API

**Objaw:**
```
🔴 Ahrefs Service: Brak klucza API - używam mockowanych danych
```

**Rozwiązanie:**
1. Sprawdź czy plik `.env` istnieje w katalogu głównym projektu
2. Sprawdź czy `AHREFS_MCP_API_KEY` jest ustawiony w `.env`
3. Upewnij się że klucz jest poprawny (format `D7uD.xxxx...`)
4. Zrestartuj aplikację po zmianach w `.env`

### Problem: Błąd 401 Unauthorized

**Objaw:**
```
❌ Ahrefs API: Unauthorized (401) - sprawdź klucz API
```

**Rozwiązanie:**
1. Zweryfikuj klucz API na https://ahrefs.com/api
2. Upewnij się że klucz nie wygasł
3. Sprawdź czy masz aktywną subskrypcję Ahrefs

### Problem: Błąd 429 Too Many Requests

**Objaw:**
```
⚠️  Ahrefs API: Rate limit exceeded (429)
```

**Rozwiązanie:**
1. Zmniejsz liczbę analizowanych domen naraz
2. Zwiększ opóźnienie między requestami (zmień `AHREFS_RPM` na niższą wartość)
3. Poczekaj kilka minut przed następną analizą
4. Włącz fallback: `AHREFS_FALLBACK_TO_MOCK=True`

### Problem: Timeout

**Objaw:**
```
⏱️  Ahrefs API: Timeout
```

**Rozwiązanie:**
1. Sprawdź połączenie internetowe
2. Sprawdź czy Ahrefs API nie ma problemów (https://status.ahrefs.com)
3. Włącz fallback dla kontynuacji analizy

### Problem: Dane mockowane zamiast API

**Objaw:**
- Badge "Mock" zamiast "API"
- Info box żółty: "Dane mockowane"

**Możliwe przyczyny:**
1. `AHREFS_MCP_ENABLED=False` w `.env`
2. Brak klucza API w `.env`
3. Błąd API i włączony fallback
4. Nieprawidłowy format klucza API

**Rozwiązanie:**
1. Sprawdź logi aplikacji w terminalu
2. Sprawdź konfigurację w `.env`
3. Zweryfikuj klucz API

## Endpointy Ahrefs API v4

Aplikacja używa następujących endpointów:

```
GET https://api.ahrefs.com/v4/domain-rating?target={domain}
GET https://api.ahrefs.com/v4/referring-domains?target={domain}
GET https://api.ahrefs.com/v4/organic-keywords?target={domain}&mode=prefix
GET https://api.ahrefs.com/v4/organic-traffic?target={domain}
```

## Wsparcie

W razie problemów:
1. Sprawdź logi aplikacji w terminalu
2. Zajrzyj do sekcji Troubleshooting
3. Skontaktuj się z zespołem developerskim

## Cennik Ahrefs API

Sprawdź aktualne ceny i plany na: https://ahrefs.com/api/pricing

