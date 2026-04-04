const { useState, useEffect, useRef, useMemo, useCallback } = React;

/* ─────────────────────────────────────────────────────────────
   ROMANIAN TAX CALCULATION (correct formula)
   ──────────────────────────────────────────────────────────────
   1. CAS  (pension)  = gross × CAS%          (default 25%)
   2. CASS (health)   = gross × CASS%         (default 10%)
   3. Taxable base    = gross − CAS − CASS
   4. Income tax      = taxable × incomeTax%  (default 10%)
   5. Net             = gross − CAS − CASS − income_tax
   ───────────────────────────────────────────────────────────── */
function calcRomanian(grossMonthly, rates) {
  const g      = parseFloat(grossMonthly) || 0;
  const cas    = g * (rates.cas  / 100);
  const cass   = g * (rates.cass / 100);
  const taxBase= g - cas - cass;
  const it     = taxBase * (rates.incomeTax / 100);
  const net    = g - cas - cass - it;
  return { gross: g, cas, cass, it, taxBase, net, totalDeductions: cas + cass + it };
}

/* ─── Constants ─────────────────────────────────────────────── */
const DEFAULT_RATES = { cas: 25, cass: 10, incomeTax: 10 };

const CONVERT_CURRENCIES = [
  { code: 'EUR', label: 'Euro' },
  { code: 'USD', label: 'US Dollar' },
  { code: 'GBP', label: 'British Pound' },
  { code: 'CHF', label: 'Swiss Franc' },
  { code: 'HUF', label: 'Hungarian Forint' },
];

const PERIOD_MULT   = { weekly: 12/52, monthly: 1, yearly: 12 };
const PERIOD_LABELS = { weekly: 'per week', monthly: 'per month', yearly: 'per year' };

const LS_KEY = 'salary-calc-ro-v1';

function loadState() {
  try { const s = localStorage.getItem(LS_KEY); return s ? JSON.parse(s) : null; }
  catch { return null; }
}
function saveState(s) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch {}
}

/* ─── Helpers ───────────────────────────────────────────────── */
function fmt(val, decimals = 2) {
  if (isNaN(val) || val === 0) return '0.' + '0'.repeat(decimals);
  return val.toLocaleString('ro-RO', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function pct(part, whole) {
  if (!whole) return '0.0';
  return ((part / whole) * 100).toFixed(1);
}

/* ─── Currency fetch (open exchange rates — no key needed for RON pairs) ── */
async function fetchRates() {
  try {
    // Using frankfurter.app — free, no key, returns live ECB rates
    const res = await fetch('https://api.frankfurter.app/latest?from=RON&to=EUR,USD,GBP,CHF,HUF');
    if (!res.ok) throw new Error('fetch failed');
    const data = await res.json();
    return data.rates; // { EUR: 0.2, USD: 0.22, ... }
  } catch {
    return null;
  }
}

/* ─── DonutChart ─────────────────────────────────────────────── */
function DonutChart({ data, isDark }) {
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const lp = ['#1a7a4a','#1a5276','#b45309'];
    const dp = ['#34d399','#5b9bd5','#fbbf24'];
    const palette = isDark ? dp : lp;

    if (chartRef.current) chartRef.current.destroy();
    chartRef.current = new Chart(canvasRef.current, {
      type: 'doughnut',
      data: {
        labels: data.map(d => d.label),
        datasets: [{ data: data.map(d => d.value), backgroundColor: palette, borderWidth: 0, hoverOffset: 8 }]
      },
      options: {
        responsive: true, maintainAspectRatio: true, cutout: '68%',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => ` ${fmt(ctx.raw)} RON  (${pct(ctx.raw, data.reduce((a,d) => a+d.value,0))}%)`
            },
            backgroundColor: isDark ? '#1e1e1c' : '#0a0a0a',
            titleColor: '#fff', bodyColor: '#ccc', padding: 10, cornerRadius: 8,
          }
        },
        animation: { duration: 360, easing: 'easeInOutQuart' }
      }
    });
    return () => { if (chartRef.current) chartRef.current.destroy(); };
  }, [data, isDark]);

  return (
    <div style={{ width: '100%', maxWidth: 190, margin: '0 auto' }}>
      <canvas ref={canvasRef}></canvas>
    </div>
  );
}

/* ─── Editable slider ────────────────────────────────────────── */
function LabeledSlider({ label, value, min, max, step, color, onChange, description }) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState('');
  const fill = ((value - min) / (max - min)) * 100;

  const commitEdit = () => {
    const v = parseFloat(draft);
    if (!isNaN(v)) onChange(Math.max(min, Math.min(max, v)));
    setEditing(false);
  };

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{label}</span>
          {description && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>{description}</span>}
        </div>
        {editing ? (
          <input
            type="number" autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(false); }}
            style={{
              width: 72, fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 500,
              color, background: 'var(--bg-input)', border: `1.5px solid ${color}`,
              borderRadius: 20, padding: '2px 8px', outline: 'none', textAlign: 'center',
            }}
          />
        ) : (
          <span
            onClick={() => { setDraft(value.toFixed(2)); setEditing(true); }}
            title="Click to edit"
            style={{
              fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 500, color,
              background: 'var(--bg-input)', padding: '2px 10px', borderRadius: 20,
              border: `1px solid var(--border)`, cursor: 'text',
              transition: 'border-color 0.14s',
            }}>
            {value.toFixed(2)}%
          </span>
        )}
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{
          background: `linear-gradient(to right, ${color} 0%, ${color} ${fill}%, var(--border) ${fill}%, var(--border) 100%)`
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{min}%</span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{max}%</span>
      </div>
    </div>
  );
}

/* ─── SalaryInput ───────────────────────────────────────────── */
function SalaryInput({ label, value, onChange, highlight, badge, placeholder }) {
  const [focused, setFocused] = useState(false);
  const active = highlight || focused;

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
          {label}
        </label>
        {badge && (
          <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 7px', borderRadius: 20, background: 'var(--accent-light)', color: 'var(--accent)', letterSpacing: '0.03em', flexShrink: 0, marginLeft: 6 }}>
            {badge}
          </span>
        )}
      </div>
      <div style={{
        display: 'flex', alignItems: 'center',
        background: 'var(--bg-input)',
        border: `1.5px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-sm)',
        transition: 'border-color 0.14s ease, box-shadow 0.14s ease',
        boxShadow: focused ? 'var(--glow-focus)' : active ? 'var(--glow-idle)' : 'none',
        overflow: 'hidden',
      }}>
        <span style={{
          padding: '11px 12px', fontSize: 13, fontFamily: 'var(--mono)',
          color: 'var(--text-muted)', borderRight: '1px solid var(--border)',
          background: 'var(--bg-card)', whiteSpace: 'nowrap', minWidth: 48, textAlign: 'center',
        }}>RON</span>
        <input
          type="number" min="0" step="100"
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder || '0'}
          style={{
            flex: 1, border: 'none', background: 'transparent',
            padding: '11px 12px', fontSize: 20, fontWeight: 500,
            fontFamily: 'var(--mono)', color: 'var(--text-primary)', outline: 'none', width: '100%',
          }}
        />
      </div>
    </div>
  );
}

/* ─── BreakdownRow ──────────────────────────────────────────── */
function BreakdownRow({ label, amount, percentage, color, bg, isTotal }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: isTotal ? '12px 16px' : '9px 16px',
      background: isTotal ? bg : 'transparent',
      borderRadius: isTotal ? 'var(--radius-sm)' : 0,
      borderBottom: isTotal ? 'none' : '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <div style={{ width: 9, height: 9, borderRadius: 2, background: color, flexShrink: 0 }}></div>
        <span style={{ fontSize: 13, color: isTotal ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: isTotal ? 600 : 400 }}>{label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--mono)', width: 38, textAlign: 'right' }}>{percentage}%</span>
        <span style={{ fontSize: 13, fontWeight: isTotal ? 600 : 500, fontFamily: 'var(--mono)', color: isTotal ? color : 'var(--text-primary)', minWidth: 100, textAlign: 'right' }}>
          {fmt(amount)} RON
        </span>
      </div>
    </div>
  );
}

/* ─── PeriodPill ────────────────────────────────────────────── */
function PeriodPill({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, padding: '7px 0', borderRadius: 6, border: 'none',
      fontSize: 12, fontWeight: 600, cursor: 'pointer',
      background: active ? 'var(--bg-accent)' : 'transparent',
      color: active ? 'var(--text-on-dark)' : 'var(--text-secondary)',
      transition: 'all 0.14s ease',
    }}>{label}</button>
  );
}

/* ─── SunIcon / MoonIcon ────────────────────────────────────── */
function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/>
      <line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/>
      <line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  );
}
function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/>
    </svg>
  );
}

/* ─── PDF Export ─────────────────────────────────────────────── */
function exportPDF(data, rates, period, convertedRates, convertCurrency) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = 210, margin = 18, col = pageW - margin * 2;

  /* header */
  doc.setFillColor(10, 10, 10);
  doc.rect(0, 0, 210, 28, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text('Tudor Andrei Halasag', margin, 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(180, 180, 180);
  doc.text('Salary Calculation Report', margin, 19);
  doc.text(new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }), pageW - margin, 19, { align: 'right' });

  let y = 38;

  /* period badge */
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 100, 100);
  const periodLabel = period.charAt(0).toUpperCase() + period.slice(1) + ' view · All values in RON';
  doc.text(periodLabel, margin, y);
  y += 10;

  /* hero block */
  doc.setFillColor(240, 239, 233);
  doc.roundedRect(margin, y, col, 28, 4, 4, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text('MONTHLY TAKE-HOME', margin + 6, y + 8);
  doc.setFontSize(20);
  doc.setTextColor(10, 10, 10);
  doc.text(`${fmt(data.net)} RON`, margin + 6, y + 20);

  /* sub stats right */
  const subX = margin + col - 6;
  const subItems = [
    ['GROSS', `${fmt(data.gross)} RON`],
    ['TOTAL TAX', `${fmt(data.totalDeductions)} RON`],
    ['EFFECTIVE RATE', `${pct(data.totalDeductions, data.gross)}%`],
  ];
  subItems.forEach(([label, val], i) => {
    const sx = margin + col * 0.52 + i * (col * 0.16);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100,100,100);
    doc.text(label, sx, y + 9);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(10,10,10);
    doc.text(val, sx, y + 17);
  });
  y += 36;

  /* breakdown table */
  const rows = [
    { label: 'Net salary',      val: data.net,            pctVal: pct(data.net, data.gross),            color: [26,122,74]  },
    { label: 'CAS (pension)',   val: data.cas,            pctVal: pct(data.cas, data.gross),            color: [26,82,118]  },
    { label: 'CASS (health)',   val: data.cass,           pctVal: pct(data.cass, data.gross),           color: [180,83,9]   },
    { label: 'Income tax',      val: data.it,             pctVal: pct(data.it, data.gross),             color: [109,40,217] },
    { label: 'Gross salary',    val: data.gross,          pctVal: '100.0',                              color: [80,80,80], bold: true },
  ];

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(80,80,80);
  doc.text('BREAKDOWN', margin, y);
  y += 5;

  rows.forEach((row, i) => {
    const rowH = 9;
    if (i % 2 === 0) {
      doc.setFillColor(248, 248, 246);
      doc.rect(margin, y, col, rowH, 'F');
    }
    /* colour dot */
    doc.setFillColor(...row.color);
    doc.circle(margin + 4, y + rowH/2, 1.5, 'F');
    /* label */
    doc.setFont('helvetica', row.bold ? 'bold' : 'normal');
    doc.setFontSize(9);
    doc.setTextColor(40, 40, 40);
    doc.text(row.label, margin + 9, y + rowH/2 + 1.2);
    /* pct */
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(120,120,120);
    doc.text(row.pctVal + '%', pageW - margin - 62, y + rowH/2 + 1.2, { align: 'right' });
    /* amount */
    doc.setFont('helvetica', row.bold ? 'bold' : 'normal');
    doc.setFontSize(9);
    doc.setTextColor(10,10,10);
    doc.text(`${fmt(row.val)} RON`, pageW - margin, y + rowH/2 + 1.2, { align: 'right' });
    y += rowH;
  });

  y += 8;

  /* tax rates */
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(80,80,80);
  doc.text('TAX RATES APPLIED', margin, y);
  y += 5;
  const rateItems = [
    ['CAS (pension)',  rates.cas + '%'],
    ['CASS (health)',  rates.cass + '%'],
    ['Income tax',     rates.incomeTax + '%'],
  ];
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  rateItems.forEach(([l, v]) => {
    doc.setTextColor(80,80,80); doc.text(l, margin + 4, y);
    doc.setTextColor(10,10,10); doc.setFont('helvetica','bold');
    doc.text(v, margin + 70, y);
    doc.setFont('helvetica','normal');
    y += 7;
  });

  /* currency conversion */
  if (convertedRates && convertCurrency !== 'none') {
    y += 4;
    const rate = convertedRates[convertCurrency];
    if (rate) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(80,80,80);
      doc.text(`CONVERTED TO ${convertCurrency}`, margin, y);
      y += 5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(10,10,10);
      doc.text(`Net: ${fmt(data.net * rate, 2)} ${convertCurrency}    Gross: ${fmt(data.gross * rate, 2)} ${convertCurrency}    Rate: 1 RON = ${rate.toFixed(4)} ${convertCurrency}`, margin + 4, y);
      y += 10;
    }
  }

  /* disclaimer */
  y = Math.max(y + 4, 255);
  doc.setFillColor(248,248,246);
  doc.rect(margin, y, col, 12, 'F');
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(130,130,130);
  doc.text('This tool provides estimates only and does not guarantee accuracy or official validity.', margin + 4, y + 5);
  doc.text('tudor-halasag.github.io/salary-calculator', margin + 4, y + 10);

  doc.save('salary-report.pdf');
}

/* ═══════════════════════════════════════════════════════════════
   MAIN APP
   ═══════════════════════════════════════════════════════════════ */
function App() {
  const saved = loadState();

  const [theme,           setTheme]           = useState(saved?.theme    || 'light');
  const [period,          setPeriod]          = useState(saved?.period   || 'monthly');
  const [activeInput,     setActiveInput]     = useState('gross');
  const [grossRaw,        setGrossRaw]        = useState(saved?.grossRaw || '5000');
  const [netRaw,          setNetRaw]          = useState(saved?.netRaw   || '');
  const [bonus,           setBonus]           = useState(saved?.bonus    || '');
  const [showBonus,       setShowBonus]       = useState(false);
  const [showEmployer,    setShowEmployer]    = useState(false);
  const [panelOpen,       setPanelOpen]       = useState(true);
  const [copied,          setCopied]          = useState(false);
  const [convertCurrency, setConvertCurrency] = useState(saved?.convertCurrency || 'EUR');
  const [fxRates,         setFxRates]         = useState(null);
  const [fxLoading,       setFxLoading]       = useState(false);
  const [fxError,         setFxError]         = useState(false);
  const [pulseKey,        setPulseKey]        = useState(0);
  const [mobilePanel,     setMobilePanel]     = useState(false);

  const isDark = theme === 'dark';
  const [rates, setRates] = useState(saved?.rates || { ...DEFAULT_RATES });

  /* Apply theme */
  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); }, [theme]);

  /* Fetch live FX rates */
  useEffect(() => {
    setFxLoading(true);
    fetchRates().then(r => {
      setFxRates(r);
      setFxLoading(false);
      if (!r) setFxError(true);
    });
  }, []);

  /* URL params */
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('gross')) { setGrossRaw(p.get('gross')); setActiveInput('gross'); }
    if (p.get('period')) setPeriod(p.get('period'));
    if (p.get('cas'))  setRates(prev => ({ ...prev, cas:       parseFloat(p.get('cas'))  }));
    if (p.get('cass')) setRates(prev => ({ ...prev, cass:      parseFloat(p.get('cass')) }));
    if (p.get('it'))   setRates(prev => ({ ...prev, incomeTax: parseFloat(p.get('it'))   }));
  }, []);

  /* Base monthly calc */
  const baseResult = useMemo(() => {
    if (activeInput === 'gross') return calcRomanian(grossRaw, rates);
    /* reverse: net → gross */
    const n = parseFloat(netRaw) || 0;
    const totalRate = (rates.cas + rates.cass) / 100;
    const itRate    = rates.incomeTax / 100;
    /* net = gross*(1 - cas% - cass% - (1 - cas% - cass%)*it%) */
    const factor = 1 - totalRate - (1 - totalRate) * itRate;
    const g = factor > 0 ? n / factor : 0;
    return calcRomanian(g, rates);
  }, [grossRaw, netRaw, rates, activeInput]);

  /* Scale by period */
  const mult = PERIOD_MULT[period];
  const r = {
    gross:            baseResult.gross            * mult,
    net:              baseResult.net              * mult,
    cas:              baseResult.cas              * mult,
    cass:             baseResult.cass             * mult,
    it:               baseResult.it               * mult,
    taxBase:          baseResult.taxBase          * mult,
    totalDeductions:  baseResult.totalDeductions  * mult,
  };

  const bonusVal   = parseFloat(bonus) || 0;
  const bonusCalc  = calcRomanian(bonusVal, rates);
  const bonusNet   = bonusCalc.net * mult;

  /* Sync opposite field */
  useEffect(() => {
    if (activeInput === 'gross') {
      setNetRaw(baseResult.net   > 0 ? baseResult.net.toFixed(2)   : '');
    } else {
      setGrossRaw(baseResult.gross > 0 ? baseResult.gross.toFixed(2) : '');
    }
    setPulseKey(k => k + 1);
  }, [baseResult, activeInput]);

  /* Persist */
  useEffect(() => {
    saveState({ theme, period, grossRaw, netRaw, rates, bonus, convertCurrency });
  }, [theme, period, grossRaw, netRaw, rates, bonus, convertCurrency]);

  const handleGrossChange = v => { setActiveInput('gross'); setGrossRaw(v); };
  const handleNetChange   = v => { setActiveInput('net');   setNetRaw(v);   };

  const handleReset = () => {
    setGrossRaw('5000'); setNetRaw(''); setBonus('');
    setActiveInput('gross');
    setRates({ ...DEFAULT_RATES });
    localStorage.removeItem(LS_KEY);
  };

  const handleShare = () => {
    const base = window.location.href.split('?')[0];
    const params = new URLSearchParams({
      gross: baseResult.gross.toFixed(2), period,
      cas: rates.cas, cass: rates.cass, it: rates.incomeTax,
    });
    navigator.clipboard.writeText(`${base}?${params}`).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2400);
    });
  };

  /* Converted amount */
  const fxRate     = fxRates?.[convertCurrency] || null;
  const convertedNet   = fxRate ? r.net   * fxRate : null;
  const convertedGross = fxRate ? r.gross * fxRate : null;

  /* Donut data */
  const donutData = [
    { label: 'Net salary', value: r.net,  color: 'var(--green)' },
    { label: 'CAS',        value: r.cas,  color: 'var(--accent)' },
    { label: 'CASS',       value: r.cass, color: 'var(--amber)'  },
    { label: 'Income tax', value: r.it,   color: 'var(--purple)' },
  ].filter(d => d.value > 0);

  const COLORS = { net: 'var(--green)', cas: 'var(--accent)', cass: 'var(--amber)', it: 'var(--purple)' };

  /* ─ shared card styles ─ */
  const card = 'glass';
  const cardHeaderStyle = {
    padding: '13px 18px', borderBottom: '1px solid var(--border)',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  };
  const cardTitleStyle = { fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.07em', textTransform: 'uppercase' };

  /* ─ Settings panel content (shared between desktop sidebar + mobile drawer) ─ */
  const SettingsContent = () => (
    <>
      {/* Period selector */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Pay period</div>
        <div style={{ display: 'flex', gap: 3, background: 'var(--bg-input)', borderRadius: 8, padding: 3, border: '1px solid var(--border)' }}>
          {['weekly','monthly','yearly'].map(p => (
            <PeriodPill key={p} label={p.charAt(0).toUpperCase()+p.slice(1)} active={period===p} onClick={() => setPeriod(p)} />
          ))}
        </div>
      </div>

      {/* Tax sliders */}
      <div style={{ marginBottom: 4 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 }}>Tax rates</div>
        <LabeledSlider label="CAS (pension)"  value={rates.cas}       min={0} max={40} step={0.01} color="var(--accent)" onChange={v => setRates(r => ({...r, cas:v}))} />
        <LabeledSlider label="CASS (health)"  value={rates.cass}      min={0} max={25} step={0.01} color="var(--amber)"  onChange={v => setRates(r => ({...r, cass:v}))} />
        <LabeledSlider label="Income tax"     value={rates.incomeTax} min={0} max={60} step={0.01} color="var(--purple)" description="on taxable base" onChange={v => setRates(r => ({...r, incomeTax:v}))} />
      </div>

      <div style={{ height: 1, background: 'var(--border)', margin: '12px 0' }}></div>

      {/* Action buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button onClick={handleShare} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
          padding: '9px 0', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 500,
          cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--bg-card)',
          color: 'var(--text-secondary)', transition: 'all 0.14s ease', fontFamily: 'var(--font)',
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
          {copied ? '✓ Copied!' : 'Share link'}
        </button>
        <button
          onClick={() => exportPDF(r, rates, period, fxRates, convertCurrency)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            padding: '9px 0', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 500,
            cursor: 'pointer', border: 'none', background: 'var(--bg-accent)',
            color: 'var(--text-on-dark)', transition: 'all 0.14s ease', fontFamily: 'var(--font)',
          }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
          Export PDF
        </button>
        <button onClick={handleReset} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
          padding: '8px 0', borderRadius: 'var(--radius-sm)', fontSize: 12, fontWeight: 500,
          cursor: 'pointer', border: '1px solid var(--border)', background: 'transparent',
          color: 'var(--text-muted)', transition: 'all 0.14s ease', fontFamily: 'var(--font)',
        }}>
          Reset all
        </button>
      </div>
    </>
  );

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

      {/* ══════════ HEADER ══════════ */}
      <header className="no-print glass" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px', height: 58,
        borderRadius: 0, borderLeft: 'none', borderRight: 'none', borderTop: 'none',
        position: 'sticky', top: 0, zIndex: 200,
      }}>
        {/* Logo — 180px wide, links to portfolio */}
        <a href="https://tudor-halasag.github.io" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', flexShrink: 0 }}>
          <img
            src="tahlogo.svg"
            alt="Tudor Halasag"
            className="logo-img"
            style={{ width: 180, height: 'auto', display: 'block', maxHeight: 40, objectFit: 'contain' }}
            onError={e => { e.target.style.display = 'none'; }}
          />
        </a>

        {/* Right actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <a href="https://tudor-halasag.github.io" className="btn-about" target="_blank" rel="noopener noreferrer">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
            About me
          </a>
          <button
            className="icon-btn"
            onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>
            {isDark ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </header>

      {/* ══════════ PAGE TITLE ══════════ */}
      <div className="no-print" style={{ textAlign: 'center', padding: '26px 20px 6px' }}>
        <h1 style={{
          fontFamily: 'var(--serif)',
          fontSize: 'clamp(20px, 3.8vw, 32px)',
          fontWeight: 600,
          color: '#ffffff',
          textShadow: '0 2px 20px rgba(0,0,0,0.6)',
          letterSpacing: '-0.01em',
          lineHeight: 1.2,
        }}>
          Salary Calculation Report
        </h1>
        <p style={{ fontSize: 13, color: 'rgba(200,220,255,0.7)', marginTop: 8 }}>
          Real-time gross ⇄ net calculator &middot; All values in RON with real-time currency conversion
        </p>
        {/* Disclaimer */}
        <p style={{ fontSize: 11, color: 'rgba(180,200,230,0.45)', marginTop: 6, fontStyle: 'italic', fontWeight: 300 }}>
          This tool provides estimates only and does not guarantee accuracy or official validity.
        </p>
      </div>

      {/* Mobile settings button */}
      <div className="mobile-settings-btn" style={{
        display: 'none', justifyContent: 'center', padding: '10px 20px 0',
      }}>
        <button onClick={() => setMobilePanel(true)} style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '9px 20px', borderRadius: 20,
          border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)',
          color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer',
          fontFamily: 'var(--font)', backdropFilter: 'blur(8px)',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="14" y2="12"/><line x1="4" y1="18" x2="18" y2="18"/></svg>
          Settings
        </button>
      </div>

      {/* ══════════ MAIN CONTENT ══════════ */}
      <main style={{ flex: 1, maxWidth: 1100, width: '100%', margin: '0 auto', padding: '18px 16px 40px' }}>
        <div className="main-grid" style={{ display: 'grid', gridTemplateColumns: '268px 1fr', gap: 16, alignItems: 'start' }}>

          {/* ── LEFT: Settings panel ── */}
          <div className="panel-col" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            <div className={card} style={{ padding: '16px' }}>
              <SettingsContent />
            </div>
          </div>

          {/* ── RIGHT: Results ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Salary inputs */}
            <div className={card}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <span style={cardTitleStyle}>Salary inputs &mdash; Romanian tax system</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{PERIOD_LABELS[period]}</span>
              </div>
              <div style={{ padding: '16px 18px' }}>
                <div className="salary-inputs-row" style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  <SalaryInput label="Gross" value={grossRaw} onChange={handleGrossChange} highlight={activeInput==='gross'} badge="BEFORE TAX" />
                  <SalaryInput label="Net"   value={netRaw}   onChange={handleNetChange}   highlight={activeInput==='net'}   badge="TAKE HOME" />
                </div>

                {/* Bonus toggle */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0 0', marginTop: 12, borderTop: '1px solid var(--border)', cursor: 'pointer', userSelect: 'none' }} onClick={() => setShowBonus(b => !b)}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>Bonus / 13th month</span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'inline-block', transform: showBonus ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }}>▼</span>
                </div>
                {showBonus && (
                  <div style={{ paddingTop: 10, animation: 'fadeUp 0.2s ease' }}>
                    <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-input)', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', marginBottom: 12 }}>
                      <span style={{ padding: '10px 12px', fontSize: 13, fontFamily: 'var(--mono)', color: 'var(--text-muted)', borderRight: '1px solid var(--border)', background: 'var(--bg-card)', minWidth: 48, textAlign: 'center' }}>RON</span>
                      <input type="number" min="0" step="100" value={bonus} onChange={e => setBonus(e.target.value)}
                        style={{ flex: 1, border: 'none', background: 'transparent', padding: '10px 12px', fontSize: 16, fontFamily: 'var(--mono)', color: 'var(--text-primary)', outline: 'none' }}
                        placeholder="Bonus amount" />
                    </div>
                    {bonusVal > 0 && (
                      <div style={{ display: 'flex', gap: 10 }}>
                        <div style={{ flex: 1, background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', border: '1px solid var(--border)' }}>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Gross bonus</div>
                          <div style={{ fontFamily: 'var(--mono)', fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>{fmt(bonusVal * mult)} RON</div>
                        </div>
                        <div style={{ flex: 1, background: 'var(--green-light)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', border: '1px solid var(--border)' }}>
                          <div style={{ fontSize: 10, color: 'var(--green)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Net bonus</div>
                          <div style={{ fontFamily: 'var(--mono)', fontWeight: 600, fontSize: 14, color: 'var(--green)' }}>{fmt(bonusNet)} RON</div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Hero take-home */}
            <div className={card} style={{ background: 'var(--hero-bg)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ padding: '22px 24px 20px' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--hero-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 5 }}>
                  {period.charAt(0).toUpperCase()+period.slice(1)} take-home
                </div>
                <div key={`net-${pulseKey}`} className="pulse-num" style={{
                  fontSize: 'clamp(30px,5vw,46px)', fontWeight: 600,
                  fontFamily: 'var(--mono)', color: 'var(--hero-text)',
                  lineHeight: 1, marginBottom: 14,
                }}>
                  {fmt(r.net)} <span style={{ fontSize: '0.45em', fontWeight: 400, opacity: 0.7 }}>RON</span>
                </div>
                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                  {[
                    { label: 'Gross',         value: `${fmt(r.gross)} RON` },
                    { label: 'Total tax',     value: `${fmt(r.totalDeductions)} RON` },
                    { label: 'Effective rate',value: `${pct(r.totalDeductions, r.gross)}%` },
                  ].map(item => (
                    <div key={item.label}>
                      <div style={{ fontSize: 10, color: 'var(--hero-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{item.label}</div>
                      <div style={{ fontSize: 13, fontFamily: 'var(--mono)', color: 'var(--hero-sub)', fontWeight: 500 }}>{item.value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Currency conversion strip */}
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--hero-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                  Convert to
                </div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {CONVERT_CURRENCIES.map(c => (
                    <button key={c.code} onClick={() => setConvertCurrency(c.code)} style={{
                      padding: '4px 12px', borderRadius: 20, border: '1px solid',
                      borderColor: convertCurrency === c.code ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.15)',
                      background: convertCurrency === c.code ? 'rgba(255,255,255,0.15)' : 'transparent',
                      color: convertCurrency === c.code ? 'var(--hero-text)' : 'var(--hero-muted)',
                      fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)',
                      transition: 'all 0.14s ease',
                    }}>{c.code}</button>
                  ))}
                </div>
                <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                  {fxLoading && <span style={{ fontSize: 12, color: 'var(--hero-muted)' }}>Loading rates…</span>}
                  {fxError   && <span style={{ fontSize: 12, color: 'rgba(251,191,36,0.8)' }}>Rate unavailable</span>}
                  {convertedNet !== null && !fxLoading && (
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--hero-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Net in {convertCurrency}</div>
                      <div style={{ fontSize: 18, fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--hero-text)' }}>
                        {fmt(convertedNet)} <span style={{ fontSize: 12, opacity: 0.7, fontWeight: 400 }}>{convertCurrency}</span>
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--hero-muted)', marginTop: 2 }}>
                        1 RON = {fxRates[convertCurrency].toFixed(4)} {convertCurrency}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Breakdown + Donut grid */}
            <div className="inner-breakdown-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

              {/* Breakdown */}
              <div className={card}>
                <div style={cardHeaderStyle}>
                  <span style={cardTitleStyle}>Breakdown</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{PERIOD_LABELS[period]}</span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <div style={{ minWidth: 280 }}>
                    <BreakdownRow label="Net salary"  amount={r.net}  percentage={pct(r.net, r.gross)}  color={COLORS.net} bg="var(--green-light)" />
                    <BreakdownRow label="CAS (25%)"   amount={r.cas}  percentage={pct(r.cas, r.gross)}  color={COLORS.cas} bg="var(--accent-light)" />
                    <BreakdownRow label="CASS (10%)"  amount={r.cass} percentage={pct(r.cass, r.gross)} color={COLORS.cass} bg="var(--amber-light)" />
                    <BreakdownRow label="Income tax"  amount={r.it}   percentage={pct(r.it, r.gross)}   color={COLORS.it}  bg="var(--purple-light)" />
                    <div style={{ height: 8 }}></div>
                    <div style={{ padding: '0 12px 12px' }}>
                      <BreakdownRow label="Gross salary" amount={r.gross} percentage="100.0" color="var(--text-secondary)" bg="var(--bg-input)" isTotal />
                    </div>
                  </div>
                </div>
              </div>

              {/* Donut */}
              <div className={card}>
                <div style={cardHeaderStyle}>
                  <span style={cardTitleStyle}>Distribution</span>
                </div>
                <div style={{ padding: '14px 16px' }}>
                  <DonutChart data={donutData} isDark={isDark} />
                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {donutData.map(d => (
                      <div key={d.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <div style={{ width: 8, height: 8, borderRadius: 2, background: d.color, flexShrink: 0 }}></div>
                          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{d.label}</span>
                        </div>
                        <span style={{ fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 500, color: 'var(--text-primary)' }}>{pct(d.value, r.gross)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Taxable base info card */}
            <div className={card}>
              <div style={cardHeaderStyle}>
                <span style={cardTitleStyle}>Romanian tax formula</span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>per Law 227/2015</span>
              </div>
              <div style={{ padding: '12px 18px', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {[
                  { label: 'Gross', val: `${fmt(r.gross)} RON`, sub: '100%' },
                  { label: '− CAS', val: `${fmt(r.cas)} RON`, sub: `${rates.cas}%`, color: 'var(--accent)' },
                  { label: '− CASS', val: `${fmt(r.cass)} RON`, sub: `${rates.cass}%`, color: 'var(--amber)' },
                  { label: 'Taxable base', val: `${fmt(r.taxBase)} RON`, sub: `${pct(r.taxBase, r.gross)}%` },
                  { label: '− Income tax', val: `${fmt(r.it)} RON`, sub: `${rates.incomeTax}% of base`, color: 'var(--purple)' },
                  { label: '= Net', val: `${fmt(r.net)} RON`, sub: `${pct(r.net, r.gross)}% of gross`, color: 'var(--green)', bold: true },
                ].map((item, i) => (
                  <div key={i} style={{ flex: '1 1 120px', background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)', padding: '10px 13px', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 10, color: item.color || 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>{item.label}</div>
                    <div style={{ fontFamily: 'var(--mono)', fontWeight: item.bold ? 700 : 600, fontSize: 14, color: item.color || 'var(--text-primary)' }}>{item.val}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{item.sub}</div>
                  </div>
                ))}
              </div>
            </div>

          </div>{/* end right col */}
        </div>{/* end grid */}
      </main>

      {/* ══════════ MOBILE SETTINGS DRAWER ══════════ */}
      {mobilePanel && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 300,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
        }} onClick={() => setMobilePanel(false)}>
          <div
            className="glass"
            style={{ position: 'absolute', bottom: 0, left: 0, right: 0, borderRadius: '16px 16px 0 0', padding: '20px', maxHeight: '80vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Settings</span>
              <button onClick={() => setMobilePanel(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 20 }}>✕</button>
            </div>
            <SettingsContent />
          </div>
        </div>
      )}

      {/* ══════════ FOOTER ══════════ */}
      <footer className="no-print glass" style={{
        borderRadius: 0, borderLeft: 'none', borderRight: 'none', borderBottom: 'none',
        padding: '14px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 0, flexWrap: 'wrap',
      }}>
        {/* centered group: copyright · LOGO · tagline */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            &copy; {new Date().getFullYear()} Tudor Andrei Halasag
          </span>

          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>·</span>

          {/* Logo as reset/scroll-top button */}
          <button
            onClick={() => { handleReset(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '0 2px' }}
            title="Reset & scroll to top">
            <img
              src="tahlogo.svg"
              alt="Tudor Halasag"
              className="logo-img"
              style={{ height: 22, width: 'auto' }}
              onError={e => { e.target.style.display = 'none'; }}
            />
          </button>

          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>·</span>

          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', whiteSpace: 'nowrap' }}>
            Built to understand your finances
          </span>
        </div>
      </footer>

    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(React.createElement(App));
