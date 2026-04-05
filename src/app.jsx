const { useState, useEffect, useRef, useMemo } = React;

/* ═══════════════════════════════════════════════════════════════
   ROMANIAN SALARY CALCULATOR 2026
   Exact implementation of the Python reference provided.
   ═══════════════════════════════════════════════════════════════ */
const MIN_WAGE   = 4050;  // Romanian minimum wage 2026
const MAX_DED    = 810;   // maximum personal deduction (gross ≤ 4050)
const MAX_THRESH = MIN_WAGE + 2000; // 6050 — above this, deduction = 0

function personalDeduction(gross) {
  if (gross <= MIN_WAGE)    return MAX_DED;
  if (gross >= MAX_THRESH)  return 0;
  const ratio = (gross - MIN_WAGE) / 2000;
  return MAX_DED * (1 - ratio);
}

function calcRO(grossMonthly, mealVoucherNet = 0) {
  const g = Math.max(0, parseFloat(grossMonthly) || 0);

  /* Step 1 — social contributions are always on FULL gross salary.
     The 300 RON tax-exempt applies as a cash supplement for min-wage workers,
     it does NOT reduce the contribution base. */
  const cas  = 0.25 * g;
  const cass = 0.10 * g;

  /* Step 2 — personal deduction */
  const dp = personalDeduction(g);

  /* Step 3 — taxable income and income tax */
  const taxable    = Math.max(0, g - cas - cass - dp);
  const income_tax = 0.10 * taxable;

  /* Step 4 — net (meal vouchers added after tax, not taxed) */
  const net = g - cas - cass - income_tax + mealVoucherNet;

  /* Step 5 — employer CAM (2.25%) */
  const cam = 0.0225 * g;

  /* Step 6 — min wage extra contributions (employer bears these) */
  let extra_cas = 0, extra_cass = 0;
  if (g > 0 && g < MIN_WAGE) {
    extra_cas  = Math.max(0, 0.25 * MIN_WAGE - cas);
    extra_cass = Math.max(0, 0.10 * MIN_WAGE - cass);
  }

  const total_cost = g + cam + extra_cas + extra_cass;

  return {
    gross: g, net, cas, cass, income_tax, dp,
    contribBase: g, taxable,
    cam, extra_cas, extra_cass, total_cost,
    totalDeductions: cas + cass + income_tax,
    mealVoucherNet,
  };
}

/* Reverse: net → gross (binary search — avoids complex algebraic inversion) */
function grossFromNet(targetNet, mealVoucherNet = 0, tol = 0.01) {
  let lo = 0, hi = targetNet * 10;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const result = calcRO(mid, mealVoucherNet);
    if (result.net < targetNet) lo = mid; else hi = mid;
    if (hi - lo < tol) break;
  }
  return (lo + hi) / 2;
}

/* Custom profile calculation — simple flat rates, no personal deduction logic */
function calcCustom(grossMonthly, rates, mealVoucherNet = 0) {
  const g    = Math.max(0, parseFloat(grossMonthly) || 0);
  const cas  = g * (rates.cas       / 100);
  const cass = g * (rates.cass      / 100);
  const taxable    = Math.max(0, g - cas - cass);
  const income_tax = taxable * (rates.incomeTax / 100);
  const net  = g - cas - cass - income_tax + mealVoucherNet;
  const cam  = 0.0225 * g;
  return {
    gross: g, net, cas, cass, income_tax,
    dp: 0, contribBase: g, taxable,
    cam, extra_cas: 0, extra_cass: 0,
    total_cost: g + cam,
    totalDeductions: cas + cass + income_tax,
    mealVoucherNet,
  };
}

function grossFromNetCustom(targetNet, rates, tol = 0.01) {
  let lo = 0, hi = targetNet * 10;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const result = calcCustom(mid, rates, 0);
    if (result.net < targetNet) lo = mid; else hi = mid;
    if (hi - lo < tol) break;
  }
  return (lo + hi) / 2;
}


const CONVERT_CURRENCIES = [
  { code: 'EUR', label: 'Euro'            },
  { code: 'USD', label: 'US Dollar'       },
  { code: 'GBP', label: 'British Pound'   },
  { code: 'CHF', label: 'Swiss Franc'     },
  { code: 'HUF', label: 'Hungarian Forint'},
];

const PERIOD_MULT   = { weekly: 12/52, monthly: 1, yearly: 12 };
const PERIOD_LABELS = { weekly: 'per week', monthly: 'per month', yearly: 'per year' };

/* Custom tax profile defaults (only used in "Custom profile" mode) */
const CUSTOM_DEFAULTS = { cas: 25, cass: 10, incomeTax: 10 };

const LS_KEY = 'salary-calc-ro-v2';

function loadState() {
  try { const s = localStorage.getItem(LS_KEY); return s ? JSON.parse(s) : null; }
  catch { return null; }
}
function saveState(s) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch {}
}

/* ─── Helpers ───────────────────────────────────────────────── */
function fmt(val, decimals = 2) {
  if (isNaN(val) || !isFinite(val)) return '0.' + '0'.repeat(decimals);
  return val.toLocaleString('ro-RO', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function pct(part, whole) {
  if (!whole || isNaN(whole)) return '0.0';
  return ((part / whole) * 100).toFixed(1);
}

/* ─── Currency fetch — two fallback APIs ─────────────────────── */
async function fetchFXRates() {
  /* Primary: Frankfurter (ECB rates, free, no key) */
  try {
    const res = await fetch(
      'https://api.frankfurter.app/latest?from=RON&to=EUR,USD,GBP,CHF,HUF',
      { signal: AbortSignal.timeout(6000) }
    );
    if (res.ok) {
      const d = await res.json();
      if (d.rates && d.rates.EUR) return { rates: d.rates, source: 'Frankfurter / ECB' };
    }
  } catch {}

  /* Fallback: open.er-api.com (free, no key) */
  try {
    const res = await fetch(
      'https://open.er-api.com/v6/latest/RON',
      { signal: AbortSignal.timeout(6000) }
    );
    if (res.ok) {
      const d = await res.json();
      if (d.rates && d.rates.EUR) {
        return {
          rates: { EUR: d.rates.EUR, USD: d.rates.USD, GBP: d.rates.GBP, CHF: d.rates.CHF, HUF: d.rates.HUF },
          source: 'ExchangeRate-API'
        };
      }
    }
  } catch {}

  return null;
}

/* ─── DonutChart ─────────────────────────────────────────────── */
/* Colours — vibrant in BOTH modes:
   Net    → green
   CAS    → blue
   CASS   → amber/yellow
   IT     → red
*/
const DONUT_COLOURS_LIGHT = ['#16a34a', '#2563eb', '#d97706', '#dc2626'];
const DONUT_COLOURS_DARK  = ['#22c55e', '#5b9bd5', '#fbbf24', '#f87171'];
const LEGEND_LIGHT        = ['#16a34a', '#2563eb', '#d97706', '#dc2626'];
const LEGEND_DARK         = ['#22c55e', '#5b9bd5', '#fbbf24', '#f87171'];

function DonutChart({ data, isDark }) {
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const palette = isDark ? DONUT_COLOURS_DARK : DONUT_COLOURS_LIGHT;

    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }

    chartRef.current = new Chart(canvasRef.current, {
      type: 'doughnut',
      data: {
        labels: data.map(d => d.label),
        datasets: [{
          data: data.map(d => Math.max(0, d.value)),
          backgroundColor: palette.slice(0, data.length),
          borderWidth: 3,
          borderColor: isDark ? 'rgba(18,18,16,0.0)' : 'rgba(255,255,255,0.0)',
          hoverBorderWidth: 4,
          hoverOffset: 10,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        cutout: '70%',
        layout: { padding: 8 },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => {
                const total = data.reduce((a, d) => a + d.value, 0);
                return ` ${fmt(ctx.raw)} RON  (${pct(ctx.raw, total)}%)`;
              }
            },
            backgroundColor: isDark ? '#1c1c1a' : '#0a0a0a',
            titleColor: '#fff', bodyColor: '#ccc',
            padding: 10, cornerRadius: 8, boxPadding: 4,
          }
        },
        animation: { duration: 380, easing: 'easeInOutQuart' },
        /* Prevent clipping on hover */
        clip: false,
      }
    });
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
  }, [data, isDark]);

  return (
    <div style={{ width: '100%', maxWidth: 200, margin: '0 auto', padding: '4px' }}>
      <canvas ref={canvasRef}></canvas>
    </div>
  );
}

/* ─── Editable slider ────────────────────────────────────────── */
function LabeledSlider({ label, value, min, max, step, color, onChange, description }) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState('');
  const fill = clamp01((value - min) / (max - min)) * 100;

  function clamp01(v) { return Math.max(0, Math.min(1, v)); }

  const commit = () => {
    const v = parseFloat(draft);
    if (!isNaN(v)) onChange(Math.max(min, Math.min(max, v)));
    setEditing(false);
  };

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
        <div>
          <span style={{ fontSize:13, fontWeight:500, color:'var(--text-primary)' }}>{label}</span>
          {description && <span style={{ fontSize:11, color:'var(--text-muted)', marginLeft:6 }}>{description}</span>}
        </div>
        {editing ? (
          <input
            type="number" autoFocus value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={e => { if (e.key==='Enter') commit(); if (e.key==='Escape') setEditing(false); }}
            style={{ width:72, fontFamily:'var(--mono)', fontSize:13, fontWeight:500, color,
              background:'var(--bg-input)', border:`1.5px solid ${color}`,
              borderRadius:20, padding:'2px 8px', outline:'none', textAlign:'center' }}
          />
        ) : (
          <span onClick={() => { setDraft(value.toFixed(2)); setEditing(true); }}
            title="Click to type exact value"
            style={{ fontFamily:'var(--mono)', fontSize:13, fontWeight:500, color,
              background:'var(--bg-input)', padding:'2px 10px', borderRadius:20,
              border:'1px solid var(--border)', cursor:'text' }}>
            {value.toFixed(2)}%
          </span>
        )}
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ background:`linear-gradient(to right,${color} 0%,${color} ${fill}%,var(--border) ${fill}%,var(--border) 100%)` }}
      />
      <div style={{ display:'flex', justifyContent:'space-between', marginTop:2 }}>
        <span style={{ fontSize:10, color:'var(--text-muted)' }}>{min}%</span>
        <span style={{ fontSize:10, color:'var(--text-muted)' }}>{max}%</span>
      </div>
    </div>
  );
}

/* ─── SalaryInput ───────────────────────────────────────────── */
function SalaryInput({ label, value, onChange, highlight, badge }) {
  const [focused, setFocused] = useState(false);
  const active = highlight || focused;
  return (
    <div style={{ flex:1, minWidth:0 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:7 }}>
        <label style={{ fontSize:11, fontWeight:600, color:'var(--text-secondary)',
          letterSpacing:'0.06em', textTransform:'uppercase', whiteSpace:'nowrap' }}>{label}</label>
        {badge && (
          <span style={{ fontSize:10, fontWeight:500, padding:'2px 7px', borderRadius:20,
            background:'var(--accent-light)', color:'var(--accent)', letterSpacing:'0.03em',
            flexShrink:0, marginLeft:6 }}>{badge}</span>
        )}
      </div>
      <div style={{
        display:'flex', alignItems:'center', background:'var(--bg-input)',
        border:`1.5px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius:'var(--radius-sm)',
        transition:'border-color 0.14s ease, box-shadow 0.14s ease',
        boxShadow: focused ? 'var(--glow-focus)' : active ? 'var(--glow-idle)' : 'none',
        overflow:'hidden',
      }}>
        <span style={{ padding:'11px 12px', fontSize:13, fontFamily:'var(--mono)',
          color:'var(--text-muted)', borderRight:'1px solid var(--border)',
          background:'var(--bg-card)', whiteSpace:'nowrap', minWidth:48, textAlign:'center' }}>RON</span>
        <input type="number" min="0" step="100" value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="0"
          style={{ flex:1, border:'none', background:'transparent',
            padding:'11px 12px', fontSize:20, fontWeight:500,
            fontFamily:'var(--mono)', color:'var(--text-primary)', outline:'none', width:'100%' }}
        />
      </div>
    </div>
  );
}

/* ─── BreakdownRow ──────────────────────────────────────────── */
function BreakdownRow({ label, amount, percentage, color, isTotal }) {
  return (
    <div style={{
      display:'flex', alignItems:'center', justifyContent:'space-between',
      padding: isTotal ? '11px 16px' : '8px 16px',
      background: isTotal ? 'var(--bg-input)' : 'transparent',
      borderRadius: isTotal ? 'var(--radius-sm)' : 0,
      borderBottom: isTotal ? 'none' : '1px solid var(--border)',
    }}>
      <div style={{ display:'flex', alignItems:'center', gap:9 }}>
        <div style={{ width:9, height:9, borderRadius:2, background:color, flexShrink:0 }}></div>
        <span style={{ fontSize:13, color: isTotal ? 'var(--text-primary)' : 'var(--text-secondary)',
          fontWeight: isTotal ? 600 : 400 }}>{label}</span>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <span style={{ fontSize:11, color:'var(--text-muted)', fontFamily:'var(--mono)', width:38, textAlign:'right' }}>{percentage}%</span>
        <span style={{ fontSize:13, fontWeight: isTotal ? 600 : 500, fontFamily:'var(--mono)',
          color: isTotal ? color : 'var(--text-primary)', minWidth:105, textAlign:'right' }}>
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
      flex:1, padding:'7px 0', borderRadius:6, border:'none',
      fontSize:12, fontWeight:600, cursor:'pointer',
      background: active ? 'var(--bg-accent)' : 'transparent',
      color: active ? 'var(--text-on-dark)' : 'var(--text-secondary)',
      transition:'all 0.14s ease', fontFamily:'var(--font)',
    }}>{label}</button>
  );
}

/* ─── MealVoucherControl ─────────────────────────────────────────
   Uses an UNCONTROLLED local draft for the number input so that
   every keystroke is never interrupted by a React re-render.
   The parent state is updated only on blur / Enter.
   ─────────────────────────────────────────────────────────────── */
function MealVoucherControl({ mealVoucher, setMealVoucher, mealAmount, setMealAmount }) {
  const [draft, setDraft] = useState(String(mealAmount));

  /* Keep draft in sync if parent resets */
  useEffect(() => { setDraft(String(mealAmount)); }, [mealAmount]);

  const commit = () => {
    const v = parseFloat(draft);
    if (!isNaN(v) && v >= 0) setMealAmount(v);
    else setDraft(String(mealAmount));
  };

  return (
    <div style={{ marginBottom:18, padding:'12px 14px', background:'var(--bg-input)',
      borderRadius:'var(--radius-sm)', border:'1px solid var(--border)' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
        marginBottom: mealVoucher ? 10 : 0 }}>
        <div>
          <span style={{ fontSize:13, fontWeight:500, color:'var(--text-primary)' }}>Meal Vouchers</span>
          <span style={{ fontSize:11, color:'var(--text-muted)', marginLeft:6 }}>tax-free</span>
        </div>
        {/* Toggle switch */}
        <div onClick={() => setMealVoucher(v => !v)} style={{
          width:36, height:20, borderRadius:10, position:'relative', cursor:'pointer',
          background: mealVoucher ? 'var(--green)' : 'var(--border-strong)',
          transition:'background 0.2s ease', flexShrink:0,
        }}>
          <div style={{
            position:'absolute', top:2, left: mealVoucher ? 18 : 2,
            width:16, height:16, borderRadius:'50%', background:'#fff',
            transition:'left 0.2s ease', boxShadow:'0 1px 3px rgba(0,0,0,0.25)',
          }} />
        </div>
      </div>

      {mealVoucher && (
        <div style={{ animation:'fadeUp 0.2s ease' }}>
          <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:6 }}>
            Monthly net amount (RON)
          </div>
          <div style={{ display:'flex', alignItems:'center', background:'var(--bg-card)',
            border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', overflow:'hidden' }}>
            <span style={{ padding:'8px 10px', fontSize:12, fontFamily:'var(--mono)',
              color:'var(--text-muted)', borderRight:'1px solid var(--border)',
              minWidth:40, textAlign:'center' }}>RON</span>
            <input
              type="number" min="0" step="50"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={e => { if (e.key === 'Enter') { commit(); e.target.blur(); } }}
              style={{ flex:1, border:'none', background:'transparent', padding:'8px 10px',
                fontSize:14, fontFamily:'var(--mono)', color:'var(--text-primary)', outline:'none' }}
            />
          </div>
          <div style={{ fontSize:10, color:'var(--text-muted)', marginTop:5 }}>
            Added to net after tax — not subject to income tax or contributions
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Icons ─────────────────────────────────────────────────── */
function SunIcon()  { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>; }
function MoonIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/></svg>; }

/* ─── PDF Export ─────────────────────────────────────────────── */
function exportPDF(r, period, fxRates, convertCurrency, mealVoucher, mealAmount) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
  const pw = 210, mg = 18, cw = pw - mg*2;
  let y = 0;

  /* Black header bar */
  doc.setFillColor(10,10,10);
  doc.rect(0, 0, pw, 26, 'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.setTextColor(255,255,255);
  doc.text('Tudor Andrei Halasag', mg, 11);
  doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(170,170,170);
  doc.text('Salary Calculation Report', mg, 18);
  doc.text(new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'}), pw-mg, 18, {align:'right'});
  y = 34;

  /* Period label */
  doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(110,110,110);
  doc.text(`${period.charAt(0).toUpperCase()+period.slice(1)} view  ·  All values in RON  ·  Romanian tax law 2026`, mg, y);
  y += 9;

  /* Hero block */
  doc.setFillColor(242,241,237);
  doc.roundedRect(mg, y, cw, 26, 3, 3, 'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(100,100,100);
  doc.text('MONTHLY TAKE-HOME', mg+6, y+7);
  doc.setFontSize(18); doc.setTextColor(10,10,10);
  doc.text(`${fmt(r.net)} RON`, mg+6, y+19);
  const subs = [['GROSS',`${fmt(r.gross)} RON`],['TOTAL TAX',`${fmt(r.totalDeductions)} RON`],['EFF. RATE',`${pct(r.totalDeductions,r.gross)}%`]];
  subs.forEach(([lbl,val],i) => {
    const sx = mg + cw*0.50 + i*(cw*0.165);
    doc.setFont('helvetica','normal'); doc.setFontSize(6.5); doc.setTextColor(110,110,110);
    doc.text(lbl, sx, y+9);
    doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(10,10,10);
    doc.text(val, sx, y+18);
  });
  y += 34;

  /* Breakdown */
  doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(90,90,90);
  doc.text('BREAKDOWN', mg, y); y += 5;
  const rows = [
    { label:'Net salary',   val:r.net,            pv:pct(r.net,r.gross),            c:[22,101,52]  },
    { label:'CAS (25%)',    val:r.cas,            pv:pct(r.cas,r.gross),            c:[26,82,118]  },
    { label:'CASS (10%)',   val:r.cass,           pv:pct(r.cass,r.gross),           c:[146,64,14]  },
    { label:'Income tax',   val:r.income_tax,     pv:pct(r.income_tax,r.gross),     c:[153,27,27]  },
  ];
  if (mealVoucher && r.mealVoucherNet > 0)
    rows.splice(1,0,{ label:'Meal vouchers', val:r.mealVoucherNet, pv:'—', c:[22,101,52] });
  rows.push({ label:'Gross salary', val:r.gross, pv:'100.0', c:[80,80,80], bold:true });

  rows.forEach((row,i) => {
    const rh = 8.5;
    if (i%2===0) { doc.setFillColor(248,248,246); doc.rect(mg, y, cw, rh, 'F'); }
    doc.setFillColor(...row.c); doc.circle(mg+4, y+rh/2, 1.4, 'F');
    doc.setFont('helvetica', row.bold?'bold':'normal'); doc.setFontSize(8.5); doc.setTextColor(30,30,30);
    doc.text(row.label, mg+9, y+rh/2+1.2);
    doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(120,120,120);
    doc.text(row.pv+'%', pw-mg-58, y+rh/2+1.2, {align:'right'});
    doc.setFont('helvetica',row.bold?'bold':'normal'); doc.setFontSize(8.5); doc.setTextColor(10,10,10);
    doc.text(`${fmt(row.val)} RON`, pw-mg, y+rh/2+1.2, {align:'right'});
    y += rh;
  });
  y += 7;

  /* Tax formula */
  doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(90,90,90);
  doc.text('TAX FORMULA (2026)', mg, y); y += 5;
  const formula = [
    ['Contribution base',`${fmt(r.contribBase)} RON`],
    ['Personal deduction',`${fmt(r.dp)} RON`],
    ['Taxable income',`${fmt(r.taxable)} RON`],
    ['CAS 25%',`${fmt(r.cas)} RON`],
    ['CASS 10%',`${fmt(r.cass)} RON`],
    ['Income tax 10% of taxable',`${fmt(r.income_tax)} RON`],
  ];
  doc.setFont('helvetica','normal'); doc.setFontSize(8.5);
  formula.forEach(([l,v]) => {
    doc.setTextColor(80,80,80); doc.text(l, mg+4, y);
    doc.setTextColor(10,10,10); doc.text(v, pw-mg, y, {align:'right'});
    y += 6.5;
  });
  y += 4;

  /* Currency conversion */
  if (fxRates && convertCurrency !== 'none') {
    const rate = fxRates[convertCurrency];
    if (rate) {
      doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(90,90,90);
      doc.text(`CONVERTED TO ${convertCurrency}`, mg, y); y += 5;
      doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(10,10,10);
      doc.text(`Net: ${fmt(r.net*rate)} ${convertCurrency}   Gross: ${fmt(r.gross*rate)} ${convertCurrency}   Rate: 1 RON = ${rate.toFixed(5)} ${convertCurrency}`, mg+4, y);
      y += 9;
    }
  }

  /* Disclaimer */
  const dy = Math.max(y+6, 262);
  doc.setFillColor(246,246,244);
  doc.rect(mg, dy, cw, 14, 'F');
  doc.setFont('helvetica','italic'); doc.setFontSize(7); doc.setTextColor(130,130,130);
  doc.text('This tool provides estimates only and does not guarantee accuracy or official validity.', mg+4, dy+5.5);
  doc.text('tudor-halasag.github.io/salary-calculator', mg+4, dy+10.5);

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
  const [netRaw,          setNetRaw]          = useState('');
  const [bonus,           setBonus]           = useState(saved?.bonus    || '');
  const [bonusMode,       setBonusMode]       = useState('gross'); // 'gross' | 'net'
  const [showBonus,       setShowBonus]       = useState(false);
  const [showCustom,      setShowCustom]      = useState(false);
  const [customRates,     setCustomRates]     = useState(saved?.customRates || {...CUSTOM_DEFAULTS});
  const [useCustom,       setUseCustom]       = useState(saved?.useCustom || false);
  const [mealVoucher,     setMealVoucher]     = useState(saved?.mealVoucher || false);
  const [mealAmount,      setMealAmount]      = useState(saved?.mealAmount || 600);
  const [convertCurrency, setConvertCurrency] = useState(saved?.convertCurrency || 'EUR');
  const [fxRates,         setFxRates]         = useState(null);
  const [fxSource,        setFxSource]        = useState('');
  const [fxLoading,       setFxLoading]       = useState(true);
  const [fxError,         setFxError]         = useState(false);
  const [copied,          setCopied]          = useState(false);
  const [pulseKey,        setPulseKey]        = useState(0);
  const [mobilePanel,     setMobilePanel]     = useState(false);
  const [panelOpen,       setPanelOpen]       = useState(true);

  const isDark = theme === 'dark';

  /* Apply theme attribute to <html> */
  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); }, [theme]);

  /* Fetch live FX rates on mount */
  useEffect(() => {
    setFxLoading(true); setFxError(false);
    fetchFXRates().then(result => {
      setFxLoading(false);
      if (result) { setFxRates(result.rates); setFxSource(result.source); }
      else setFxError(true);
    });
  }, []);

  /* URL param restore */
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('gross'))  { setGrossRaw(p.get('gross')); setActiveInput('gross'); }
    if (p.get('period')) setPeriod(p.get('period'));
  }, []);

  /* Meal voucher net monthly amount */
  const mvNet = mealVoucher ? (parseFloat(mealAmount) || 0) : 0;

  /* Base monthly calculation — respects custom profile if active */
  const baseResult = useMemo(() => {
    if (useCustom) {
      if (activeInput === 'gross') {
        return calcCustom(parseFloat(grossRaw) || 0, customRates, mvNet);
      } else {
        const targetNet = (parseFloat(netRaw) || 0) - mvNet;
        const grossEst  = grossFromNetCustom(Math.max(0, targetNet), customRates);
        return calcCustom(grossEst, customRates, mvNet);
      }
    }
    if (activeInput === 'gross') {
      return calcRO(parseFloat(grossRaw) || 0, mvNet);
    } else {
      const targetNet = (parseFloat(netRaw) || 0) - mvNet;
      const grossEst  = grossFromNet(Math.max(0, targetNet), 0);
      return calcRO(grossEst, mvNet);
    }
  }, [grossRaw, netRaw, activeInput, mvNet, useCustom, customRates]);

  /* Bonus base result */
  const bonusVal = parseFloat(bonus) || 0;
  const bonusResult = useMemo(() => {
    if (bonusVal <= 0) return null;
    if (useCustom) {
      if (bonusMode === 'gross') return calcCustom(bonusVal, customRates, 0);
      const grossEst = grossFromNetCustom(bonusVal, customRates);
      return calcCustom(grossEst, customRates, 0);
    }
    if (bonusMode === 'gross') return calcRO(bonusVal, 0);
    const grossEst = grossFromNet(bonusVal, 0);
    return calcRO(grossEst, 0);
  }, [bonusVal, bonusMode, useCustom, customRates]);

  /* Period multiplier */
  const mult = PERIOD_MULT[period];
  const r = {
    gross:           baseResult.gross           * mult,
    net:             baseResult.net             * mult,
    cas:             baseResult.cas             * mult,
    cass:            baseResult.cass            * mult,
    income_tax:      baseResult.income_tax      * mult,
    dp:              baseResult.dp              * mult,
    contribBase:     baseResult.contribBase     * mult,
    taxable:         baseResult.taxable         * mult,
    totalDeductions: baseResult.totalDeductions * mult,
    cam:             baseResult.cam             * mult,
    total_cost:      baseResult.total_cost      * mult,
    mealVoucherNet:  baseResult.mealVoucherNet  * mult,
  };

  /* Sync opposite salary field */
  useEffect(() => {
    if (activeInput === 'gross') setNetRaw(baseResult.net   > 0 ? baseResult.net.toFixed(2)   : '');
    else                         setGrossRaw(baseResult.gross > 0 ? baseResult.gross.toFixed(2) : '');
    setPulseKey(k => k+1);
  }, [baseResult, activeInput]);

  /* Persist state */
  useEffect(() => {
    saveState({ theme, period, grossRaw, bonus, customRates, useCustom, mealVoucher, mealAmount, convertCurrency });
  }, [theme, period, grossRaw, bonus, customRates, useCustom, mealVoucher, mealAmount, convertCurrency]);

  const handleGrossChange = v => { setActiveInput('gross'); setGrossRaw(v); };
  const handleNetChange   = v => { setActiveInput('net');   setNetRaw(v);   };

  const handleReset = () => {
    setGrossRaw('5000'); setNetRaw(''); setBonus('');
    setActiveInput('gross'); setMealVoucher(false); setMealAmount(600);
    setCustomRates({...CUSTOM_DEFAULTS}); setUseCustom(false);
    localStorage.removeItem(LS_KEY);
  };

  const handleShare = () => {
    const base = window.location.href.split('?')[0];
    const params = new URLSearchParams({ gross: baseResult.gross.toFixed(2), period });
    navigator.clipboard.writeText(`${base}?${params}`).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2400);
    });
  };

  /* FX conversion */
  const fxRate       = fxRates?.[convertCurrency] ?? null;
  const convertedNet = fxRate ? r.net * fxRate : null;

  /* Donut — fixed colour order: Net(green), CAS(blue), CASS(yellow), IT(red) */
  const donutData = [
    { label: 'Net salary',  value: Math.max(0, r.net),        },
    { label: 'CAS',         value: Math.max(0, r.cas),        },
    { label: 'CASS',        value: Math.max(0, r.cass),       },
    { label: 'Income tax',  value: Math.max(0, r.income_tax), },
  ].filter(d => d.value > 0);

  const legendColours = isDark ? LEGEND_DARK : LEGEND_LIGHT;

  /* ── Shared card style helpers ── */
  const cH = { padding:'13px 18px', borderBottom:'1px solid var(--border)',
    display:'flex', alignItems:'center', justifyContent:'space-between' };
  const cT = { fontSize:11, fontWeight:600, color:'var(--text-secondary)',
    letterSpacing:'0.07em', textTransform:'uppercase' };

  /* ── Settings panel content (desktop + mobile drawer share this) ── */
  const SettingsContent = () => (
    <>
      {/* Period */}
      <div style={{ marginBottom:18 }}>
        <div style={{ fontSize:11, fontWeight:600, color:'var(--text-secondary)',
          letterSpacing:'0.06em', textTransform:'uppercase', marginBottom:8 }}>Pay period</div>
        <div style={{ display:'flex', gap:3, background:'var(--bg-input)',
          borderRadius:8, padding:3, border:'1px solid var(--border)' }}>
          {['weekly','monthly','yearly'].map(p => (
            <PeriodPill key={p} label={p.charAt(0).toUpperCase()+p.slice(1)} active={period===p} onClick={() => setPeriod(p)} />
          ))}
        </div>
      </div>

      {/* Meal vouchers */}
      <MealVoucherControl
        mealVoucher={mealVoucher}
        setMealVoucher={setMealVoucher}
        mealAmount={mealAmount}
        setMealAmount={setMealAmount}
      />

      {/* Custom tax profile */}
      <div style={{ marginBottom:14 }}>
        <div
          onClick={() => setShowCustom(v => !v)}
          style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
            cursor:'pointer', userSelect:'none', padding:'8px 0',
            borderTop:'1px solid var(--border)' }}>
          <div>
            <span style={{ fontSize:13, fontWeight:500, color:'var(--text-primary)' }}>Custom tax profile</span>
            {useCustom && <span style={{ fontSize:10, color:'var(--accent)', marginLeft:8, fontWeight:600 }}>ACTIVE</span>}
          </div>
          <span style={{ fontSize:10, color:'var(--text-muted)', display:'inline-block',
            transform: showCustom ? 'rotate(180deg)' : 'none', transition:'transform 0.2s' }}>▼</span>
        </div>
        {showCustom && (
          <div style={{ paddingTop:10, animation:'fadeUp 0.2s ease' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14,
              padding:'8px 12px', background:'var(--amber-light)',
              borderRadius:'var(--radius-sm)', border:'1px solid var(--border)' }}>
              <input type="checkbox" className="toggle-check" checked={useCustom}
                onChange={e => setUseCustom(e.target.checked)} id="useCustom" />
              <label htmlFor="useCustom" style={{ fontSize:12, color:'var(--text-primary)', cursor:'pointer' }}>
                Use custom rates instead of 2026 Romanian law
              </label>
            </div>
            <LabeledSlider label="CAS (pension)"  value={customRates.cas}       min={0} max={40} step={0.01} color="var(--accent)" onChange={v => setCustomRates(r => ({...r, cas:v}))} />
            <LabeledSlider label="CASS (health)"  value={customRates.cass}      min={0} max={25} step={0.01} color="var(--amber)"  onChange={v => setCustomRates(r => ({...r, cass:v}))} />
            <LabeledSlider label="Income tax"     value={customRates.incomeTax} min={0} max={60} step={0.01} color="var(--red)"   description="flat rate" onChange={v => setCustomRates(r => ({...r, incomeTax:v}))} />
          </div>
        )}
      </div>

      <div style={{ height:1, background:'var(--border)', margin:'4px 0 14px' }}></div>

      {/* Actions */}
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        <button onClick={handleShare} style={{
          display:'flex', alignItems:'center', justifyContent:'center', gap:7,
          padding:'9px 0', borderRadius:'var(--radius-sm)', fontSize:13, fontWeight:500,
          cursor:'pointer', border:'1px solid var(--border)', background:'var(--bg-card)',
          color:'var(--text-secondary)', fontFamily:'var(--font)',
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
          {copied ? '✓ Copied!' : 'Share link'}
        </button>
        <button onClick={() => exportPDF(r, period, fxRates, convertCurrency, mealVoucher, mealAmount)} style={{
          display:'flex', alignItems:'center', justifyContent:'center', gap:7,
          padding:'9px 0', borderRadius:'var(--radius-sm)', fontSize:13, fontWeight:500,
          cursor:'pointer', border:'none', background:'var(--bg-accent)',
          color:'var(--text-on-dark)', fontFamily:'var(--font)',
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
          Export PDF
        </button>
        <button onClick={handleReset} style={{
          padding:'7px 0', borderRadius:'var(--radius-sm)', fontSize:12, fontWeight:500,
          cursor:'pointer', border:'1px solid var(--border)', background:'transparent',
          color:'var(--text-muted)', fontFamily:'var(--font)',
        }}>Reset all</button>
      </div>
    </>
  );

  return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column' }}>

      {/* ══════════ HEADER ══════════ */}
      <header className="no-print glass" style={{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'0 24px', height:72,
        borderRadius:0, borderLeft:'none', borderRight:'none', borderTop:'none',
        position:'sticky', top:0, zIndex:200,
      }}>
        {/* Logo — refreshes current page */}
        <button
          onClick={() => { handleReset(); window.scrollTo({top:0,behavior:'smooth'}); }}
          style={{ background:'none', border:'none', cursor:'pointer', display:'flex', alignItems:'center', padding:0, flexShrink:0 }}
          title="Refresh page">
          <img src="tahlogo.svg" alt="Tudor Andrei Halasag" className="logo-img"
            style={{ width:320, height:'auto', maxHeight:64, objectFit:'contain', display:'block' }} />
        </button>

        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <a href="https://tudor-halasag.github.io" className="btn-about" target="_blank" rel="noopener noreferrer">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
            About me
          </a>
          <button className="icon-btn"
            onClick={() => setTheme(t => t==='light' ? 'dark' : 'light')}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>
            {isDark ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </header>

      {/* ══════════ PAGE TITLE ══════════ */}
      <div className="no-print" style={{ textAlign:'center', padding:'24px 20px 4px' }}>
        <h1 style={{ fontFamily:'var(--serif)', fontSize:'clamp(20px,3.8vw,32px)',
          fontWeight:600, color:'var(--text-primary)',
          textShadow: isDark ? '0 2px 20px rgba(0,0,0,0.7)' : '0 1px 8px rgba(255,255,255,0.5)',
          letterSpacing:'-0.01em', lineHeight:1.2 }}>
          Salary Calculation Report
        </h1>
        <p style={{ fontSize:13, color:'var(--text-secondary)', marginTop:8 }}>
          Real-time gross ⇄ net calculator &middot; All values in RON with real-time currency conversion
        </p>
        <p style={{ fontSize:11, color:'var(--text-muted)', marginTop:5, fontStyle:'italic', fontWeight:300 }}>
          This tool provides estimates only and does not guarantee accuracy or official validity.
        </p>
      </div>

      {/* Mobile settings toggle */}
      <div className="mobile-settings-btn" style={{ display:'none', justifyContent:'center', padding:'10px 20px 0' }}>
        <button onClick={() => setMobilePanel(true)} style={{
          display:'flex', alignItems:'center', gap:7,
          padding:'9px 20px', borderRadius:20,
          border:'1px solid rgba(255,255,255,0.2)', background:'rgba(255,255,255,0.1)',
          color:'#fff', fontSize:13, fontWeight:500, cursor:'pointer',
          fontFamily:'var(--font)', backdropFilter:'blur(8px)',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="14" y2="12"/><line x1="4" y1="18" x2="18" y2="18"/></svg>
          Settings
        </button>
      </div>

      {/* ══════════ MAIN ══════════ */}
      <main style={{ flex:1, maxWidth:1100, width:'100%', margin:'0 auto', padding:'18px 16px 40px' }}>
        <div className="main-grid" style={{ display:'grid', gridTemplateColumns:'272px 1fr', gap:16, alignItems:'start' }}>

          {/* Settings panel */}
          <div className="panel-col" style={{ display:'flex', flexDirection:'column' }}>
            <div className="glass" style={{ padding:'16px' }}>
              <SettingsContent />
            </div>
          </div>

          {/* Results */}
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

            {/* Panel toggle bar + Salary inputs */}
            <div className="glass">
              <div style={{ padding:'12px 18px', borderBottom:'1px solid var(--border)',
                display:'flex', alignItems:'center', gap:10 }}>
                <button onClick={() => setPanelOpen(o => !o)} className="no-print" style={{
                  display:'flex', alignItems:'center', gap:6,
                  padding:'5px 11px', borderRadius:6,
                  border:'1px solid var(--border)', background:'var(--bg-input)',
                  fontSize:12, fontWeight:500, color:'var(--text-secondary)', cursor:'pointer',
                  fontFamily:'var(--font)', whiteSpace:'nowrap',
                }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="14" y2="12"/><line x1="4" y1="18" x2="18" y2="18"/></svg>
                  {panelOpen ? 'Hide settings' : 'Settings'}
                </button>
                <span style={{ fontSize:11, color:'var(--text-muted)' }}>
                  {PERIOD_LABELS[period]} · Romanian tax law 2026{useCustom ? ' · Custom profile active' : ''}
                </span>
              </div>
              <div style={{ padding:'16px 18px' }}>
                <div className="salary-inputs-row" style={{ display:'flex', gap:14 }}>
                  <SalaryInput label="Gross" value={grossRaw} onChange={handleGrossChange} highlight={activeInput==='gross'} badge="BEFORE TAX" />
                  <SalaryInput label="Net"   value={netRaw}   onChange={handleNetChange}   highlight={activeInput==='net'}   badge="TAKE HOME" />
                </div>

                {/* Bonus / 13th month */}
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                  padding:'12px 0 0', marginTop:12, borderTop:'1px solid var(--border)',
                  cursor:'pointer', userSelect:'none' }} onClick={() => setShowBonus(b => !b)}>
                  <span style={{ fontSize:13, fontWeight:500, color:'var(--text-primary)' }}>Bonus / 13th month</span>
                  <span style={{ fontSize:10, color:'var(--text-muted)', display:'inline-block',
                    transform: showBonus ? 'rotate(180deg)' : 'none', transition:'transform 0.2s ease' }}>▼</span>
                </div>
                {showBonus && (
                  <div style={{ paddingTop:10, animation:'fadeUp 0.2s ease' }}>
                    {/* Gross/Net toggle for bonus */}
                    <div style={{ display:'flex', gap:3, marginBottom:10, background:'var(--bg-input)',
                      borderRadius:8, padding:3, border:'1px solid var(--border)', maxWidth:220 }}>
                      {['gross','net'].map(m => (
                        <button key={m} onClick={() => setBonusMode(m)} style={{
                          flex:1, padding:'5px 0', borderRadius:5, border:'none', fontSize:12,
                          fontWeight:600, cursor:'pointer', fontFamily:'var(--font)',
                          background: bonusMode===m ? 'var(--bg-accent)' : 'transparent',
                          color: bonusMode===m ? 'var(--text-on-dark)' : 'var(--text-secondary)',
                          transition:'all 0.13s ease',
                        }}>{m==='gross' ? 'Enter gross' : 'Enter net'}</button>
                      ))}
                    </div>
                    <div style={{ display:'flex', alignItems:'center', background:'var(--bg-input)',
                      border:'1.5px solid var(--border)', borderRadius:'var(--radius-sm)',
                      overflow:'hidden', marginBottom:12 }}>
                      <span style={{ padding:'10px 12px', fontSize:13, fontFamily:'var(--mono)',
                        color:'var(--text-muted)', borderRight:'1px solid var(--border)',
                        background:'var(--bg-card)', minWidth:48, textAlign:'center' }}>RON</span>
                      <input type="number" min="0" step="100" value={bonus}
                        onChange={e => setBonus(e.target.value)}
                        style={{ flex:1, border:'none', background:'transparent', padding:'10px 12px',
                          fontSize:16, fontFamily:'var(--mono)', color:'var(--text-primary)', outline:'none' }}
                        placeholder={bonusMode==='gross' ? 'Gross bonus amount' : 'Net bonus amount'} />
                    </div>
                    {bonusResult && (
                      <div style={{ display:'flex', gap:10 }}>
                        <div style={{ flex:1, background:'var(--bg-input)', borderRadius:'var(--radius-sm)',
                          padding:'10px 14px', border:'1px solid var(--border)' }}>
                          <div style={{ fontSize:10, color:'var(--text-muted)', marginBottom:3,
                            textTransform:'uppercase', letterSpacing:'0.05em' }}>Gross bonus</div>
                          <div style={{ fontFamily:'var(--mono)', fontWeight:600, fontSize:14,
                            color:'var(--text-primary)' }}>{fmt(bonusResult.gross * mult)} RON</div>
                        </div>
                        <div style={{ flex:1, background:'var(--green-light)', borderRadius:'var(--radius-sm)',
                          padding:'10px 14px', border:'1px solid var(--border)' }}>
                          <div style={{ fontSize:10, color:'var(--green)', marginBottom:3,
                            textTransform:'uppercase', letterSpacing:'0.05em' }}>Net bonus</div>
                          <div style={{ fontFamily:'var(--mono)', fontWeight:600, fontSize:14,
                            color:'var(--green)' }}>{fmt(bonusResult.net * mult)} RON</div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Hero take-home */}
            <div className="glass" style={{
              background:'var(--hero-bg)',
              backdropFilter:'blur(16px)', WebkitBackdropFilter:'blur(16px)',
              border:'1px solid var(--hero-border)',
            }}>
              <div style={{ padding:'22px 24px 18px' }}>
                <div style={{ fontSize:11, fontWeight:600, color:'var(--hero-muted)',
                  letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:5 }}>
                  {period.charAt(0).toUpperCase()+period.slice(1)} take-home
                </div>
                <div key={`net-${pulseKey}`} className="pulse-num" style={{
                  fontSize:'clamp(28px,5vw,46px)', fontWeight:600,
                  fontFamily:'var(--mono)', color:'var(--hero-text)', lineHeight:1, marginBottom:14,
                }}>
                  {fmt(r.net)} <span style={{ fontSize:'0.44em', fontWeight:400, opacity:0.65 }}>RON</span>
                </div>
                <div style={{ display:'flex', gap:22, flexWrap:'wrap' }}>
                  {[
                    { label:'Gross',          value:`${fmt(r.gross)} RON` },
                    { label:'Total tax',      value:`${fmt(r.totalDeductions)} RON` },
                    { label:'Effective rate', value:`${pct(r.totalDeductions, r.gross)}%` },
                    ...(mealVoucher && r.mealVoucherNet > 0 ? [{ label:'Meal vouchers', value:`+ ${fmt(r.mealVoucherNet)} RON` }] : []),
                  ].map(item => (
                    <div key={item.label}>
                      <div style={{ fontSize:10, color:'var(--hero-muted)', textTransform:'uppercase',
                        letterSpacing:'0.06em', marginBottom:3 }}>{item.label}</div>
                      <div style={{ fontSize:13, fontFamily:'var(--mono)', color:'var(--hero-sub)', fontWeight:500 }}>{item.value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Currency conversion strip */}
              <div style={{ borderTop:`1px solid var(--hero-border)`, padding:'13px 24px',
                display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}>
                <span style={{ fontSize:11, fontWeight:600, color:'var(--hero-muted)',
                  letterSpacing:'0.06em', textTransform:'uppercase', whiteSpace:'nowrap' }}>Convert to</span>
                <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                  {CONVERT_CURRENCIES.map(c => (
                    <button key={c.code} onClick={() => setConvertCurrency(c.code)} style={{
                      padding:'4px 11px', borderRadius:20, border:'1px solid',
                      borderColor: convertCurrency===c.code ? 'rgba(255,255,255,0.5)' : 'rgba(128,128,128,0.3)',
                      background: convertCurrency===c.code ? 'rgba(255,255,255,0.15)' : 'transparent',
                      color: convertCurrency===c.code ? 'var(--hero-text)' : 'var(--hero-muted)',
                      fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'var(--font)',
                      transition:'all 0.13s ease',
                    }}>{c.code}</button>
                  ))}
                </div>
                <div style={{ marginLeft:'auto', textAlign:'right' }}>
                  {fxLoading && <span style={{ fontSize:12, color:'var(--hero-muted)' }}>Loading live rates…</span>}
                  {fxError   && <span style={{ fontSize:12, color:'rgba(251,191,36,0.85)' }}>Rates unavailable — check connection</span>}
                  {convertedNet !== null && !fxLoading && (
                    <div>
                      <div style={{ fontSize:10, color:'var(--hero-muted)', textTransform:'uppercase',
                        letterSpacing:'0.06em', marginBottom:2 }}>Net in {convertCurrency}</div>
                      <div style={{ fontSize:18, fontFamily:'var(--mono)', fontWeight:600, color:'var(--hero-text)' }}>
                        {fmt(convertedNet)} <span style={{ fontSize:12, opacity:0.65, fontWeight:400 }}>{convertCurrency}</span>
                      </div>
                      <div style={{ fontSize:10, color:'var(--hero-muted)', marginTop:2 }}>
                        1 RON = {fxRate.toFixed(5)} {convertCurrency} · {fxSource}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Breakdown + Donut */}
            <div className="inner-breakdown-grid" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>

              <div className="glass">
                <div style={cH}>
                  <span style={cT}>Breakdown</span>
                  <span style={{ fontSize:11, color:'var(--text-muted)' }}>{PERIOD_LABELS[period]}</span>
                </div>
                <div style={{ overflowX:'auto' }}>
                  <div style={{ minWidth:280 }}>
                    <BreakdownRow label="Net salary"  amount={r.net}        percentage={pct(r.net,r.gross)}        color={legendColours[0]} />
                    <BreakdownRow label="CAS"         amount={r.cas}        percentage={pct(r.cas,r.gross)}        color={legendColours[1]} />
                    <BreakdownRow label="CASS"        amount={r.cass}       percentage={pct(r.cass,r.gross)}       color={legendColours[2]} />
                    <BreakdownRow label="Income tax"  amount={r.income_tax} percentage={pct(r.income_tax,r.gross)} color={legendColours[3]} />
                    {mealVoucher && r.mealVoucherNet > 0 && (
                      <BreakdownRow label="Meal vouchers (+)" amount={r.mealVoucherNet} percentage="—" color={legendColours[0]} />
                    )}
                    <div style={{ height:8 }}></div>
                    <div style={{ padding:'0 12px 12px' }}>
                      <BreakdownRow label="Gross salary" amount={r.gross} percentage="100.0" color="var(--text-secondary)" isTotal />
                    </div>
                  </div>
                </div>
              </div>

              <div className="glass">
                <div style={cH}><span style={cT}>Distribution</span></div>
                <div style={{ padding:'14px 16px' }}>
                  <DonutChart data={donutData} isDark={isDark} />
                  <div style={{ marginTop:12, display:'flex', flexDirection:'column', gap:7 }}>
                    {donutData.map((d,i) => (
                      <div key={d.label} style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                          <div style={{ width:8, height:8, borderRadius:2, background:legendColours[i], flexShrink:0 }}></div>
                          <span style={{ fontSize:12, color:'var(--text-secondary)' }}>{d.label}</span>
                        </div>
                        <span style={{ fontSize:12, fontFamily:'var(--mono)', fontWeight:500, color:'var(--text-primary)' }}>
                          {pct(d.value, r.gross)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Romanian tax formula card */}
            <div className="glass">
              <div style={cH}>
                <span style={cT}>{useCustom ? 'Custom tax profile' : 'Romanian tax formula 2026'}</span>
                <span style={{ fontSize:10, color:'var(--text-muted)' }}>{useCustom ? 'User-defined rates' : 'Law 227/2015 · amended 2026'}</span>
              </div>
              <div className="formula-grid" style={{ padding:'12px 18px', display:'grid',
                gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
                {[
                  { label:'Gross',            val:`${fmt(r.gross)} RON`,        sub:'input',                    col:null },
                  { label:'Contribution base', val:`${fmt(r.contribBase)} RON`,  sub:'equals gross salary', col:null },
                  { label:'Personal deduct.', val:`${fmt(r.dp)} RON`,           sub:'tapers from 4050 to 6050', col:'var(--purple)' },
                  { label:'− CAS 25%',        val:`${fmt(r.cas)} RON`,          sub:`of contrib. base`,         col:'var(--accent)' },
                  { label:'− CASS 10%',       val:`${fmt(r.cass)} RON`,         sub:`of contrib. base`,         col:'var(--amber)'  },
                  { label:'− Income tax 10%', val:`${fmt(r.income_tax)} RON`,   sub:`of taxable ${fmt(r.taxable)} RON`, col:'var(--red)' },
                  { label:'= Net salary',     val:`${fmt(r.net)} RON`,          sub:`${pct(r.net,r.gross)}% of gross`, col:'var(--green)', bold:true },
                  { label:'Employer CAM',     val:`${fmt(r.cam)} RON`,          sub:'2.25% (employer only)',    col:null },
                  { label:'Total cost',       val:`${fmt(r.total_cost)} RON`,   sub:'employer perspective',     col:null },
                ].map((item,i) => (
                  <div key={i} style={{ background:'var(--bg-input)', borderRadius:'var(--radius-sm)',
                    padding:'10px 13px', border:'1px solid var(--border)' }}>
                    <div style={{ fontSize:10, color: item.col || 'var(--text-muted)',
                      textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:3 }}>{item.label}</div>
                    <div style={{ fontFamily:'var(--mono)', fontWeight: item.bold ? 700 : 600,
                      fontSize:14, color: item.col || 'var(--text-primary)' }}>{item.val}</div>
                    <div style={{ fontSize:10, color:'var(--text-muted)', marginTop:2 }}>{item.sub}</div>
                  </div>
                ))}
              </div>
            </div>

          </div>{/* end right col */}
        </div>{/* end grid */}
      </main>

      {/* Mobile drawer */}
      {mobilePanel && (
        <div style={{ position:'fixed', inset:0, zIndex:300,
          background:'rgba(0,0,0,0.62)', backdropFilter:'blur(4px)' }}
          onClick={() => setMobilePanel(false)}>
          <div className="glass" style={{
            position:'absolute', bottom:0, left:0, right:0,
            borderRadius:'16px 16px 0 0', padding:'20px',
            maxHeight:'82vh', overflowY:'auto',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <span style={{ fontSize:14, fontWeight:600, color:'var(--text-primary)' }}>Settings</span>
              <button onClick={() => setMobilePanel(false)}
                style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', fontSize:20 }}>✕</button>
            </div>
            <SettingsContent />
          </div>
        </div>
      )}

      {/* ══════════ FOOTER ══════════ */}
      <footer className="no-print glass" style={{
        borderRadius:0, borderLeft:'none', borderRight:'none', borderBottom:'none',
        padding:'13px 24px',
        display:'flex', alignItems:'center', justifyContent:'center',
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap', justifyContent:'center' }}>
          <span style={{ fontSize:12, color:'var(--text-muted)', whiteSpace:'nowrap' }}>
            &copy; {new Date().getFullYear()} Tudor Andrei Halasag
          </span>
          <span style={{ fontSize:14, color:'var(--text-muted)' }}>·</span>
          {/* Logo — refreshes page */}
          <button onClick={() => { handleReset(); window.scrollTo({top:0,behavior:'smooth'}); }}
            style={{ background:'none', border:'none', cursor:'pointer', display:'flex', alignItems:'center', padding:0 }}
            title="Refresh page">
            <img src="tahlogo.svg" alt="Tudor Andrei Halasag" className="logo-img"
              style={{ height:56, width:'auto', display:'block' }} />
          </button>
          <span style={{ fontSize:14, color:'var(--text-muted)' }}>·</span>
          <span style={{ fontSize:12, color:'var(--text-muted)', fontStyle:'italic', whiteSpace:'nowrap' }}>
            Built to understand your finances
          </span>
        </div>
      </footer>

    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(React.createElement(App));
