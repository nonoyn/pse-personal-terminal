import os
import time
import threading
from datetime import datetime
import requests
from flask import Flask, jsonify, send_from_directory

app = Flask(__name__, static_folder='.', static_url_path='')

YAHOO_PSE_MAP = {
    'ALI': 'ALI.PS', 'BDO': 'BDO.PS', 'SM': 'SM.PS', 'BPI': 'BPI.PS',
    'ICT': 'ICT.PS', 'TEL': 'TEL.PS', 'JFC': 'JFC.PS', 'AC': 'AC.PS',
    'SMPH': 'SMPH.PS', 'GLO': 'GLO.PS', 'MER': 'MER.PS', 'MBT': 'MBT.PS',
    'URC': 'URC.PS', 'PGOLD': 'PGOLD.PS', 'MEG': 'MEG.PS', 'RLC': 'RLC.PS',
    'ACEN': 'ACEN.PS', 'AP': 'AP.PS', 'AEV': 'AEV.PS', 'DMC': 'DMC.PS',
    'SCC': 'SCC.PS', 'MONDE': 'MONDE.PS', 'WLCON': 'WLCON.PS', 'BLOOM': 'BLOOM.PS',
    'CNVRG': 'CNVRG.PS', 'LTG': 'LTG.PS', 'NIKL': 'NIKL.PS', 'EMI': 'EMI.PS',
    'GTCAP': 'GTCAP.PS', 'AREIT': 'AREIT.PS', 'AETF': 'FMETF.PS', '^PSEI': '^PSEI'
}

market_cache = {
    "timestamp": datetime.utcnow().isoformat(),
    "lastSyncFormatted": "Oct 29 3:00 PM (PSE Official)",
    "psei": { "index": 5705.58, "change": 52.03, "pctChange": 0.92 },
    "quotes": {
        'BPI': { 'price': 95.00, 'prevClose': 94.00, 'change': 1.00, 'pctChange': 1.06 },
        'GCASH': { 'price': 6.69, 'prevClose': 6.72, 'change': -0.03, 'pctChange': -0.45 },
        'BDO': { 'price': 117.40, 'prevClose': 117.10, 'change': 0.30, 'pctChange': 0.26 },
        'SM': { 'price': 546.00, 'prevClose': 534.00, 'change': 12.00, 'pctChange': 2.25 },
        'MBT': { 'price': 60.55, 'prevClose': 60.75, 'change': -0.20, 'pctChange': -0.33 },
        'MER': { 'price': 427.20, 'prevClose': 429.80, 'change': -2.60, 'pctChange': -0.60 },
        'AEV': { 'price': 39.55, 'prevClose': 40.25, 'change': -0.70, 'pctChange': -1.74 },
        'AC': { 'price': 539.00, 'prevClose': 540.00, 'change': -1.00, 'pctChange': -0.19 },
        'GLO': { 'price': 1520.00, 'prevClose': 1550.00, 'change': -30.00, 'pctChange': -1.94 },
        'ICT': { 'price': 840.00, 'prevClose': 820.00, 'change': 20.00, 'pctChange': 2.44 },
        'AP': { 'price': 44.80, 'prevClose': 46.05, 'change': -1.25, 'pctChange': -2.71 },
        'AETF': { 'price': 96.61, 'prevClose': 96.61, 'change': 0.00, 'pctChange': 0.00 },
        'SMPH': { 'price': 16.10, 'prevClose': 16.00, 'change': 0.10, 'pctChange': 0.63 },
        'JFC': { 'price': 143.50, 'prevClose': 145.90, 'change': -2.40, 'pctChange': -1.64 },
        'ALI': { 'price': 15.44, 'prevClose': 15.70, 'change': -0.26, 'pctChange': -1.66 },
        'AREIT': { 'price': 36.25, 'prevClose': 36.90, 'change': -0.65, 'pctChange': -1.76 }
    }
}

def fetch_yahoo(symbol):
    try:
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d&range=1d"
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        r = requests.get(url, headers=headers, timeout=4)
        if r.status_code == 200:
            data = r.json()
            meta = data.get('chart', {}).get('result', [{}])[0].get('meta', {})
            price = meta.get('regularMarketPrice')
            prev = meta.get('chartPreviousClose') or meta.get('previousClose') or price
            if price and price > 0:
                change = round(price - prev, 2)
                pct = round((change / prev) * 100, 2) if prev > 0 else 0
                return {'price': round(price, 2), 'prevClose': round(prev, 2), 'change': change, 'pctChange': pct}
    except Exception:
        pass
    return None

def refresh_quotes():
    psei = fetch_yahoo('^PSEI')
    if psei:
        market_cache['psei'] = {'index': psei['price'], 'change': psei['change'], 'pctChange': psei['pctChange']}
    for ticker, symbol in YAHOO_PSE_MAP.items():
        if ticker == '^PSEI': continue
        q = fetch_yahoo(symbol)
        if q and q['price'] > 0:
            market_cache['quotes'][ticker] = q
        time.sleep(0.12)
    market_cache['timestamp'] = datetime.utcnow().isoformat()
    market_cache['lastSyncFormatted'] = datetime.now().strftime('%I:%M %p (Python Cloud Sync)')

def background_worker():
    time.sleep(2)
    refresh_quotes()
    while True:
        time.sleep(300)
        refresh_quotes()

threading.Thread(target=background_worker, daemon=True).start()

@app.route('/')
def index():
    for c in ['index.html', 'public/index.html']:
        if os.path.exists(c):
            folder, fname = os.path.split(c)
            return send_from_directory(folder or '.', fname)
    return "index.html not found.", 404

@app.route('/api/health')
def health():
    return jsonify({"status": "ok", "service": "pse-personal-terminal", "language": "python"})

@app.route('/api/market/quotes')
def quotes():
    return jsonify({"success": True, "data": market_cache})

@app.route('/api/market/sync', methods=['POST'])
def sync():
    refresh_quotes()
    return jsonify({"success": True, "data": market_cache})

@app.route('/<path:path>')
def static_files(path):
    if os.path.exists(path):
        return send_from_directory('.', path)
    return index()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 3000))
    app.run(host='0.0.0.0', port=port)
