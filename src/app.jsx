const { useState, useEffect, useRef, useCallback, useMemo } = React;

/* ─── Constants ────────────────────────────────────────────── */
const CURRENCIES = [
  { code: 'RON', symbol: 'lei', name: 'Romanian Leu' },
  { code: 'EUR', symbol: '€',   name: 'Euro' },
  { code: 'USD', symbol: '$',   name: 'US Dollar' },
  { code: 'GBP', symbol: '£',   name: 'British Pound' },
  { code: 'CHF', symbol: 'Fr',  name: 'Swiss Franc' },
  { code: 'PLN', symbol: 'zł',  name: 'Polish Złoty' },
];

const CURRENCY_PRESETS = {
  RON: { incomeTax: 10, pension: 25, health: 10, employerPension: 4, employerHealth: 2.25 },
  EUR: { incomeTax: 25, pension: 10, health: 7,  employerPension: 15, employerHealth: 13 },
  USD: { incomeTax: 22, pension: 6.2, health: 1.45, employerPension: 6.2, employerHealth: 1.45 },
  GBP: { incomeTax: 20, pension: 5,  health: 0,  employerPension: 3, employerHealth: 13.8 },
  CHF: { incomeTax: 11, pension: 5.3, health: 0, employerPension: 5.3, employerHealth: 0 },
  PLN: { incomeTax: 12, pension: 9.76, health: 9, employerPension: 9.76, employerHealth: 0 },
};

const LS_KEY = 'salary-calc-v3';

function loadState() {
  try {
    const s = localStorage.getItem(LS_KEY);
    return s ? JSON.parse(s) : null;
  } catch { return null; }
}

function saveState(s) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch {}
}

/* ─── Calculation logic ─────────────────────────────────────── */
function calcFromGross(gross, rates, period) {
  const mult = period === 'yearly' ? 1 : 1;
  const g = parseFloat(gross) || 0;
  const incomeTaxAmt   = g * (rates.incomeTax / 100);
  const pensionAmt     = g * (rates.pension   / 100);
  const healthAmt      = g * (rates.health    / 100);
  const totalDeductions = incomeTaxAmt + pensionAmt + healthAmt;
  const net = g - totalDeductions;
  const employerPensionAmt = g * (rates.employerPension / 100);
  const employerHealthAmt  = g * (rates.employerHealth  / 100);
  const totalEmployerCost  = g + employerPensionAmt + employerHealthAmt;
  return { gross: g, net, incomeTaxAmt, pensionAmt, healthAmt, totalDeductions, employerPensionAmt, employerHealthAmt, totalEmployerCost };
}

function calcFromNet(net, rates) {
  const n = parseFloat(net) || 0;
  const totalRate = (rates.incomeTax + rates.pension + rates.health) / 100;
  const gross = totalRate >= 1 ? n : n / (1 - totalRate);
  return calcFromGross(gross, rates);
}

/* ─── Helpers ───────────────────────────────────────────────── */
function fmt(val, symbol, compact = false) {
  if (isNaN(val) || val === 0) return `${symbol} 0.00`;
  if (compact && val >= 1000) {
    return `${symbol} ${(val / 1000).toFixed(1)}k`;
  }
  return `${symbol} ${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pct(part, whole) {
  if (!whole) return '0.0';
  return ((part / whole) * 100).toFixed(1);
}

/* ─── DonutChart ─────────────────────────────────────────────── */
function DonutChart({ data, symbol }) {
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const colors = ['#1a5276', '#1a7a4a', '#b45309', '#6d28d9'];
    const darkColors = ['#5b9bd5', '#34d399', '#fbbf24', '#a78bfa'];
    const palette = isDark ? darkColors : colors;

    if (chartRef.current) chartRef.current.destroy();

    chartRef.current = new Chart(canvasRef.current, {
      type: 'doughnut',
      data: {
        labels: data.map(d => d.label),
        datasets: [{
          data: data.map(d => d.value),
          backgroundColor: palette,
          borderWidth: 0,
          hoverOffset: 8,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        cutout: '68%',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${fmt(ctx.raw, symbol)}  (${pct(ctx.raw, data.reduce((a,d) => a+d.value, 0))}%)`
            },
            backgroundColor: isDark ? '#2a2a28' : '#0a0a0a',
            titleColor: '#ffffff',
            bodyColor: '#cccccc',
            padding: 10,
            cornerRadius: 8,
          }
        },
        animation: { duration: 400, easing: 'easeInOutQuart' }
      }
    });
    return () => { if (chartRef.current) chartRef.current.destroy(); };
  }, [data, symbol]);

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 220, margin: '0 auto' }}>
      <canvas ref={canvasRef}></canvas>
    </div>
  );
}

/* ─── Slider with label ─────────────────────────────────────── */
function LabeledSlider({ label, value, min, max, step, color, onChange, description }) {
  const trackStyle = {
    background: `linear-gradient(to right, ${color} 0%, ${color} ${((value - min) / (max - min)) * 100}%, var(--border) ${((value - min) / (max - min)) * 100}%, var(--border) 100%)`
  };

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <div>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{label}</span>
          {description && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>{description}</span>}
        </div>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 500, color, background: 'var(--bg)', padding: '2px 8px', borderRadius: 20, border: '1px solid var(--border)' }}>
          {value.toFixed(2)}%
        </span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={trackStyle}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{min}%</span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{max}%</span>
      </div>
    </div>
  );
}

/* ─── SalaryInput ───────────────────────────────────────────── */
function SalaryInput({ label, value, onChange, symbol, highlight, badge }) {
  const [focused, setFocused] = useState(false);
  const borderColor = highlight ? 'var(--accent)' : focused ? 'var(--border-strong)' : 'var(--border)';

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          {label}
        </label>
        {badge && (
          <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 7px', borderRadius: 20, background: 'var(--accent-light)', color: 'var(--accent)', letterSpacing: '0.03em' }}>
            {badge}
          </span>
        )}
      </div>
      <div style={{
        display: 'flex', alignItems: 'center',
        background: 'var(--bg-input)',
        border: `1.5px solid ${borderColor}`,
        borderRadius: 'var(--radius-sm)',
        transition: `border-color 0.15s ease, box-shadow 0.15s ease`,
        boxShadow: focused || highlight ? `0 0 0 3px ${highlight ? 'rgba(26,82,118,0.12)' : 'rgba(0,0,0,0.04)'}` : 'none',
        overflow: 'hidden',
      }}>
        <span style={{
          padding: '12px 14px',
          fontSize: 14,
          fontFamily: 'var(--mono)',
          color: 'var(--text-muted)',
          borderRight: '1px solid var(--border)',
          background: 'var(--bg-card)',
          whiteSpace: 'nowrap',
          minWidth: 48,
          textAlign: 'center',
        }}>{symbol}</span>
        <input
          type="number"
          min="0"
          step="100"
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            flex: 1,
            border: 'none',
            background: 'transparent',
            padding: '12px 14px',
            fontSize: 22,
            fontWeight: 500,
            fontFamily: 'var(--mono)',
            color: 'var(--text-primary)',
            outline: 'none',
            width: '100%',
          }}
          placeholder="0"
        />
      </div>
    </div>
  );
}

/* ─── BreakdownRow ──────────────────────────────────────────── */
function BreakdownRow({ label, amount, percentage, color, bg, isTotal, symbol }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: isTotal ? '14px 16px' : '10px 16px',
      background: isTotal ? bg : 'transparent',
      borderRadius: isTotal ? 'var(--radius-sm)' : 0,
      borderBottom: isTotal ? 'none' : '1px solid var(--border)',
      marginBottom: isTotal ? 0 : 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 10, height: 10, borderRadius: 3, background: color, flexShrink: 0 }}></div>
        <span style={{ fontSize: 13, color: isTotal ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: isTotal ? 600 : 400 }}>{label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, textAlign: 'right' }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--mono)', width: 42, textAlign: 'right' }}>{percentage}%</span>
        <span style={{ fontSize: 14, fontWeight: isTotal ? 600 : 500, fontFamily: 'var(--mono)', color: isTotal ? color : 'var(--text-primary)', minWidth: 110, textAlign: 'right' }}>
          {fmt(amount, symbol)}
        </span>
      </div>
    </div>
  );
}

/* ─── Main App ──────────────────────────────────────────────── */
function App() {
  const saved = loadState();

  const [theme, setTheme]     = useState(saved?.theme || 'light');
  const [period, setPeriod]   = useState(saved?.period || 'monthly');
  const [currency, setCurrency] = useState(saved?.currency || 'RON');
  const [activeInput, setActiveInput] = useState('gross');
  const [grossRaw, setGrossRaw] = useState(saved?.grossRaw || '5000');
  const [netRaw,   setNetRaw]   = useState(saved?.netRaw   || '');
  const [bonus, setBonus]       = useState(saved?.bonus    || '');
  const [showBonus, setShowBonus] = useState(saved?.showBonus || false);
  const [showEmployer, setShowEmployer] = useState(saved?.showEmployer || false);
  const [copied, setCopied]     = useState(false);
  const [pulseKey, setPulseKey] = useState(0);

  const sym = CURRENCIES.find(c => c.code === currency)?.symbol || '';

  const defaultRates = CURRENCY_PRESETS[currency];
  const [rates, setRates] = useState(saved?.rates || defaultRates);

  // When currency changes, apply preset rates
  useEffect(() => {
    setRates(CURRENCY_PRESETS[currency]);
  }, [currency]);

  // Theme apply
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Calc result
  const result = useMemo(() => {
    if (activeInput === 'gross') {
      return calcFromGross(grossRaw, rates);
    } else {
      return calcFromNet(netRaw, rates);
    }
  }, [grossRaw, netRaw, rates, activeInput]);

  const periodMult = period === 'yearly' ? 12 : 1;
  const r = {
    gross:              result.gross              * periodMult,
    net:                result.net                * periodMult,
    incomeTaxAmt:       result.incomeTaxAmt       * periodMult,
    pensionAmt:         result.pensionAmt         * periodMult,
    healthAmt:          result.healthAmt          * periodMult,
    totalDeductions:    result.totalDeductions    * periodMult,
    totalEmployerCost:  result.totalEmployerCost  * periodMult,
    employerPensionAmt: result.employerPensionAmt * periodMult,
    employerHealthAmt:  result.employerHealthAmt  * periodMult,
  };

  const bonusVal   = parseFloat(bonus) || 0;
  const bonusNet   = bonusVal * (1 - (rates.incomeTax + rates.pension + rates.health) / 100);
  const bonusNetY  = bonusNet * periodMult;

  // Sync displayed values
  useEffect(() => {
    if (activeInput === 'gross') {
      setNetRaw(result.net > 0 ? result.net.toFixed(2) : '');
    } else {
      setGrossRaw(result.gross > 0 ? result.gross.toFixed(2) : '');
    }
    setPulseKey(k => k + 1);
  }, [result, activeInput]);

  // Persist
  useEffect(() => {
    saveState({ theme, period, currency, grossRaw, netRaw, rates, bonus, showBonus, showEmployer });
  }, [theme, period, currency, grossRaw, netRaw, rates, bonus, showBonus, showEmployer]);

  // Parse URL params on load
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('gross')) { setGrossRaw(p.get('gross')); setActiveInput('gross'); }
    if (p.get('currency')) setCurrency(p.get('currency'));
    if (p.get('period'))   setPeriod(p.get('period'));
    if (p.get('it'))   setRates(prev => ({ ...prev, incomeTax: parseFloat(p.get('it')) }));
    if (p.get('pen'))  setRates(prev => ({ ...prev, pension: parseFloat(p.get('pen')) }));
    if (p.get('hlt'))  setRates(prev => ({ ...prev, health: parseFloat(p.get('hlt')) }));
  }, []);

  const handleGrossChange = (v) => { setActiveInput('gross'); setGrossRaw(v); };
  const handleNetChange   = (v) => { setActiveInput('net');   setNetRaw(v);   };

  const handleReset = () => {
    setGrossRaw('5000'); setNetRaw(''); setBonus('');
    setActiveInput('gross');
    setRates(CURRENCY_PRESETS[currency]);
    localStorage.removeItem(LS_KEY);
  };

  const handleShare = () => {
    const base = window.location.href.split('?')[0];
    const params = new URLSearchParams({
      gross: result.gross.toFixed(2),
      currency,
      period,
      it:  rates.incomeTax,
      pen: rates.pension,
      hlt: rates.health,
    });
    const url = `${base}?${params.toString()}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    });
  };

  const handlePrint = () => window.print();

  const donutData = [
    { label: 'Net salary',         value: r.net,            color: 'var(--green)' },
    { label: 'Income tax',         value: r.incomeTaxAmt,   color: 'var(--accent)' },
    { label: 'Pension',            value: r.pensionAmt,     color: 'var(--amber)' },
    { label: 'Health insurance',   value: r.healthAmt,      color: 'var(--purple)' },
  ].filter(d => d.value > 0);

  const COLORS = {
    net:    'var(--green)',
    tax:    'var(--accent)',
    pen:    'var(--amber)',
    health: 'var(--purple)',
  };

  /* ─ Styles ─ */
  const S = {
    page: { minHeight: '100vh', padding: '0 0 60px 0' },
    topbar: {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '16px 24px', background: 'var(--bg-card)',
      borderBottom: '1px solid var(--border)',
      position: 'sticky', top: 0, zIndex: 100,
      backdropFilter: 'blur(10px)',
    },
    logo: { display: 'flex', alignItems: 'center', gap: 10 },
    logoMark: {
      width: 32, height: 32, borderRadius: 8,
      background: 'var(--bg-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    },
    logoText: { fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' },
    topActions: { display: 'flex', alignItems: 'center', gap: 8 },
    iconBtn: {
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      width: 36, height: 36, borderRadius: 8,
      border: '1px solid var(--border)', background: 'var(--bg-card)',
      cursor: 'pointer', color: 'var(--text-secondary)',
      transition: 'all 0.15s ease', fontSize: 15,
    },
    pill: (active) => ({
      padding: '6px 14px', borderRadius: 20,
      fontSize: 13, fontWeight: 500, cursor: 'pointer',
      border: 'none', transition: 'all 0.15s ease',
      background: active ? 'var(--bg-accent)' : 'var(--bg-input)',
      color: active ? 'var(--text-on-dark)' : 'var(--text-secondary)',
    }),
    container: { maxWidth: 1060, margin: '0 auto', padding: '28px 20px' },
    grid: { display: 'grid', gridTemplateColumns: 'minmax(0,1.1fr) minmax(0,0.9fr)', gap: 20, alignItems: 'start' },
    card: {
      background: 'var(--bg-card)',
      borderRadius: 'var(--radius)',
      border: '1px solid var(--border)',
      boxShadow: 'var(--shadow)',
      overflow: 'hidden',
    },
    cardHeader: {
      padding: '16px 20px',
      borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    },
    cardTitle: { fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.06em', textTransform: 'uppercase' },
    cardBody: { padding: '20px' },
    select: {
      background: 'var(--bg-input)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-xs)', padding: '6px 10px',
      fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer',
      outline: 'none', fontFamily: 'var(--font)',
    },
    divider: { height: 1, background: 'var(--border)', margin: '20px 0' },
    bigStat: {
      textAlign: 'center', padding: '24px 0 8px',
    },
    bigNum: (color) => ({
      fontSize: 42, fontWeight: 600, fontFamily: 'var(--mono)',
      color: color, lineHeight: 1, display: 'block', marginBottom: 4,
    }),
    bigLabel: { fontSize: 12, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' },
    toggleRow: {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 0', cursor: 'pointer',
      borderTop: '1px solid var(--border)',
      userSelect: 'none',
    },
    toggleLabel: { fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' },
    chevron: (open) => ({
      fontSize: 10, color: 'var(--text-muted)',
      transform: open ? 'rotate(180deg)' : 'none',
      transition: 'transform 0.2s ease',
    }),
    actionBtn: (variant) => ({
      display: 'flex', alignItems: 'center', gap: 7,
      padding: '9px 16px', borderRadius: 'var(--radius-sm)',
      fontSize: 13, fontWeight: 500, cursor: 'pointer',
      border: '1px solid var(--border)',
      background: variant === 'primary' ? 'var(--bg-accent)' : 'var(--bg-card)',
      color: variant === 'primary' ? 'var(--text-on-dark)' : 'var(--text-secondary)',
      transition: 'all 0.15s ease', flexShrink: 0,
    }),
  };

  return (
    <div style={S.page}>
      {/* Topbar */}
      <div style={S.topbar} className="no-print">
        <div style={S.logo}>
          <img
            src="tahlogo.svg"
            alt="Tudor Halasag"
            style={{ height: 32, width: 'auto', display: 'block' }}
            onError={e => { e.target.style.display = 'none'; }}
          />
          <span style={S.logoText}>SalaryCalc</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button style={S.pill(period === 'monthly')} onClick={() => setPeriod('monthly')}>Monthly</button>
          <button style={S.pill(period === 'yearly')}  onClick={() => setPeriod('yearly')}>Yearly</button>
        </div>

        <div style={S.topActions}>
          <select
            style={S.select}
            value={currency}
            onChange={e => setCurrency(e.target.value)}
          >
            {CURRENCIES.map(c => (
              <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
            ))}
          </select>

          <button style={S.iconBtn} onClick={handleShare} title="Copy share link">
            {copied ? '✓' : '⎘'}
          </button>
          <button style={S.iconBtn} onClick={handlePrint} title="Export PDF">
            ↓
          </button>
          <button style={S.iconBtn} onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')} title="Toggle theme">
            {theme === 'light' ? '◑' : '○'}
          </button>
        </div>
      </div>

      {/* Print header */}
      <div className="print-only" style={{ padding: '20px 40px 0', borderBottom: '2px solid #ccc', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
        <img src="tahlogo.svg" alt="Tudor Halasag" style={{ height: 36, width: 'auto' }} />
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600 }}>Salary Calculation Report</h1>
          <p style={{ color: '#666', fontSize: 14 }}>Generated {new Date().toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' })} · {period === 'monthly' ? 'Monthly' : 'Yearly'} · {currency}</p>
        </div>
      </div>

      <div style={S.container}>
        <div style={S.grid} className="main-grid">

          {/* ── Left column ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Salary inputs */}
            <div style={S.card}>
              <div style={S.cardHeader}>
                <span style={S.cardTitle}>Salary</span>
                <button onClick={handleReset} style={{ fontSize: 12, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 8px' }}>
                  Reset
                </button>
              </div>
              <div style={S.cardBody}>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <SalaryInput
                    label="Gross salary"
                    value={grossRaw}
                    onChange={handleGrossChange}
                    symbol={sym}
                    highlight={activeInput === 'gross'}
                    badge="BEFORE TAX"
                  />
                  <SalaryInput
                    label="Net salary"
                    value={netRaw}
                    onChange={handleNetChange}
                    symbol={sym}
                    highlight={activeInput === 'net'}
                    badge="TAKE HOME"
                  />
                </div>

                <div style={{ ...S.divider, margin: '20px 0 0' }}></div>

                {/* Bonus section */}
                <div style={S.toggleRow} onClick={() => setShowBonus(b => !b)}>
                  <span style={S.toggleLabel}>Bonus / 13th month</span>
                  <span style={S.chevron(showBonus)}>▼</span>
                </div>
                {showBonus && (
                  <div style={{ paddingBottom: 12, animation: 'fadeIn 0.2s ease' }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 14 }}>
                      <div style={{ flex: 1, minWidth: 120 }}>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Bonus amount</label>
                        <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-input)', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                          <span style={{ padding: '10px 12px', fontSize: 13, fontFamily: 'var(--mono)', color: 'var(--text-muted)', borderRight: '1px solid var(--border)', background: 'var(--bg-card)', whiteSpace: 'nowrap', minWidth: 44, textAlign: 'center' }}>{sym}</span>
                          <input type="number" min="0" step="100" value={bonus} onChange={e => setBonus(e.target.value)}
                            style={{ flex: 1, border: 'none', background: 'transparent', padding: '10px 12px', fontSize: 16, fontFamily: 'var(--mono)', color: 'var(--text-primary)', outline: 'none' }}
                            placeholder="0" />
                        </div>
                      </div>
                    </div>
                    {bonusVal > 0 && (
                      <div style={{ display: 'flex', gap: 12 }}>
                        <div style={{ flex: 1, background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)', padding: '12px 14px', border: '1px solid var(--border)' }}>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Gross bonus</div>
                          <div style={{ fontFamily: 'var(--mono)', fontWeight: 600, fontSize: 16, color: 'var(--text-primary)' }}>{fmt(bonusVal * periodMult, sym)}</div>
                        </div>
                        <div style={{ flex: 1, background: 'var(--green-light)', borderRadius: 'var(--radius-sm)', padding: '12px 14px', border: '1px solid var(--border)' }}>
                          <div style={{ fontSize: 11, color: 'var(--green)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Net bonus</div>
                          <div style={{ fontFamily: 'var(--mono)', fontWeight: 600, fontSize: 16, color: 'var(--green)' }}>{fmt(bonusNetY, sym)}</div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Tax config */}
            <div style={S.card}>
              <div style={S.cardHeader}>
                <span style={S.cardTitle}>Employee deductions</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{currency} defaults</span>
              </div>
              <div style={S.cardBody}>
                <LabeledSlider label="Income tax" value={rates.incomeTax}   min={0} max={60} step={0.01} color="var(--accent)" onChange={v => setRates(r => ({...r, incomeTax:v}))} />
                <LabeledSlider label="Pension contribution" value={rates.pension} min={0} max={40} step={0.01} color="var(--amber)" onChange={v => setRates(r => ({...r, pension:v}))} />
                <LabeledSlider label="Health insurance" value={rates.health} min={0} max={25} step={0.01} color="var(--purple)" onChange={v => setRates(r => ({...r, health:v}))} />
              </div>

              {/* Employer cost section */}
              <div style={{ ...S.toggleRow, padding: '10px 20px', cursor: 'pointer' }} onClick={() => setShowEmployer(b => !b)}>
                <span style={S.toggleLabel}>Employer contributions</span>
                <span style={S.chevron(showEmployer)}>▼</span>
              </div>
              {showEmployer && (
                <div style={{ padding: '0 20px 20px', animation: 'fadeIn 0.2s ease' }}>
                  <LabeledSlider label="Employer pension" value={rates.employerPension} min={0} max={30} step={0.01} color="var(--amber)" description="paid by employer" onChange={v => setRates(r => ({...r, employerPension:v}))} />
                  <LabeledSlider label="Employer health / social" value={rates.employerHealth} min={0} max={25} step={0.01} color="var(--purple)" description="paid by employer" onChange={v => setRates(r => ({...r, employerHealth:v}))} />
                </div>
              )}
            </div>
          </div>

          {/* ── Right column ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Summary hero */}
            <div style={{ ...S.card, background: 'var(--bg-accent)', border: 'none' }}>
              <div style={{ padding: '28px 24px' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                  {period === 'monthly' ? 'Monthly' : 'Yearly'} take-home
                </div>
                <div key={`net-${pulseKey}`} style={{ fontSize: 46, fontWeight: 600, fontFamily: 'var(--mono)', color: '#ffffff', lineHeight: 1, marginBottom: 6 }}>
                  {fmt(r.net, sym)}
                </div>
                <div style={{ display: 'flex', gap: 20, marginTop: 16, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Gross</div>
                    <div style={{ fontSize: 15, fontFamily: 'var(--mono)', color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>{fmt(r.gross, sym, true)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Total tax</div>
                    <div style={{ fontSize: 15, fontFamily: 'var(--mono)', color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>{fmt(r.totalDeductions, sym, true)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Effective rate</div>
                    <div style={{ fontSize: 15, fontFamily: 'var(--mono)', color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>{pct(r.totalDeductions, r.gross)}%</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Breakdown */}
            <div style={S.card}>
              <div style={S.cardHeader}>
                <span style={S.cardTitle}>Breakdown</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{period === 'monthly' ? 'per month' : 'per year'}</span>
              </div>
              <div>
                <BreakdownRow label="Net salary"       amount={r.net}          percentage={pct(r.net, r.gross)}          color={COLORS.net}    bg="var(--green-light)"  symbol={sym} />
                <BreakdownRow label="Income tax"       amount={r.incomeTaxAmt} percentage={pct(r.incomeTaxAmt, r.gross)} color={COLORS.tax}    bg="var(--accent-light)" symbol={sym} />
                <BreakdownRow label="Pension"          amount={r.pensionAmt}   percentage={pct(r.pensionAmt, r.gross)}   color={COLORS.pen}    bg="var(--amber-light)"  symbol={sym} />
                <BreakdownRow label="Health insurance" amount={r.healthAmt}    percentage={pct(r.healthAmt, r.gross)}    color={COLORS.health} bg="var(--purple-light)" symbol={sym} />
                <div style={{ height: 12 }}></div>
                <div style={{ padding: '0 16px 16px' }}>
                  <BreakdownRow label="Gross salary" amount={r.gross} percentage="100.0" color="var(--text-secondary)" bg="var(--bg-input)" isTotal symbol={sym} />
                </div>
              </div>
            </div>

            {/* Donut chart */}
            <div style={S.card}>
              <div style={S.cardHeader}>
                <span style={S.cardTitle}>Distribution</span>
              </div>
              <div style={{ padding: '20px', display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: '0 0 auto' }}>
                  <DonutChart data={donutData} symbol={sym} />
                </div>
                <div style={{ flex: 1, minWidth: 120 }}>
                  {donutData.map(d => (
                    <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <div style={{ width: 9, height: 9, borderRadius: 3, background: d.color, flexShrink: 0 }}></div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{d.label}</div>
                        <div style={{ fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 500, color: 'var(--text-primary)' }}>
                          {pct(d.value, r.gross)}%
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Employer cost */}
            {showEmployer && r.gross > 0 && (
              <div style={{ ...S.card, border: '1px solid var(--border)', animation: 'fadeIn 0.3s ease' }}>
                <div style={S.cardHeader}>
                  <span style={S.cardTitle}>Total cost to company</span>
                </div>
                <div style={{ padding: '16px 20px' }}>
                  <BreakdownRow label="Gross salary"         amount={r.gross}               percentage={pct(r.gross, r.totalEmployerCost)}               color={COLORS.net} bg="var(--green-light)" symbol={sym} />
                  <BreakdownRow label="Employer pension"     amount={r.employerPensionAmt}   percentage={pct(r.employerPensionAmt, r.totalEmployerCost)}   color={COLORS.pen} bg="var(--amber-light)" symbol={sym} />
                  <BreakdownRow label="Employer health / social" amount={r.employerHealthAmt} percentage={pct(r.employerHealthAmt, r.totalEmployerCost)}  color={COLORS.health} bg="var(--purple-light)" symbol={sym} />
                  <div style={{ height: 10 }}></div>
                  <div style={{ padding: '12px 16px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-accent)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-on-dark)' }}>Total employer cost</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 17, fontWeight: 600, color: '#ffffff' }}>{fmt(r.totalEmployerCost, sym)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }} className="no-print">
              <button style={S.actionBtn('secondary')} onClick={handleShare}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                {copied ? 'Link copied!' : 'Share link'}
              </button>
              <button style={S.actionBtn('primary')} onClick={handlePrint}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                Export PDF
              </button>
            </div>

          </div>
        </div>
      </div>

      {/* Responsive */}
      <style>{`
        @media (max-width: 700px) {
          .main-grid { grid-template-columns: 1fr !important; }
        }
        button:hover { opacity: 0.85; }
      `}</style>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(React.createElement(App));
