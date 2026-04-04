# Salary Calculator

Real-time Romanian gross ⇄ net salary calculator with live currency conversion.

**Live:** [tudor-halasag.github.io/salary-calculator](https://tudor-halasag.github.io/salary-calculator)

## Run locally

```bash
python -m http.server 8080
# open http://localhost:8080
```

> Requires a local server — `file://` won't work due to ES module loading.

## Deploy

Push to `main`. GitHub Actions handles the rest via `.github/workflows/deploy.yml`.

## Stack

React 18 · Chart.js 4 · jsPDF · Frankfurter FX API · no build step
