# Problem: Klucz MCP vs Klucz API

## Diagnoza

Użytkownik ma **klucz Ahrefs MCP**, ale aplikacja wymaga **standardowego klucza API Ahrefs**.

## Różnica

### Ahrefs MCP (Model Context Protocol)
- Protokół do komunikacji z asystentami AI (Claude, Gemini)
- Działa przez websockets/stdio, nie REST API
- Klucz zaczyna się od `D7uD.`
- **NIE DZIAŁA** z REST API endpointami

### Ahrefs REST API
- Standardowe HTTP/REST API
- Endpointy typu `/v3/site-explorer/...`
- Klucz API w formacie `ahrefstoken_...`
- **TO POTRZEBUJEMY** do aplikacji

## Objawy problemu

- Błąd 401 Unauthorized (z Bearer)
- Błąd 403 Forbidden (z token w parametrach)
- Błąd 404 Not Found (wszystkie próby endpoint)

## Rozwiązanie

### Opcja 1: Zdobądź standardowy klucz API Ahrefs

1. Zaloguj się na https://ahrefs.com
2. Przejdź do **Settings** → **API access**
3. Wygeneruj **API token** (nie MCP!)
4. Zastąp w pliku `.env`:
   ```
   AHREFS_MCP_API_KEY=twoj_nowy_api_token
   ```

### Opcja 2: Użyj mockowanych danych

Jeśli nie masz dostępu do API:

1. Edytuj `.env`:
   ```
   AHREFS_MCP_ENABLED=False
   ```

2. Aplikacja będzie używać mockowanych danych

### Opcja 3: Różne plany Ahrefs

Sprawdź czy Twój plan Ahrefs obejmuje dostęp do API:
- https://ahrefs.com/api/pricing
- Niektóre plany nie mają dostępu do API

## Status

**Integracja nie może działać** z kluczem MCP. 

Potrzebny jest standardowy klucz REST API od Ahrefs.

