const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { csvToMonths, monthsToCsv, toggleMonth, fillRange } = require(
    path.join(__dirname, '..', 'static', 'js', 'month_picker.js')
);

test('csvToMonths: sort/dedup/filtr 1-12', () => {
    assert.deepStrictEqual(csvToMonths('8,2,2,5'), [2, 5, 8]);
    assert.deepStrictEqual(csvToMonths('0,13,5'), [5]);
    assert.deepStrictEqual(csvToMonths(''), []);
});

test('monthsToCsv', () => {
    assert.strictEqual(monthsToCsv([8, 2, 5, 2]), '2,5,8');
    assert.strictEqual(monthsToCsv([]), '');
});

test('toggleMonth dodaje i usuwa', () => {
    assert.deepStrictEqual(toggleMonth([2, 5], 8), [2, 5, 8]);
    assert.deepStrictEqual(toggleMonth([2, 5, 8], 5), [2, 8]);
});

test('fillRange wypełnia zakres ciągły w obie strony', () => {
    assert.deepStrictEqual(fillRange([2], 2, 6), [2, 3, 4, 5, 6]);
    assert.deepStrictEqual(fillRange([9], 9, 6), [6, 7, 8, 9]);
    assert.deepStrictEqual(fillRange([1, 12], 3, 5), [1, 3, 4, 5, 12]);
});
