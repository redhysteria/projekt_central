/**
 * Komponent „pigułek miesięcy" — wybór dowolnego zbioru miesięcy 1-12.
 * Czysta logika (UMD: window.MonthPicker + module.exports) + render DOM (przeglądarka).
 */
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof root !== 'undefined' && root) root.MonthPicker = api;
}(typeof self !== 'undefined' ? self : this, function () {

    function csvToMonths(csv) {
        if (!csv) return [];
        const set = new Set();
        String(csv).split(',').forEach((p) => {
            const n = parseInt(String(p).trim(), 10);
            if (!isNaN(n) && n >= 1 && n <= 12) set.add(n);
        });
        return Array.from(set).sort((a, b) => a - b);
    }

    function monthsToCsv(months) {
        const set = new Set();
        (months || []).forEach((m) => { if (m >= 1 && m <= 12) set.add(m); });
        return Array.from(set).sort((a, b) => a - b).join(',');
    }

    function toggleMonth(months, m) {
        const set = new Set(months);
        if (set.has(m)) set.delete(m); else set.add(m);
        return Array.from(set).sort((a, b) => a - b);
    }

    function fillRange(months, anchor, m) {
        const lo = Math.min(anchor, m), hi = Math.max(anchor, m);
        const set = new Set(months);
        for (let i = lo; i <= hi; i++) set.add(i);
        return Array.from(set).sort((a, b) => a - b);
    }

    return { csvToMonths, monthsToCsv, toggleMonth, fillRange };
}));
