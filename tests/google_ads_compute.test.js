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
