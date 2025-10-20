#!/bin/bash

echo "🧪 TEST APLIKACJI - Sprawdzanie wszystkich funkcji"
echo "=================================================="
echo ""

# Kolory
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

BASE_URL="http://localhost:5002"
QUOTE_ID=5

# Test 1: Strona główna
echo "📄 Test 1: Strona główna..."
if curl -s "$BASE_URL/" | grep -q "Aplikacja Wyceny SEO"; then
    echo -e "${GREEN}✅ PASS${NC}: Strona główna działa"
else
    echo -e "${RED}❌ FAIL${NC}: Strona główna nie działa"
fi
echo ""

# Test 2: API - Lista wycen
echo "📋 Test 2: API - Lista wycen..."
QUOTES=$(curl -s "$BASE_URL/api/quotes" | python3 -c "import sys, json; print(len(json.load(sys.stdin)['quotes']))" 2>/dev/null)
if [ "$QUOTES" -gt 0 ]; then
    echo -e "${GREEN}✅ PASS${NC}: Znaleziono $QUOTES wycen"
else
    echo -e "${RED}❌ FAIL${NC}: Brak wycen lub błąd API"
fi
echo ""

# Test 3: API - Cennik
echo "💰 Test 3: API - Cennik..."
PRICELIST=$(curl -s "$BASE_URL/api/pricelist" | python3 -c "import sys, json; print(len(json.load(sys.stdin)['pricelist']))" 2>/dev/null)
if [ "$PRICELIST" -gt 0 ]; then
    echo -e "${GREEN}✅ PASS${NC}: Cennik zawiera $PRICELIST pozycji"
else
    echo -e "${RED}❌ FAIL${NC}: Cennik pusty lub błąd API"
fi
echo ""

# Test 4: API - Wycena szczegóły
echo "📊 Test 4: API - Szczegóły wyceny #$QUOTE_ID..."
ITEMS=$(curl -s "$BASE_URL/api/quotes/$QUOTE_ID" | python3 -c "import sys, json; print(len(json.load(sys.stdin)['items']))" 2>/dev/null)
if [ "$ITEMS" -gt 0 ]; then
    echo -e "${GREEN}✅ PASS${NC}: Wycena #$QUOTE_ID ma $ITEMS pozycji"
else
    echo -e "${RED}❌ FAIL${NC}: Wycena #$QUOTE_ID nie ma pozycji lub błąd"
fi
echo ""

# Test 5: API - Konkurenci
echo "🔍 Test 5: API - Analiza konkurencji..."
COMPETITORS=$(curl -s "$BASE_URL/api/quotes/$QUOTE_ID/competitors" | python3 -c "import sys, json; print(len(json.load(sys.stdin)['competitors']))" 2>/dev/null)
if [ "$COMPETITORS" -gt 0 ]; then
    echo -e "${GREEN}✅ PASS${NC}: Znaleziono $COMPETITORS konkurentów"
else
    echo -e "${YELLOW}⚠️  WARN${NC}: Brak wyników analizy konkurencji (może nie było jeszcze uruchamiane)"
fi
echo ""

# Test 6: API - Analiza SEO
echo "📈 Test 6: API - Analiza SEO..."
SEO_RESULTS=$(curl -s "$BASE_URL/api/quotes/$QUOTE_ID/seo-analysis" | python3 -c "import sys, json; print(len(json.load(sys.stdin)['seo_results']))" 2>/dev/null)
if [ "$SEO_RESULTS" -gt 0 ]; then
    echo -e "${GREEN}✅ PASS${NC}: Znaleziono $SEO_RESULTS wyników SEO"
else
    echo -e "${YELLOW}⚠️  WARN${NC}: Brak wyników analizy SEO (może nie było jeszcze uruchamiane)"
fi
echo ""

# Test 7: Skrypty JavaScript
echo "📜 Test 7: Skrypty JavaScript..."
if curl -s "$BASE_URL/static/js/quote_editor.js" | grep -q "function populateSpecialistDropdown"; then
    echo -e "${GREEN}✅ PASS${NC}: quote_editor.js zawiera populateSpecialistDropdown"
else
    echo -e "${RED}❌ FAIL${NC}: quote_editor.js nie zawiera populateSpecialistDropdown"
fi

if curl -s "$BASE_URL/static/js/seo_analysis.js" | grep -q "function analyzeSeoCompetitors"; then
    echo -e "${GREEN}✅ PASS${NC}: seo_analysis.js zawiera analyzeSeoCompetitors"
else
    echo -e "${RED}❌ FAIL${NC}: seo_analysis.js nie zawiera analyzeSeoCompetitors"
fi
echo ""

# Test 8: Strona edytora wyceny
echo "✏️  Test 8: Strona edytora wyceny..."
if curl -s "$BASE_URL/quotes?id=$QUOTE_ID" | grep -q "Edytor Wyceny"; then
    echo -e "${GREEN}✅ PASS${NC}: Strona edytora wyceny działa"
else
    echo -e "${RED}❌ FAIL${NC}: Strona edytora wyceny nie działa"
fi
echo ""

echo "=================================================="
echo "🎉 TESTY ZAKOŃCZONE!"
echo ""
echo "ℹ️  NASTĘPNE KROKI:"
echo "1. Otwórz http://localhost:5002/quotes?id=$QUOTE_ID w przeglądarce"
echo "2. Otwórz konsolę deweloperską (F12)"
echo "3. Sprawdź czy NIE MA błędów JavaScript (czerwone komunikaty)"
echo "4. Przetestuj funkcje zgodnie z INSTRUKCJA_TESTOWANIA.md"
echo ""

