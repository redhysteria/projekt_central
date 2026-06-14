const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const { computeGoogleAdsManagementFee } = require(
    path.join(__dirname, '..', 'static', 'js', 'google_ads_calculator.js')
);

test('fee: próg do 6000 zł = stałe 1500', () => {
    assert.strictEqual(computeGoogleAdsManagementFee(0).fee, 1500);
    assert.strictEqual(computeGoogleAdsManagementFee(6000).fee, 1500);
});

test('fee: 10000 zł = 1900 + 18% ponad 8000 = 2260', () => {
    assert.strictEqual(computeGoogleAdsManagementFee(10000).fee, 2260);
});

const { computeProductCampaign, computeCombinedSummary } = require(
    path.join(__dirname, '..', 'static', 'js', 'google_ads_compute.js')
);

test('produkt: wyłączony => same zera', () => {
    const r = computeProductCampaign({ enabled: false, targetRevenue: 40000, targetRoas: 4, cpc: 1, cvr: 2, aov: 1000 });
    assert.deepStrictEqual(r, { budget: 0, clicks: 0, conversions: 0, impliedRevenue: 0 });
});

test('produkt: budżet = przychód / ROAS', () => {
    const r = computeProductCampaign({ enabled: true, targetRevenue: 40000, targetRoas: 4, cpc: 2, cvr: 2.5, aov: 1000 });
    assert.strictEqual(r.budget, 10000);          // 40000 / 4
    assert.strictEqual(r.clicks, 5000);           // 10000 / 2
    assert.strictEqual(r.conversions, 125);       // 5000 * 0.025
    assert.strictEqual(r.impliedRevenue, 125000); // 125 * 1000
});

test('produkt: brak CPC => kliki/konwersje 0, budżet dalej liczony', () => {
    const r = computeProductCampaign({ enabled: true, targetRevenue: 40000, targetRoas: 4, cpc: 0, cvr: 2.5, aov: 1000 });
    assert.strictEqual(r.budget, 10000);
    assert.strictEqual(r.clicks, 0);
    assert.strictEqual(r.conversions, 0);
});

test('suma: opłata agencji liczona od budżetu łącznego, nie samego Search', () => {
    const s = computeCombinedSummary({
        searchBudget: 4000, searchConversions: 2, searchRevenue: 2000,
        productBudget: 5000, productConversions: 3, productRevenue: 20000,
        margin: 0.15,
        feeFn: (b) => computeGoogleAdsManagementFee(b).fee,
    });
    assert.strictEqual(s.combinedBudget, 9000);
    // 9000 => próg 8001-12000: 1900 + 18% ponad 8000 = 1900 + 180 = 2080
    assert.strictEqual(s.agencyFee, 2080);
    assert.strictEqual(s.totalCost, 11080);           // 9000 + 2080
    assert.strictEqual(s.combinedConversions, 5);     // 2 + 3
    assert.strictEqual(s.combinedRevenue, 22000);     // 2000 + 20000
    assert.ok(Math.abs(s.roas - 22000 / 11080) < 1e-9);
    assert.ok(Math.abs(s.netMargin - (22000 * 0.15 - 11080)) < 1e-9);
});

test('suma: produkt = 0 => zachowanie jak sam Search', () => {
    const s = computeCombinedSummary({
        searchBudget: 4000, searchConversions: 2, searchRevenue: 2000,
        productBudget: 0, productConversions: 0, productRevenue: 0,
        margin: 0.15,
        feeFn: (b) => computeGoogleAdsManagementFee(b).fee,
    });
    assert.strictEqual(s.combinedBudget, 4000);
    assert.strictEqual(s.agencyFee, 1500);   // próg <=6000
    assert.strictEqual(s.totalCost, 5500);
});
