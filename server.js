const express = require('express');
const cors = require('cors');
const path = require('path');
const https = require('https');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const YAHOO_PSE_MAP = {
  'ALI': 'ALI.PS', 'BDO': 'BDO.PS', 'SM': 'SM.PS', 'BPI': 'BPI.PS',
  'ICT': 'ICT.PS', 'TEL': 'TEL.PS', 'JFC': 'JFC.PS', 'AC': 'AC.PS',
  'SMPH': 'SMPH.PS', 'GLO': 'GLO.PS', 'MER': 'MER.PS', 'MBT': 'MBT.PS',
  'URC': 'URC.PS', 'PGOLD': 'PGOLD.PS', 'MEG': 'MEG.PS', 'RLC': 'RLC.PS',
  'ACEN': 'ACEN.PS', 'AP': 'AP.PS', 'AEV': 'AEV.PS', 'DMC': 'DMC.PS',
  'SCC': 'SCC.PS', 'MONDE': 'MONDE.PS', 'WLCON': 'WLCON.PS', 'BLOOM': 'BLOOM.PS',
  'CNVRG': 'CNVRG.PS', 'LTG': 'LTG.PS', 'NIKL': 'NIKL.PS', 'EMI': 'EMI.PS',
  'GTCAP': 'GTCAP.PS', 'AREIT': 'AREIT.PS', 'AETF': 'FMETF.PS', '^PSEI': '^PSEI'
};

let marketCache = {
  timestamp: new Date().toISOString(),
  lastSyncFormatted: 'Oct 29 3:00 PM (PSE Official)',
  psei: { index: 5705.58, change: 52.03, pctChange: 0.92 },
  quotes: {
    'BPI': { price: 95.00, prevClose: 94.00, change: 1.00, pctChange: 1.06 },
    'GCASH': { price: 6.69, prevClose: 6.72, change: -0.03, pctChange: -0.45 },
    'BDO': { price: 117.40, prevClose: 117.10, change: 0.30, pctChange: 0.26 },
    'SM': { price: 546.00, prevClose: 534.00, change: 12.00, pctChange: 2.25 },
    'MBT': { price: 60.55, prevClose: 60.75, change: -0.20, pctChange: -0.33 },
    'MER': { price: 427.20, prevClose: 429.80, change: -2.60, pctChange: -0.60 },
    'AEV': { price: 39.55, prevClose: 40.25, change: -0.70, pctChange: -1.74 },
    'AC': { price: 539.00, prevClose: 540.00, change: -1.00, pctChange: -0.19 },
    'GLO': { price: 1520.00, prevClose: 1550.00, change: -30.00, pctChange: -1.94 },
    'ICT': { price: 840.00, prevClose: 820.00, change: 20.00, pctChange: 2.44 },
    'AP': { price: 44.80, prevClose: 46.05, change: -1.25, pctChange: -2.71 },
    'AETF': { price: 96.61, prevClose: 96.61, change: 0.00, pctChange: 0.00 },
    'SMPH': { price: 16.10, prevClose: 16.00, change: 0.10, pctChange: 0.63 },
    'JFC': { price: 143.50, prevClose: 145.90, change: -2.40, pctChange: -1.64 },
    'ALI': { price: 15.44, prevClose: 15.70, change: -0.26, pctChange: -1.66 },
    'AREIT': { price: 36.25, prevClose: 36.90, change: -0.65, pctChange: -1.76 }
  }
};

function fetchYahoo(symbol) {
  return new Promise((resolve) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const meta = json?.chart?.result?.[0]?.meta;
          if (meta && meta.regularMarketPrice) {
            const price = meta.regularMarketPrice;
            const prev = meta.chartPreviousClose || meta.previousClose || price;
            const change = +(price - prev).toFixed(2);
            const pct = prev > 0 ? +((change / prev) * 100).toFixed(2) : 0;
            return resolve({ price: +price.toFixed(2), prevClose: +prev.toFixed(2), change, pctChange: pct });
          }
        } catch (e) {}
        resolve(null);
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(3000, () => { req.destroy(); resolve(null); });
  });
}

async function refreshMarketQuotes() {
  const psei = await fetchYahoo('^PSEI');
  if (psei) marketCache.psei = { index: psei.price, change: psei.change, pctChange: psei.pctChange };

  for (const [ticker, symbol] of Object.entries(YAHOO_PSE_MAP)) {
    if (ticker === '^PSEI') continue;
    const q = await fetchYahoo(symbol);
    if (q && q.price > 0) marketCache.quotes[ticker] = q;
  }
  marketCache.timestamp = new Date().toISOString();
  marketCache.lastSyncFormatted = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) + ' (Live Cloud Sync)';
}

setInterval(refreshMarketQuotes, 300000);
setTimeout(refreshMarketQuotes, 2000);

app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'pse-personal-terminal' }));
app.get('/api/market/quotes', (req, res) => res.json({ success: true, data: marketCache }));
app.post('/api/market/sync', async (req, res) => {
  await refreshMarketQuotes();
  res.json({ success: true, data: marketCache });
});

app.get('*', (req, res) => {
  const candidates = [
    path.join(__dirname, 'index.html'),
    path.join(__dirname, 'public', 'index.html')
  ];
  for (const f of candidates) {
    if (fs.existsSync(f)) return res.sendFile(f);
  }
  res.status(404).send('index.html not found.');
});

app.listen(PORT, () => console.log(`🚀 PSE Terminal Server running on port ${PORT}`));
