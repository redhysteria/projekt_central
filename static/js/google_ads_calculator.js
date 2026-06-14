/**
 * Kalkulator opłaty agencji za zarządzanie Google Ads wg tabeli progowej (budżet mediowy netto).
 */
(function googleAdsCalculatorIIFE() {
    const fmtZl = (n) =>
        `${Math.round(Number(n) || 0).toLocaleString('pl-PL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

    /**
     * @param {number} mediaBudgetNet — „opłata na kliknięcia”, zł netto
     * @returns {{ fee: number, explanationHtml: string }}
     */
    function computeGoogleAdsManagementFee(mediaBudgetNet) {
        const b = Math.max(0, Number(mediaBudgetNet) || 0);

        /** Stała lub baza + procent nad progiem dolnym przedziału */
        const ex = (
            flat,
            expl
        ) => ({
            fee: flat,
            explanationHtml: expl,
        });

        if (b <= 6000) {
            return ex(
                1500,
                'Przedział <strong>0–6 000 zł</strong>: stała opłata <strong>1 500 zł</strong> netto.'
            );
        }
        if (b <= 8000) {
            const over = b - 6000;
            const fee = 1500 + 0.2 * over;
            return ex(
                Math.round(fee),
                `<strong>1 500 zł + 20%</strong> od kwoty powyżej 6 000 zł → 1 500 + 0,20 × ${fmtZl(over)} = <strong>${fmtZl(fee)} zł</strong> netto.`
            );
        }
        if (b <= 12000) {
            const over = b - 8000;
            const fee = 1900 + 0.18 * over;
            return ex(
                Math.round(fee),
                `<strong>1 900 zł + 18%</strong> od kwoty powyżej 8 000 zł → 1 900 + 0,18 × ${fmtZl(over)} = <strong>${fmtZl(fee)} zł</strong> netto.`
            );
        }
        if (b <= 15000) {
            const over = b - 12000;
            const fee = 2620 + 0.16 * over;
            return ex(
                Math.round(fee),
                `<strong>2 620 zł + 16%</strong> od kwoty powyżej 12 000 zł → 2 620 + 0,16 × ${fmtZl(over)} = <strong>${fmtZl(fee)} zł</strong> netto.`
            );
        }
        if (b <= 20000) {
            const over = b - 15000;
            const fee = 3100 + 0.14 * over;
            return ex(
                Math.round(fee),
                `<strong>3 100 zł + 14%</strong> od kwoty powyżej 15 000 zł → 3 100 + 0,14 × ${fmtZl(over)} = <strong>${fmtZl(fee)} zł</strong> netto.`
            );
        }
        if (b <= 30000) {
            const over = b - 20000;
            const fee = 3800 + 0.12 * over;
            return ex(
                Math.round(fee),
                `<strong>3 800 zł + 12%</strong> od kwoty powyżej 20 000 zł → 3 800 + 0,12 × ${fmtZl(over)} = <strong>${fmtZl(fee)} zł</strong> netto.`
            );
        }
        if (b <= 40000) {
            const over = b - 30000;
            const fee = 5000 + 0.09 * over;
            return ex(
                Math.round(fee),
                `<strong>5 000 zł + 9%</strong> od kwoty powyżej 30 000 zł → 5 000 + 0,09 × ${fmtZl(over)} = <strong>${fmtZl(fee)} zł</strong> netto.`
            );
        }
        if (b <= 50000) {
            const over = b - 40000;
            const fee = 5900 + 0.06 * over;
            return ex(
                Math.round(fee),
                `<strong>5 900 zł + 6%</strong> od kwoty powyżej 40 000 zł → 5 900 + 0,06 × ${fmtZl(over)} = <strong>${fmtZl(fee)} zł</strong> netto.`
            );
        }
        if (b <= 100000) {
            const over = b - 50000;
            const fee = 6500 + 0.03 * over;
            return ex(
                Math.round(fee),
                `<strong>6 500 zł + 3%</strong> od kwoty powyżej 50 000 zł → 6 500 + 0,03 × ${fmtZl(over)} = <strong>${fmtZl(fee)} zł</strong> netto.`
            );
        }
        if (b <= 150000) {
            const over = b - 100000;
            const fee = 8000 + 0.01 * over;
            return ex(
                Math.round(fee),
                `<strong>8 000 zł + 1%</strong> od kwoty powyżej 100 000 zł → 8 000 + 0,01 × ${fmtZl(over)} = <strong>${fmtZl(fee)} zł</strong> netto.`
            );
        }
        /* 150 001 … 200 000 zł oraz wyżej — ta sama logika jak w arkuszu (8500 + 1% ponad 150k) */
        const over150 = b - 150000;
        const fee = 8500 + 0.01 * over150;
        const extraNote =
            b > 200000
                ? ' (powyżej 200 000 zł stosuje się ten sam wzór co dla progu 150 001+)'
                : '';
        return ex(
            Math.round(fee),
            `<strong>8 500 zł + 1%</strong> od kwoty powyżej 150 000 zł → 8 500 + 0,01 × ${fmtZl(over150)} = <strong>${fmtZl(fee)} zł</strong> netto.${extraNote}`
        );
    }

    function refreshGoogleAdsQuote() {
        const inp = document.getElementById('googleAdsMediaBudget');
        const out = document.getElementById('googleAdsFeeAmount');
        const expl = document.getElementById('googleAdsFeeExplanation');

        if (!inp || !out || !expl) return;

        const raw = inp.value.trim();
        if (raw === '' || raw === '-') {
            out.textContent = '—';
            expl.innerHTML = 'Podaj kwotę budżetu mediowego (netto).';
            return;
        }

        const { fee, explanationHtml } = computeGoogleAdsManagementFee(parseFloat(raw.replace(',', '.')));
        out.textContent = `${fee.toLocaleString('pl-PL')} zł`;
        expl.innerHTML = explanationHtml;
    }

    function initCalc() {
        const inp = document.getElementById('googleAdsMediaBudget');
        if (!inp) return;

        inp.addEventListener('input', refreshGoogleAdsQuote);
        inp.addEventListener('change', refreshGoogleAdsQuote);
        refreshGoogleAdsQuote();
    }

    if (typeof window !== 'undefined') {
        window.computeGoogleAdsManagementFee = computeGoogleAdsManagementFee;
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { computeGoogleAdsManagementFee };
    }

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initCalc);
        } else {
            initCalc();
        }
    }
})();
