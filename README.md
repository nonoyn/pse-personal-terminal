# PSE Personal Terminal (Cloud Edition for Render.com)

A Philippine Stock Exchange (PSE) terminal and GCash / GStocks portfolio manager with live automated server-side market rate syncing.

## Why Render.com Solves the Netlify Sync Issue

1. **Direct Yahoo Finance Server Sync**: On static hosting like Netlify, the client's browser has to make cross-origin requests to Yahoo Finance, which are blocked by CORS. Using public proxies (`allorigins`, `corsproxy`) causes rate-limits, timeouts, and stale cached rates.
2. **Dedicated Node.js Process**: On Render.com, `server.js` makes direct server-to-server HTTPS requests to Yahoo Finance (`.PS` tickers) with official browser user-agent headers, completely bypassing browser CORS restrictions.
3. **Background Auto-Refresh Worker**: The server polls fresh rates automatically every 5 minutes and immediately serves them to both mobile and desktop screens.

---

## Folder Structure

```
render_app/
├── package.json         # Node.js dependencies (express, cors)
├── server.js            # Express server & background Yahoo Finance sync worker
├── render.yaml          # Render.com Blueprint deployment file
├── public/
│   └── index.html       # Full interactive PSE terminal & portfolio dashboard
└── README.md
```

---

## 2-Minute Deployment Guide to Render.com

### Step 1: Create a GitHub Repository
1. Go to [github.com/new](https://github.com/new) and name your repository (e.g., `pse-personal-terminal`).
2. Upload the contents of the `render_app` directory to your repository (or push via git).

### Step 2: Deploy on Render.com
1. Log in to [dashboard.render.com](https://dashboard.render.com/).
2. Click **New +** &rarr; **Web Service**.
3. Select your GitHub repository (`pse-personal-terminal`).
4. Set the following settings (if not automatically detected from `render.yaml`):
   - **Name**: `pse-personal-terminal`
   - **Language**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: `Free`
5. Click **Create Web Service** (or **Deploy**).

### Step 3: Access Your Live Dashboard
Render will build and deploy the app. Once finished, you will receive a public URL such as:
`https://pse-personal-terminal.onrender.com`

You can open this URL on your **iPhone (mobile)** and **desktop browser**. Both will stay synchronized with live Philippine Stock Exchange rates!
