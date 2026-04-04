# 💰 SalaryCalc

A professional, real-time salary calculator with gross ↔ net bidirectional calculation, multi-currency support, tax configuration, employer cost breakdown, bonus estimation, PDF export, share links, and light/dark mode.

**Live demo:** [tudor-halasag.github.io/salary-calculator](https://tudor-halasag.github.io/salary-calculator)

---

## Features

| Feature | Details |
|---|---|
| Bidirectional calc | Edit gross → net updates instantly; edit net → gross updates instantly |
| Real-time | No submit button — updates as you type |
| Multi-currency | RON, EUR, USD, GBP, CHF, PLN — each with country-specific default rates |
| Tax sliders | Income tax, pension, health — all configurable per-session |
| Employer cost | Toggle to see total cost to company |
| Bonus / 13th month | Separate bonus input with net bonus calculation |
| Monthly / Yearly | Toggle at the top — all values scale accordingly |
| Donut chart | Visual salary distribution with Chart.js |
| PDF export | Print-optimized layout via browser print dialog |
| Share link | Copies a URL with all current values pre-filled |
| Dark mode | Full dark theme, persisted across sessions |
| LocalStorage | All inputs and settings saved automatically |

---

## File structure

```
salary-calculator/
├── index.html          # Entry point — fonts, styles, CDN scripts
├── src/
│   └── app.jsx         # Full React application (single file)
└── README.md
```

---

## Run locally

No build step required. The app uses Babel standalone to transpile JSX in the browser.

### Option A — VS Code Live Server (recommended)

1. Install the **Live Server** extension in VS Code
2. Open the `salary-calculator/` folder
3. Right-click `index.html` → **Open with Live Server**
4. Opens at `http://127.0.0.1:5500`

### Option B — Python HTTP server

```bash
cd salary-calculator
python -m http.server 8080
# Visit http://localhost:8080
```

### Option C — Node http-server

```bash
npx http-server salary-calculator -p 8080 -o
```

> **Note:** Opening `index.html` directly as a `file://` URL will fail because the browser blocks loading of the `src/app.jsx` module. Always use a local server.

---

## Deploy to GitHub Pages

### 1. Create the repository

Go to [github.com/new](https://github.com/new) and create a repo named exactly:

```
salary-calculator
```

Make sure it's **public**.

### 2. Push your code

```bash
cd salary-calculator

git init
git add .
git commit -m "Initial commit — SalaryCalc"

git remote add origin https://github.com/tudor-halasag/salary-calculator.git
git branch -M main
git push -u origin main
```

### 3. Enable GitHub Pages

1. Go to your repo → **Settings** → **Pages**
2. Under **Source**, select:
   - Branch: `main`
   - Folder: `/ (root)`
3. Click **Save**

GitHub will deploy in ~60 seconds. Your app will be live at:

```
https://tudor-halasag.github.io/salary-calculator/
```

### 4. Update the share link base URL (optional)

In `src/app.jsx`, the share link uses `window.location.href` automatically — no changes needed. It works both locally and on GitHub Pages.

---

## Customise default tax rates

In `src/app.jsx`, find the `CURRENCY_PRESETS` object near the top:

```js
const CURRENCY_PRESETS = {
  RON: { incomeTax: 10, pension: 25, health: 10, employerPension: 4, employerHealth: 2.25 },
  EUR: { incomeTax: 25, pension: 10, health: 7,  employerPension: 15, employerHealth: 13 },
  // ...
};
```

Edit the percentages to match your country's current rates. No build step needed.

---

## Add a new currency

In `src/app.jsx`, add to the `CURRENCIES` array:

```js
{ code: 'SEK', symbol: 'kr', name: 'Swedish Krona' },
```

Then add its defaults to `CURRENCY_PRESETS`:

```js
SEK: { incomeTax: 20, pension: 7, health: 0, employerPension: 10.21, employerHealth: 3.55 },
```

---

## Tech stack

- **React 18** (UMD, no bundler)
- **Chart.js 4** — donut chart
- **Babel Standalone** — JSX transpilation in-browser
- **LocalStorage** — session persistence
- **CSS custom properties** — full light/dark theming
- **window.print()** — PDF export via browser print dialog

No npm, no webpack, no build step. Pure static files — deployable anywhere.
