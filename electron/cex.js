// Looks a machine up on the CeX UK website search, the same search the website uses.
// One request per test. When CeX gives you access to the internal stock system,
// swap this function for that and nothing else needs to change.

const { net } = require('electron');

async function searchCex(query, version) {
  const res = await net.fetch('https://search.webuy.io/1/indexes/*/queries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': `PassTheSpecs/${version || '0'}` },
    body: JSON.stringify({
      requests: [{ indexName: 'prod_cex_uk', params: `query=${encodeURIComponent(query)}&hitsPerPage=40` }]
    })
  });
  if (!res.ok) throw new Error('CeX search replied ' + res.status);
  const json = await res.json();
  const hits = (json.results && json.results[0] && json.results[0].hits) || [];
  return hits.map((h) => ({
    boxId: h.boxId,
    boxName: h.boxName,
    category: h.categoryName || '',
    sell: h.sellPrice ?? null,
    cash: h.cashPriceCalculated ?? h.cashPrice ?? null,
    exchange: h.exchangePriceCalculated ?? h.exchangePrice ?? null
  })).filter((h) => h.boxId && h.boxName);
}

module.exports = { searchCex };
