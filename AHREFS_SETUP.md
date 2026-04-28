# Ahrefs API v3 — konfiguracja

Aplikacja korzysta z **Ahrefs API v3** (REST) do pobrania:

| Pole w wycenie SEO   | Endpoint Ahrefs                            | Pole w odpowiedzi                  |
|----------------------|--------------------------------------------|------------------------------------|
| **Domain Rating**    | `GET /v3/site-explorer/domain-rating`      | `domain_rating.domain_rating`      |
| **Referring Domains**| `GET /v3/site-explorer/backlinks-stats`    | `metrics.live_refdomains`          |
| **Backlinks**        | `GET /v3/site-explorer/backlinks-stats`    | `metrics.live`                     |

> Pola TOP/URL/szacowany ruch pochodzą z Senuto — patrz `SENUTO_SETUP.md`.

## 1. Plan i klucz API

Ahrefs API jest płatne. Używamy planu **Standard** (~$1000/mc, 150 000 rows/cykl). Klucz wygenerujesz po zalogowaniu w panelu Ahrefs:

<https://ahrefs.com/api>

Zakładka "API Keys" → "Create new key" → kopiujesz wartość (40 znaków, alfanumeryczne).

## 2. Plik `.env`

```env
AHREFS_API_KEY=twoj_40_znakowy_klucz
AHREFS_ENABLED=True
AHREFS_FALLBACK_TO_MOCK=False
AHREFS_RPM=60
AHREFS_TIMEOUT=30
```

`AHREFS_FALLBACK_TO_MOCK=True` włącza fallback na losowe dane testowe (`ahrefs_mcp_client.py`) gdy API zwróci błąd. Domyślnie wyłączone — błąd się propaguje.

## 3. Limity i koszt

Każde nasze zapytanie konsumuje **1 row z miesięcznego limitu**:
- Domain Rating: 1 row na domenę
- Backlinks Stats: 1 row na domenę
- Razem: **2 rows na domenę** w analizie SEO.

Przy planie Standard (150k rows/cykl) starczy na ~75 000 domen miesięcznie.

Bieżące zużycie sprawdzisz wywołując:

```bash
curl -H "Authorization: Bearer $AHREFS_API_KEY" \
  https://api.ahrefs.com/v3/subscription-info/limits-and-usage
```

Odpowiedź zawiera m.in.:
- `units_limit_workspace` — miesięczny limit
- `units_usage_workspace` — bieżące zużycie
- `usage_reset_date` — data resetu
- `api_key_expiration_date` — data wygaśnięcia klucza

## 4. Test

```bash
python3 test_ahrefs.py senuto.com wikipedia.org
```

Powinno wypisać DR, Referring Domains i Backlinks dla każdej domeny.

## 5. Najczęstsze błędy

| Komunikat                                        | Przyczyna / rozwiązanie                                  |
|--------------------------------------------------|----------------------------------------------------------|
| `401 Unauthorized`                               | Klucz nieważny lub wygasł — wygeneruj nowy w panelu      |
| `403 Forbidden`                                  | Brak uprawnień do tego endpointu w obecnym planie        |
| `429 Too Many Requests`                          | Przekroczony rate limit — zmniejsz `AHREFS_RPM`          |
| `Brak AHREFS_API_KEY w .env`                     | Uzupełnij klucz w `.env`                                 |

## 6. Dlaczego dwa pliki klienta?

- `ahrefs_api_client.py` — **realny** klient Ahrefs v3 (HTTP + Bearer)
- `ahrefs_mcp_client.py` — **mock** generujący dane na bazie hashu domeny (legacy, używany tylko gdy `AHREFS_FALLBACK_TO_MOCK=True`)

`ahrefs_service.py` jest wrapperem, który najpierw próbuje API, w razie błędu używa mocka (jeśli fallback włączony) albo propaguje wyjątek.
