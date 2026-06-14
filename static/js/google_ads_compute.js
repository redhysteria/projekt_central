/**
 * Czysta logika wyliczeń planera Google Ads (bez DOM).
 * UMD: działa w przeglądarce (window.GoogleAdsCompute) i w Node (module.exports).
 */
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (typeof root !== 'undefined' && root) {
        root.GoogleAdsCompute = api;
    }
}(typeof self !== 'undefined' ? self : this, function () {

    /**
     * Tor kampanii produktowej (Shopping/PMax), driver = cel ROAS.
     * @param {{enabled:boolean,targetRevenue:number,targetRoas:number,cpc:number,cvr:number,aov:number}} p
     * @returns {{budget:number,clicks:number,conversions:number,impliedRevenue:number}}
     */
    function computeProductCampaign(p) {
        const targetRevenue = Number(p.targetRevenue) || 0;
        const targetRoas = Number(p.targetRoas) || 0;
        const cpc = Number(p.cpc) || 0;
        const cvr = Number(p.cvr) || 0;
        const aov = Number(p.aov) || 0;

        if (!p.enabled) {
            return { budget: 0, clicks: 0, conversions: 0, impliedRevenue: 0 };
        }

        const budget = (targetRevenue > 0 && targetRoas > 0) ? targetRevenue / targetRoas : 0;
        const clicks = cpc > 0 ? budget / cpc : 0;
        const conversions = clicks * (cvr > 0 ? cvr / 100 : 0);
        const impliedRevenue = conversions * (aov > 0 ? aov : 0);

        return { budget, clicks, conversions, impliedRevenue };
    }

    return { computeProductCampaign };
}));
