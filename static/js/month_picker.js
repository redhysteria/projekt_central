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

    /**
     * Rysuje pigułki w kontenerze. Klik = toggle; shift-klik = zakres od ostatniej kotwicy.
     * @param {HTMLElement} container
     * @param {string} csv  aktualny CSV miesięcy
     * @param {{disabled?:boolean, onChange?:(csv:string)=>void}} opts
     */
    function renderMonthPicker(container, csv, opts) {
        opts = opts || {};
        let months = csvToMonths(csv);
        let anchor = null;

        function paint() {
            container.innerHTML = '';
            const wrap = document.createElement('div');
            wrap.className = 'd-flex flex-wrap gap-1 align-items-center';
            for (let m = 1; m <= 12; m++) {
                const b = document.createElement('button');
                b.type = 'button';
                const on = months.indexOf(m) !== -1;
                b.className = 'btn btn-sm ' + (on ? 'btn-primary' : 'btn-outline-secondary');
                b.style.minWidth = '34px';
                b.style.padding = '1px 6px';
                b.textContent = String(m).padStart(2, '0');
                if (opts.disabled) {
                    b.disabled = true;
                } else {
                    b.addEventListener('click', (ev) => {
                        if (ev.shiftKey && anchor) {
                            months = fillRange(months, anchor, m);
                        } else {
                            months = toggleMonth(months, m);
                            anchor = m;
                        }
                        if (opts.onChange) opts.onChange(monthsToCsv(months));
                        paint();
                    });
                }
                wrap.appendChild(b);
            }
            if (!opts.disabled) {
                const clr = document.createElement('button');
                clr.type = 'button';
                clr.className = 'btn btn-sm btn-link text-secondary p-0 ms-1';
                clr.title = 'Wyczyść';
                clr.textContent = '✕';
                clr.addEventListener('click', () => {
                    months = [];
                    anchor = null;
                    if (opts.onChange) opts.onChange('');
                    paint();
                });
                wrap.appendChild(clr);
            }
            container.appendChild(wrap);
        }

        paint();
    }

    return { csvToMonths, monthsToCsv, toggleMonth, fillRange, renderMonthPicker };
}));
