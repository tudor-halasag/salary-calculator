const { useState, useEffect, useRef, useMemo } = React;

/* ─── Constants ─────────────────────────────────────────────── */
const CURRENCIES = [
  { code: 'RON', symbol: 'lei', name: 'Romanian Leu' },
  { code: 'EUR', symbol: '€',   name: 'Euro' },
  { code: 'USD', symbol: '$',   name: 'US Dollar' },
  { code: 'GBP', symbol: '£',   name: 'British Pound' },
  { code: 'CHF', symbol: 'Fr',  name: 'Swiss Franc' },
  { code: 'PLN', symbol: 'zł',  name: 'Polish Złoty' },
];

const CURRENCY_PRESETS = {
  RON: { incomeTax: 10,   pension: 25,   health: 10,   employerPension: 4,    employerHealth: 2.25 },
  EUR: { incomeTax: 25,   pension: 10,   health: 7,    employerPension: 15,   employerHealth: 13   },
  USD: { incomeTax: 22,   pension: 6.2,  health: 1.45, employerPension: 6.2,  employerHealth: 1.45 },
  GBP: { incomeTax: 20,   pension: 5,    health: 0,    employerPension: 3,    employerHealth: 13.8 },
  CHF: { incomeTax: 11,   pension: 5.3,  health: 0,    employerPension: 5.3,  employerHealth: 0    },
  PLN: { incomeTax: 12,   pension: 9.76, health: 9,    employerPension: 9.76, employerHealth: 0    },
};

/* period multipliers relative to monthly */
const PERIOD_MULT = { weekly: 12/52, monthly: 1, yearly: 12 };
const PERIOD_LABELS = { weekly: 'per week', monthly: 'per month', yearly: 'per year' };

const LS_KEY = 'salary-calc-v4';

function loadState() {
  try { const s = localStorage.getItem(LS_KEY); return s ? JSON.parse(s) : null; }
  catch { return null; }
}
function saveState(s) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch {}
}

/* ─── Calculation ────────────────────────────────────────────── */
function calcFromGross(gross, rates) {
  const g = parseFloat(gross) || 0;
  const incomeTaxAmt    = g * (rates.incomeTax / 100);
  const pensionAmt      = g * (rates.pension   / 100);
  const healthAmt       = g * (rates.health    / 100);
  const totalDeductions = incomeTaxAmt + pensionAmt + healthAmt;
  const net             = g - totalDeductions;
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
  if (compact && val >= 1000) return `${symbol} ${(val / 1000).toFixed(1)}k`;
  return `${symbol} ${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function pct(part, whole) {
  if (!whole) return '0.0';
  return ((part / whole) * 100).toFixed(1);
}

/* ─── DonutChart ─────────────────────────────────────────────── */
function DonutChart({ data, symbol, isDark }) {
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const lightPalette = ['#1a7a4a','#1a5276','#b45309','#6d28d9'];
    const darkPalette  = ['#34d399','#5b9bd5','#fbbf24','#a78bfa'];
    const palette = isDark ? darkPalette : lightPalette;

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
        responsive: true, maintainAspectRatio: true, cutout: '68%',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => ` ${fmt(ctx.raw, symbol)}  (${pct(ctx.raw, data.reduce((a,d) => a+d.value, 0))}%)`
            },
            backgroundColor: isDark ? '#2e2e2b' : '#0a0a0a',
            titleColor: '#ffffff', bodyColor: '#cccccc',
            padding: 10, cornerRadius: 8,
          }
        },
        animation: { duration: 380, easing: 'easeInOutQuart' }
      }
    });
    return () => { if (chartRef.current) chartRef.current.destroy(); };
  }, [data, symbol, isDark]);

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 200, margin: '0 auto' }}>
      <canvas ref={canvasRef}></canvas>
    </div>
  );
}

/* ─── LabeledSlider ─────────────────────────────────────────── */
function LabeledSlider({ label, value, min, max, step, color, onChange, description }) {
  const fill = ((value - min) / (max - min)) * 100;
  const trackStyle = {
    background: `linear-gradient(to right, ${color} 0%, ${color} ${fill}%, var(--border) ${fill}%, var(--border) 100%)`
  };
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <div>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{label}</span>
          {description && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>{description}</span>}
        </div>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 500, color, background: 'var(--bg)', padding: '2px 8px', borderRadius: 20, border: '1px solid var(--border)' }}>
          {value.toFixed(2)}%
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))} style={trackStyle} />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{min}%</span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{max}%</span>
      </div>
    </div>
  );
}

/* ─── SalaryInput ───────────────────────────────────────────── */
function SalaryInput({ label, value, onChange, symbol, highlight, badge }) {
  const [focused, setFocused] = useState(false);
  const active = highlight || focused;

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          {label}
        </label>
        {badge && (
          <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 7px', borderRadius: 20,
            background: 'var(--accent-light)', color: 'var(--accent)', letterSpacing: '0.03em' }}>
            {badge}
          </span>
        )}
      </div>
      <div style={{
        display: 'flex', alignItems: 'center',
        background: 'var(--bg-input)',
        border: `1.5px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-sm)',
        transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
        boxShadow: focused ? 'var(--glow-focus)' : active ? 'var(--glow-light)' : 'none',
        overflow: 'hidden',
      }}>
        <span style={{ padding: '12px 14px', fontSize: 13, fontFamily: 'var(--mono)',
          color: 'var(--text-muted)', borderRight: '1px solid var(--border)',
          background: 'var(--bg-card)', whiteSpace: 'nowrap', minWidth: 50, textAlign: 'center' }}>
          {symbol}
        </span>
        <input
          type="number" min="0" step="100"
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{ flex: 1, border: 'none', background: 'transparent',
            padding: '12px 14px', fontSize: 22, fontWeight: 500,
            fontFamily: 'var(--mono)', color: 'var(--text-primary)', outline: 'none', width: '100%' }}
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
      padding: isTotal ? '13px 16px' : '10px 16px',
      background: isTotal ? bg : 'transparent',
      borderRadius: isTotal ? 'var(--radius-sm)' : 0,
      borderBottom: isTotal ? 'none' : '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 10, height: 10, borderRadius: 3, background: color, flexShrink: 0 }}></div>
        <span style={{ fontSize: 13, color: isTotal ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: isTotal ? 600 : 400 }}>{label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--mono)', width: 42, textAlign: 'right' }}>{percentage}%</span>
        <span style={{ fontSize: 14, fontWeight: isTotal ? 600 : 500, fontFamily: 'var(--mono)', color: isTotal ? color : 'var(--text-primary)', minWidth: 110, textAlign: 'right' }}>
          {fmt(amount, symbol)}
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
      transition: 'all 0.15s ease',
    }}>{label}</button>
  );
}

/* ─── Main App ──────────────────────────────────────────────── */
function App() {
  const saved = loadState();

  const [theme,        setTheme]        = useState(saved?.theme    || 'light');
  const [period,       setPeriod]       = useState(saved?.period   || 'monthly');
  const [currency,     setCurrency]     = useState(saved?.currency || 'RON');
  const [activeInput,  setActiveInput]  = useState('gross');
  const [grossRaw,     setGrossRaw]     = useState(saved?.grossRaw || '5000');
  const [netRaw,       setNetRaw]       = useState(saved?.netRaw   || '');
  const [bonus,        setBonus]        = useState(saved?.bonus    || '');
  const [showBonus,    setShowBonus]    = useState(saved?.showBonus    || false);
  const [showEmployer, setShowEmployer] = useState(saved?.showEmployer || false);
  const [panelOpen,    setPanelOpen]    = useState(true);
  const [copied,       setCopied]       = useState(false);
  const [pulseKey,     setPulseKey]     = useState(0);

  const isDark = theme === 'dark';
  const sym = CURRENCIES.find(c => c.code === currency)?.symbol || '';

  const [rates, setRates] = useState(saved?.rates || CURRENCY_PRESETS[currency]);

  useEffect(() => { setRates(CURRENCY_PRESETS[currency]); }, [currency]);
  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); }, [theme]);

  /* Parse URL params on load */
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('gross'))    { setGrossRaw(p.get('gross')); setActiveInput('gross'); }
    if (p.get('currency')) setCurrency(p.get('currency'));
    if (p.get('period'))   setPeriod(p.get('period'));
    if (p.get('it'))   setRates(prev => ({ ...prev, incomeTax: parseFloat(p.get('it')) }));
    if (p.get('pen'))  setRates(prev => ({ ...prev, pension:   parseFloat(p.get('pen')) }));
    if (p.get('hlt'))  setRates(prev => ({ ...prev, health:    parseFloat(p.get('hlt')) }));
  }, []);

  /* Base (monthly) calculation */
  const baseResult = useMemo(() => {
    return activeInput === 'gross'
      ? calcFromGross(grossRaw, rates)
      : calcFromNet(netRaw, rates);
  }, [grossRaw, netRaw, rates, activeInput]);

  /* Multiply by period */
  const mult = PERIOD_MULT[period];
  const r = {
    gross:              baseResult.gross              * mult,
    net:                baseResult.net                * mult,
    incomeTaxAmt:       baseResult.incomeTaxAmt       * mult,
    pensionAmt:         baseResult.pensionAmt         * mult,
    healthAmt:          baseResult.healthAmt          * mult,
    totalDeductions:    baseResult.totalDeductions    * mult,
    totalEmployerCost:  baseResult.totalEmployerCost  * mult,
    employerPensionAmt: baseResult.employerPensionAmt * mult,
    employerHealthAmt:  baseResult.employerHealthAmt  * mult,
  };

  const bonusVal  = parseFloat(bonus) || 0;
  const bonusNet  = bonusVal * (1 - (rates.incomeTax + rates.pension + rates.health) / 100) * mult;

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
    saveState({ theme, period, currency, grossRaw, netRaw, rates, bonus, showBonus, showEmployer });
  }, [theme, period, currency, grossRaw, netRaw, rates, bonus, showBonus, showEmployer]);

  const handleGrossChange = v => { setActiveInput('gross'); setGrossRaw(v); };
  const handleNetChange   = v => { setActiveInput('net');   setNetRaw(v);   };

  const handleReset = () => {
    setGrossRaw('5000'); setNetRaw(''); setBonus('');
    setActiveInput('gross');
    setRates(CURRENCY_PRESETS[currency]);
    localStorage.removeItem(LS_KEY);
  };

  const handleShare = () => {
    const base = window.location.href.split('?')[0];
    const params = new URLSearchParams({
      gross: baseResult.gross.toFixed(2),
      currency, period,
      it:  rates.incomeTax,
      pen: rates.pension,
      hlt: rates.health,
    });
    navigator.clipboard.writeText(`${base}?${params}`).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2200);
    });
  };

  const donutData = [
    { label: 'Net salary',       value: r.net,          color: 'var(--green)'  },
    { label: 'Income tax',       value: r.incomeTaxAmt, color: 'var(--accent)' },
    { label: 'Pension',          value: r.pensionAmt,   color: 'var(--amber)'  },
    { label: 'Health insurance', value: r.healthAmt,    color: 'var(--purple)' },
  ].filter(d => d.value > 0);

  const COLORS = { net: 'var(--green)', tax: 'var(--accent)', pen: 'var(--amber)', health: 'var(--purple)' };

  /* ─── card style helper ─── */
  const card = {
    background: 'var(--bg-card)', borderRadius: 'var(--radius)',
    border: '1px solid var(--border)', boxShadow: 'var(--shadow)', overflow: 'hidden',
  };
  const cardHeader = {
    padding: '14px 18px', borderBottom: '1px solid var(--border)',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  };
  const cardTitle = { fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.07em', textTransform: 'uppercase' };

  const toggleRow = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 0', cursor: 'pointer', borderTop: '1px solid var(--border)', userSelect: 'none',
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

      {/* ══════════════════ HEADER ══════════════════ */}
      <header className="no-print" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 28px', height: 60,
        background: 'var(--bg-card)',
        borderBottom: '1px solid var(--border)',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        {/* Left — logo */}
        <a href="https://tudor-halasag.github.io" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <img
            src="tahlogo.svg"
            alt="Tudor Halasag"
            className="logo-img"
            style={{ height: 30, width: 'auto', display: 'block' }}
            onError={e => { e.target.style.display = 'none'; }}
          />
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
            SalaryCalc
          </span>
        </a>

        {/* Right — About me + theme toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <a href="https://tudor-halasag.github.io" className="btn-about" target="_blank" rel="noopener noreferrer">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
            About me
          </a>
          <button
            onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}
            title="Toggle theme"
            style={{
              width: 36, height: 36, borderRadius: 8, border: '1px solid var(--border)',
              background: 'var(--bg-input)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-secondary)', fontSize: 16, transition: 'all 0.15s ease',
            }}>
            {isDark ? '☀' : '◑'}
          </button>
        </div>
      </header>

      {/* ══════════════════ PAGE TITLE ══════════════════ */}
      <div className="no-print" style={{
        textAlign: 'center', padding: '28px 20px 4px',
        background: 'var(--bg)',
      }}>
        <h1 style={{
          fontFamily: 'var(--serif)',
          fontSize: 'clamp(22px, 4vw, 34px)',
          fontWeight: 600,
          color: 'var(--text-primary)',
          letterSpacing: '-0.01em',
          lineHeight: 1.2,
        }}>
          Salary Calculation Report
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>
          Real-time gross ↔ net calculator · All values in {currency} · {PERIOD_LABELS[period]}
        </p>
      </div>

      {/* ══════════════════ PRINT HEADER ══════════════════ */}
      <div className="print-only" style={{ padding: '20px 40px 16px', borderBottom: '2px solid #ccc', marginBottom: 20, alignItems: 'center', gap: 16 }}>
        <img src="tahlogo.svg" alt="Tudor Halasag" style={{ height: 34, width: 'auto' }} />
        <div>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, fontWeight: 600 }}>Salary Calculation Report</h1>
          <p style={{ color: '#666', fontSize: 13, marginTop: 3 }}>
            {new Date().toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' })} · {period.charAt(0).toUpperCase()+period.slice(1)} · {currency}
          </p>
        </div>
      </div>

      {/* ══════════════════ MAIN CONTENT ══════════════════ */}
      <main style={{ flex: 1, maxWidth: 1120, width: '100%', margin: '0 auto', padding: '20px 20px 40px' }}>
        <div className="main-grid" style={{ display: 'grid', gridTemplateColumns: panelOpen ? '300px 1fr' : '0px 1fr', gap: 18, alignItems: 'start', transition: 'grid-template-columns 0.25s ease' }}>

          {/* ══ LEFT — CONTROL PANEL ══ */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, overflow: 'hidden', opacity: panelOpen ? 1 : 0, transition: 'opacity 0.2s ease', minWidth: 0 }}>

            {/* Period + Currency + Theme */}
            <div style={card}>
              <div style={cardHeader}>
                <span style={cardTitle}>Settings</span>
                <button onClick={handleReset} style={{ fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', fontFamily: 'var(--font)' }}>
                  Reset all
                </button>
              </div>
              <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* Period selector */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Pay period</div>
                  <div style={{ display: 'flex', gap: 4, background: 'var(--bg-input)', borderRadius: 8, padding: 3, border: '1px solid var(--border)' }}>
                    {['weekly','monthly','yearly'].map(p => (
                      <PeriodPill key={p} label={p.charAt(0).toUpperCase()+p.slice(1)} active={period===p} onClick={() => setPeriod(p)} />
                    ))}
                  </div>
                </div>

                {/* Currency selector */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Currency</div>
                  <select
                    value={currency}
                    onChange={e => setCurrency(e.target.value)}
                    style={{
                      width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)', padding: '8px 10px',
                      fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer',
                      outline: 'none', fontFamily: 'var(--font)',
                    }}>
                    {CURRENCIES.map(c => (
                      <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Employee tax sliders */}
            <div style={card}>
              <div style={cardHeader}>
                <span style={cardTitle}>Employee deductions</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{currency}</span>
              </div>
              <div style={{ padding: '14px 16px' }}>
                <LabeledSlider label="Income tax"    value={rates.incomeTax} min={0} max={60} step={0.01} color="var(--accent)" onChange={v => setRates(r => ({...r, incomeTax:v}))} />
                <LabeledSlider label="Pension"        value={rates.pension}   min={0} max={40} step={0.01} color="var(--amber)"  onChange={v => setRates(r => ({...r, pension:v}))} />
                <LabeledSlider label="Health"         value={rates.health}    min={0} max={25} step={0.01} color="var(--purple)" onChange={v => setRates(r => ({...r, health:v}))} />
              </div>

              <div style={{ ...toggleRow, padding: '10px 16px', cursor: 'pointer' }} onClick={() => setShowEmployer(b => !b)}>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>Employer contributions</span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', transform: showEmployer ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease', display: 'inline-block' }}>▼</span>
              </div>
              {showEmployer && (
                <div style={{ padding: '0 16px 16px', animation: 'fadeUp 0.2s ease' }}>
                  <LabeledSlider label="Employer pension" value={rates.employerPension} min={0} max={30} step={0.01} color="var(--amber)" description="paid by employer" onChange={v => setRates(r => ({...r, employerPension:v}))} />
                  <LabeledSlider label="Employer health"  value={rates.employerHealth}  min={0} max={25} step={0.01} color="var(--purple)" description="paid by employer" onChange={v => setRates(r => ({...r, employerHealth:v}))} />
                </div>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={handleShare} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                padding: '9px 0', borderRadius: 'var(--radius-sm)',
                fontSize: 13, fontWeight: 500, cursor: 'pointer',
                border: '1px solid var(--border)', background: 'var(--bg-card)',
                color: 'var(--text-secondary)', transition: 'all 0.15s ease',
              }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                {copied ? '✓ Link copied!' : 'Share link'}
              </button>
              <button onClick={() => window.print()} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                padding: '9px 0', borderRadius: 'var(--radius-sm)',
                fontSize: 13, fontWeight: 500, cursor: 'pointer',
                border: 'none', background: 'var(--bg-accent)',
                color: 'var(--text-on-dark)', transition: 'all 0.15s ease',
              }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                Export PDF
              </button>
            </div>
          </div>

          {/* ══ RIGHT — RESULTS ══ */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Panel toggle + salary inputs row */}
            <div style={card}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  onClick={() => setPanelOpen(o => !o)}
                  title={panelOpen ? 'Hide settings' : 'Show settings'}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '5px 11px', borderRadius: 6,
                    border: '1px solid var(--border)', background: 'var(--bg-input)',
                    fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)',
                    cursor: 'pointer', transition: 'all 0.15s ease', whiteSpace: 'nowrap',
                  }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="14" y2="12"/><line x1="4" y1="18" x2="18" y2="18"/></svg>
                  {panelOpen ? 'Hide settings' : 'Settings'}
                </button>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {PERIOD_LABELS[period]} · {currency}
                </span>
              </div>
              <div style={{ padding: '16px 18px' }}>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  <SalaryInput label="Gross salary" value={grossRaw} onChange={handleGrossChange} symbol={sym} highlight={activeInput==='gross'} badge="BEFORE TAX" />
                  <SalaryInput label="Net salary"   value={netRaw}   onChange={handleNetChange}   symbol={sym} highlight={activeInput==='net'}   badge="TAKE HOME" />
                </div>

                {/* Bonus toggle */}
                <div style={{ ...toggleRow, marginTop: 14 }} onClick={() => setShowBonus(b => !b)}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>Bonus / 13th month</span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', transform: showBonus ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease', display: 'inline-block' }}>▼</span>
                </div>
                {showBonus && (
                  <div style={{ paddingBottom: 4, animation: 'fadeUp 0.2s ease' }}>
                    <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-input)', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', marginBottom: 12 }}>
                      <span style={{ padding: '10px 12px', fontSize: 13, fontFamily: 'var(--mono)', color: 'var(--text-muted)', borderRight: '1px solid var(--border)', background: 'var(--bg-card)', minWidth: 50, textAlign: 'center' }}>{sym}</span>
                      <input type="number" min="0" step="100" value={bonus} onChange={e => setBonus(e.target.value)}
                        style={{ flex: 1, border: 'none', background: 'transparent', padding: '10px 12px', fontSize: 16, fontFamily: 'var(--mono)', color: 'var(--text-primary)', outline: 'none' }}
                        placeholder="Bonus amount" />
                    </div>
                    {bonusVal > 0 && (
                      <div style={{ display: 'flex', gap: 12 }}>
                        <div style={{ flex: 1, background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)', padding: '11px 14px', border: '1px solid var(--border)' }}>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Gross bonus</div>
                          <div style={{ fontFamily: 'var(--mono)', fontWeight: 600, fontSize: 15, color: 'var(--text-primary)' }}>{fmt(bonusVal * mult, sym)}</div>
                        </div>
                        <div style={{ flex: 1, background: 'var(--green-light)', borderRadius: 'var(--radius-sm)', padding: '11px 14px', border: '1px solid var(--border)' }}>
                          <div style={{ fontSize: 10, color: 'var(--green)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Net bonus</div>
                          <div style={{ fontFamily: 'var(--mono)', fontWeight: 600, fontSize: 15, color: 'var(--green)' }}>{fmt(bonusNet, sym)}</div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ─ Hero take-home card ─ */}
            <div className="hero-card" style={{
              borderRadius: 'var(--radius)',
              background: 'var(--hero-bg)',
              border: '1px solid var(--border)',
              overflow: 'hidden',
            }}>
              <div style={{ padding: '24px 24px 20px' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--hero-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
                  {period.charAt(0).toUpperCase()+period.slice(1)} take-home
                </div>
                <div key={`net-${pulseKey}`} className="pulse-num" style={{
                  fontSize: 'clamp(34px, 5vw, 48px)', fontWeight: 600,
                  fontFamily: 'var(--mono)', color: 'var(--hero-text)',
                  lineHeight: 1, marginBottom: 16,
                }}>
                  {fmt(r.net, sym)}
                </div>
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                  {[
                    { label: 'Gross',        value: fmt(r.gross, sym, true) },
                    { label: 'Total tax',    value: fmt(r.totalDeductions, sym, true) },
                    { label: 'Effective rate', value: `${pct(r.totalDeductions, r.gross)}%` },
                  ].map(item => (
                    <div key={item.label}>
                      <div style={{ fontSize: 10, color: 'var(--hero-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{item.label}</div>
                      <div style={{ fontSize: 14, fontFamily: 'var(--mono)', color: 'var(--hero-sub)', fontWeight: 500 }}>{item.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ─ Two-column: Breakdown + Chart ─ */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

              {/* Breakdown */}
              <div style={card}>
                <div style={cardHeader}>
                  <span style={cardTitle}>Breakdown</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{PERIOD_LABELS[period]}</span>
                </div>
                <div>
                  <BreakdownRow label="Net salary"       amount={r.net}          percentage={pct(r.net,r.gross)}          color={COLORS.net}    bg="var(--green-light)"  symbol={sym} />
                  <BreakdownRow label="Income tax"       amount={r.incomeTaxAmt} percentage={pct(r.incomeTaxAmt,r.gross)} color={COLORS.tax}    bg="var(--accent-light)" symbol={sym} />
                  <BreakdownRow label="Pension"          amount={r.pensionAmt}   percentage={pct(r.pensionAmt,r.gross)}   color={COLORS.pen}    bg="var(--amber-light)"  symbol={sym} />
                  <BreakdownRow label="Health insurance" amount={r.healthAmt}    percentage={pct(r.healthAmt,r.gross)}    color={COLORS.health} bg="var(--purple-light)" symbol={sym} />
                  <div style={{ height: 10 }}></div>
                  <div style={{ padding: '0 12px 12px' }}>
                    <BreakdownRow label="Gross salary" amount={r.gross} percentage="100.0" color="var(--text-secondary)" bg="var(--bg-input)" isTotal symbol={sym} />
                  </div>
                </div>
              </div>

              {/* Donut chart */}
              <div style={card}>
                <div style={cardHeader}>
                  <span style={cardTitle}>Distribution</span>
                </div>
                <div style={{ padding: '16px' }}>
                  <DonutChart data={donutData} symbol={sym} isDark={isDark} />
                  <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {donutData.map(d => (
                      <div key={d.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <div style={{ width: 8, height: 8, borderRadius: 2, background: d.color, flexShrink: 0 }}></div>
                          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{d.label}</span>
                        </div>
                        <span style={{ fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 500, color: 'var(--text-primary)' }}>
                          {pct(d.value, r.gross)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Employer cost card (conditional) */}
            {showEmployer && r.gross > 0 && (
              <div style={{ ...card, animation: 'fadeUp 0.3s ease' }}>
                <div style={cardHeader}>
                  <span style={cardTitle}>Total cost to company</span>
                </div>
                <div style={{ padding: '0 0 12px' }}>
                  <BreakdownRow label="Gross salary"          amount={r.gross}               percentage={pct(r.gross,r.totalEmployerCost)}               color={COLORS.net}    bg="var(--green-light)"  symbol={sym} />
                  <BreakdownRow label="Employer pension"      amount={r.employerPensionAmt}  percentage={pct(r.employerPensionAmt,r.totalEmployerCost)}  color={COLORS.pen}    bg="var(--amber-light)"  symbol={sym} />
                  <BreakdownRow label="Employer health"       amount={r.employerHealthAmt}   percentage={pct(r.employerHealthAmt,r.totalEmployerCost)}   color={COLORS.health} bg="var(--purple-light)" symbol={sym} />
                  <div style={{ margin: '10px 16px 0' }}>
                    <div style={{ padding: '12px 16px', borderRadius: 'var(--radius-sm)', background: 'var(--hero-bg)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--hero-text)' }}>Total employer cost</span>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 600, color: 'var(--hero-text)' }}>{fmt(r.totalEmployerCost, sym)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>{/* end right column */}
        </div>{/* end grid */}
      </main>

      {/* ══════════════════ FOOTER ══════════════════ */}
      <footer className="no-print" style={{
        borderTop: '1px solid var(--border)',
        background: 'var(--bg-card)',
        padding: '18px 28px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
      }}>
        {/* Logo — refreshes page */}
        <button
          onClick={() => { handleReset(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: 0 }}
          title="Back to top / reset">
          <img
            src="tahlogo.svg"
            alt="Tudor Halasag"
            className="logo-img"
            style={{ height: 24, width: 'auto' }}
            onError={e => { e.target.style.display = 'none'; }}
          />
        </button>

        {/* Tagline */}
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
          Built to understand your finances
        </span>

        {/* Copyright */}
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          © {new Date().getFullYear()} Tudor Halasag
        </span>
      </footer>

    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(React.createElement(App));
