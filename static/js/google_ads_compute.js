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

    /**
     * Podsumowanie zbiorcze obu torów. Opłata agencji liczona OD SUMY budżetów.
     * @param {{searchBudget:number,searchConversions:number,searchRevenue:number,
     *          productBudget:number,productConversions:number,productRevenue:number,
     *          margin:number, feeFn:function(number):number}} p
     */
    function computeCombinedSummary(p) {
        const searchBudget = Number(p.searchBudget) || 0;
        const productBudget = Number(p.productBudget) || 0;
        const margin = Number(p.margin) || 0;

        const combinedBudget = searchBudget + productBudget;
        const agencyFee = typeof p.feeFn === 'function' ? (Number(p.feeFn(combinedBudget)) || 0) : 0;
        const totalCost = combinedBudget + agencyFee;

        const combinedConversions = (Number(p.searchConversions) || 0) + (Number(p.productConversions) || 0);
        const combinedRevenue = (Number(p.searchRevenue) || 0) + (Number(p.productRevenue) || 0);
        const roas = totalCost > 0 ? combinedRevenue / totalCost : 0;
        const netMargin = combinedRevenue * margin - totalCost;

        return { combinedBudget, agencyFee, totalCost, combinedConversions, combinedRevenue, roas, netMargin };
    }

    return { computeProductCampaign, computeCombinedSummary };
}));
