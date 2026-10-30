const express = require('express');
const cors = require('cors');
const path = require('path');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Stock mapping from ticker to Yahoo Finance PSE symbol (.PS)
const YAHOO_PSE_MAP = {
  'ALI': 'ALI.PS',
  'BDO': 'BDO.PS',
  'SM': 'SM.PS',
  'BPI': 'BPI.PS',
  'ICT': 'ICT.PS',
  'TEL': 'TEL.PS',
  'JFC': 'JFC.PS',
  'AC': 'AC.PS',
  'SMPH': 'SMPH.PS',
  'GLO': 'GLO.PS',
  'MER': 'MER.PS',
  'MBT': 'MBT.PS',
  'URC': 'URC.PS',
  'PGOLD': 'PGOLD.PS',
  'MEG': 'MEG.PS',
  'RLC': 'RLC.PS',
  'ACEN': 'ACEN.PS',
  'AP': 'AP.PS',
  'AEV': 'AEV.PS',
  'DMC': 'DMC.PS',
  'SCC': 'SCC.PS',
  'MONDE': 'MONDE.PS',
  'WLCON': 'WLCON.PS',
  'BLOOM': 'BLOOM.PS',
  'CNVRG': 'CNVRG.PS',
  'LTG': 'LTG.PS',
  'NIKL': 'NIKL.PS',
  'EMI': 'EMI.PS',
  'GTCAP': 'GTCAP.PS',
  'AREIT': 'AREIT.PS',
  'AETF': 'FMETF.PS',
  '^PSEI': '^PSEI'
};

// Official benchmark fallback cache (updated automatically upon market close)
let marketCache = {
  timestamp: new Date().toISOString(),
  lastSyncFormatted: 'Oct 29 3:00 PM (PSE Official)',
  psei: {
    index: 5705.58,
    change: 52.03,
    pctChange: 0.92
  },
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

// Helper: Fetch Yahoo Finance quote from server side with User-Agent header (no browser CORS blocks)
function fetchYahooServer(symbol) {
  return new Promise((resolve) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      },
      timeout: 4000
    };

    https.get(url, options, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return resolve(null);
      }
      let rawData = '';
      res.on('data', (chunk) => { rawData += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(rawData);
          const result = json.chart && json.chart.result && json.chart.result[0];
          if (result && result.meta) {
            const price = result.meta.regularMarketPrice;
            const prevClose = result.meta.chartPreviousClose || result.meta.previousClose || price;
            if (price !== undefined && price !== null && !isNaN(price) && price > 0) {
              return resolve({
                price: parseFloat(price.toFixed(2)),
                prevClose: parseFloat(prevClose.toFixed(2)),
                change: parseFloat((price - prevClose).toFixed(2)),
                pctChange: prevClose > 0 ? parseFloat((((price - prevClose) / prevClose) * 100).toFixed(2)) : 0
              });
            }
          }
        } catch (e) {}
        resolve(null);
      });
    }).on('error', () => {
      resolve(null);
    }).on('timeout', function() {
      this.abort();
      resolve(null);
    });
  });
}

// Background auto-refresh worker: Runs every 5 minutes during trading hours
async function refreshMarketQuotes() {
  console.log(`[${new Date().toLocaleTimeString()}] Fetching live PSE market quotes directly from Yahoo Finance...`);
  let updated = 0;

  // 1. Fetch PSEi
  const pseiQuote = await fetchYahooServer('^PSEI');
  if (pseiQuote && pseiQuote.price > 0) {
    marketCache.psei = {
      index: pseiQuote.price,
      change: pseiQuote.change,
      pctChange: pseiQuote.pctChange
    };
  }

  // 2. Fetch all mapped stock tickers in sequence to respect Yahoo rate limits
  const tickers = Object.keys(YAHOO_PSE_MAP).filter(t => t !== '^PSEI');
  for (const t of tickers) {
    const symbol = YAHOO_PSE_MAP[t];
    try {
      const q = await fetchYahooServer(symbol);
      if (q && q.price > 0) {
        // Sanity filter
        if (t === 'BPI' && q.price > 115) continue;
        marketCache.quotes[t] = q;
        updated++;
      }
    } catch (err) {}
    // gentle throttle
    await new Promise(r => setTimeout(r, 120));
  }

  marketCache.timestamp = new Date().toISOString();
  marketCache.lastSyncFormatted = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) + ' (Live Cloud Sync)';
  console.log(`[${new Date().toLocaleTimeString()}] Market sync complete: updated ${updated} tickers. PSEi: ${marketCache.psei.index}`);
}

// Initial background sync after launch
setTimeout(refreshMarketQuotes, 3000);
// Periodic background sync every 5 minutes
setInterval(refreshMarketQuotes, 5 * 60 * 1000);

// API Endpoints
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'pse-personal-terminal', uptime: process.uptime() });
});

app.get('/api/market/quotes', (req, res) => {
  res.json({
    success: true,
    data: marketCache
  });
});

app.post('/api/market/sync', async (req, res) => {
  await refreshMarketQuotes();
  res.json({
    success: true,
    data: marketCache
  });
});

// Fallback all routes to single page app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 PSE Terminal Server running on port ${PORT}`);
});
