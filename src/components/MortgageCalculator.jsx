// Renders acn-mortgage-calculator — property price + down payment + tenure
// sliders that update the monthly estimate live. Rate is illustrative only.
import { useMemo, useState } from 'react';

function monthlyPMT(principal, annualRatePct, years) {
  if (!(principal > 0) || !(years > 0)) return 0;
  const n = Math.round(years * 12);
  const r = (annualRatePct / 100) / 12;
  if (r === 0) return principal / n;
  const factor = (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  return principal * factor;
}

export default function MortgageCalculator({ payload, onCta }) {
  const defaults = payload?.defaults || {};
  const bounds = payload?.bounds || {};

  const [price, setPrice] = useState(Number(defaults.property_price_cad || 650000));
  const [down, setDown] = useState(Number(defaults.down_payment_cad || 130000));
  const [tenure, setTenure] = useState(Number(defaults.tenure_years || 25));
  const [confirmed, setConfirmed] = useState(false);
  const rate = Number(defaults.interest_rate_pct || 5.14);

  const priceMin = Number(bounds.property_price_min_cad ?? 150000);
  const priceMax = Number(bounds.property_price_max_cad ?? 3000000);
  const downMinPct = Number(bounds.down_payment_min_pct ?? 5);
  const downMaxPct = Number(bounds.down_payment_max_pct ?? 50);
  const tenureMin = Number(bounds.tenure_min_years ?? 15);
  const tenureMax = Number(bounds.tenure_max_years ?? 30);

  const principal = Math.max(price - down, 0);
  const monthly = useMemo(() => monthlyPMT(principal, rate, tenure), [principal, rate, tenure]);
  const downPct = price > 0 ? Math.round((down / price) * 100) : 0;
  const ltvPct = price > 0 ? Math.round((principal / price) * 100) : 0;

  const BRAND = '#0056B3';
  const BRAND_LIGHT = '#E8F0FB';

  const fmtCad = (v) => Number(v).toLocaleString('en-CA', { maximumFractionDigits: 0 });
  const fmtMonthly = (v) => Number(v).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Keep down payment within [minPct, maxPct] of price when price changes.
  const onPriceChange = (v) => {
    const newPrice = Number(v);
    setPrice(newPrice);
    const minDown = newPrice * (downMinPct / 100);
    const maxDown = newPrice * (downMaxPct / 100);
    if (down < minDown) setDown(Math.round(minDown));
    if (down > maxDown) setDown(Math.round(maxDown));
  };

  const send = () => {
    if (!onCta) return;
    setConfirmed(true);
    const base = String(payload?.confirm_cta_value || 'mortgage_calc_confirm');
    const payloadArgs = JSON.stringify({ price, down, tenure });
    onCta(`${base}:${payloadArgs}`);
  };

  const reset = () => setConfirmed(false);

  const sliderStyle = {
    width: '100%',
    accentColor: BRAND,
    cursor: 'pointer',
    height: '4px',
  };

  // ── Confirmed (read-only) view ──────────────────────────────────────────────
  if (confirmed) {
    return (
      <div style={{
        background: '#fff', borderRadius: '16px', border: `1.5px solid ${BRAND}`,
        maxWidth: '360px', width: '100%', boxShadow: '0 2px 16px rgba(0,86,179,0.10)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '14px 18px 10px',
          background: BRAND_LIGHT,
          borderBottom: `1px solid #C9D8F5`,
          display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          <span style={{ fontSize: '15px' }}>✅</span>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: BRAND }}>Numbers confirmed</div>
            <div style={{ fontSize: '11px', color: '#4A6FA5', marginTop: '1px' }}>Provisional estimate · pending specialist review</div>
          </div>
        </div>

        {/* Monthly payment */}
        <div style={{ padding: '18px 18px 12px', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: '#66788A', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '4px' }}>
            Estimated monthly
          </div>
          <div style={{ fontSize: '34px', fontWeight: 800, color: BRAND, lineHeight: 1.1 }}>
            CAD {fmtMonthly(monthly)}
          </div>
          <div style={{ fontSize: '11px', color: '#9AAABD', marginTop: '5px' }}>
            at {rate}% illustrative rate · {tenure}-year amortization
          </div>
        </div>

        {/* Summary grid */}
        <div style={{
          margin: '0 14px 14px',
          background: '#F7F9FC',
          borderRadius: '10px',
          padding: '12px 14px',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '10px 16px',
          fontSize: '12px',
        }}>
          {[
            ['Property price', `CAD ${fmtCad(price)}`],
            ['Down payment', `CAD ${fmtCad(down)} (${downPct}%)`],
            ['Loan amount', `CAD ${fmtCad(principal)}`],
            ['Loan-to-value', `${ltvPct}%`],
            ['Amortization', `${tenure} years`],
            ['Rate', `${rate}%`],
          ].map(([label, val]) => (
            <div key={label}>
              <div style={{ color: '#66788A', marginBottom: '2px' }}>{label}</div>
              <div style={{ fontWeight: 700, color: '#0B1F33' }}>{val}</div>
            </div>
          ))}
        </div>

        {/* Adjust link */}
        <div style={{ padding: '0 18px 16px', textAlign: 'center' }}>
          <button onClick={reset} style={{
            background: 'none', border: 'none', color: BRAND,
            fontSize: '12.5px', fontWeight: 600, cursor: 'pointer',
            textDecoration: 'underline', textUnderlineOffset: '2px',
          }}>
            ← Adjust numbers
          </button>
        </div>
      </div>
    );
  }

  // ── Interactive (slider) view ───────────────────────────────────────────────
  return (
    <div style={{
      background: '#fff', borderRadius: '16px', border: '1px solid #DDE4ED',
      maxWidth: '360px', width: '100%', boxShadow: '0 2px 16px rgba(0,0,0,0.07)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid #EEF1F5' }}>
        <div style={{ fontSize: '14px', fontWeight: 700, color: '#0B1F33' }}>
          {payload?.title || 'Estimate your monthly payment'}
        </div>
        <div style={{ fontSize: '12px', color: '#66788A', marginTop: '3px' }}>
          {payload?.subtitle || 'Provisional — a final approval needs a full review.'}
        </div>
      </div>

      {/* Big monthly number */}
      <div style={{
        padding: '20px 18px 16px', textAlign: 'center',
        background: 'linear-gradient(180deg, #F2F6FB 0%, #FFFFFF 100%)',
        borderBottom: '1px solid #EEF1F5',
      }}>
        <div style={{ fontSize: '11px', color: '#66788A', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '6px' }}>
          Estimated monthly
        </div>
        <div style={{ fontSize: '36px', fontWeight: 800, color: BRAND, lineHeight: 1.1 }}>
          CAD {fmtMonthly(monthly)}
        </div>
        <div style={{ fontSize: '11.5px', color: '#9AAABD', marginTop: '6px' }}>
          at {rate}% illustrative rate · {tenure}-year amortization
        </div>
      </div>

      {/* Sliders */}
      <div style={{ padding: '18px 18px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

        {/* Property price */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', color: '#66788A', fontWeight: 500 }}>Property price</span>
            <span style={{ fontSize: '15px', fontWeight: 700, color: '#0B1F33' }}>CAD {fmtCad(price)}</span>
          </div>
          <input type="range" min={priceMin} max={priceMax} step={5000} value={price}
            onChange={(e) => onPriceChange(Number(e.target.value))} style={sliderStyle} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', color: '#B0BEC5', marginTop: '4px' }}>
            <span>CAD {fmtCad(priceMin)}</span>
            <span>CAD {fmtCad(priceMax)}</span>
          </div>
        </div>

        {/* Down payment */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', color: '#66788A', fontWeight: 500 }}>Down payment <span style={{ color: '#9AAABD' }}>({downPct}%)</span></span>
            <span style={{ fontSize: '15px', fontWeight: 700, color: '#0B1F33' }}>CAD {fmtCad(down)}</span>
          </div>
          <input type="range"
            min={Math.round(price * (downMinPct / 100))}
            max={Math.round(price * (downMaxPct / 100))}
            step={1000} value={down}
            onChange={(e) => setDown(Number(e.target.value))} style={sliderStyle} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', color: '#B0BEC5', marginTop: '4px' }}>
            <span>{downMinPct}% min</span>
            <span>{downMaxPct}% max</span>
          </div>
        </div>

        {/* Amortization */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', color: '#66788A', fontWeight: 500 }}>Amortization</span>
            <span style={{ fontSize: '15px', fontWeight: 700, color: '#0B1F33' }}>{tenure} years</span>
          </div>
          <input type="range" min={tenureMin} max={tenureMax} step={1} value={tenure}
            onChange={(e) => setTenure(Number(e.target.value))} style={sliderStyle} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', color: '#B0BEC5', marginTop: '4px' }}>
            <span>{tenureMin} yrs</span>
            <span>{tenureMax} yrs</span>
          </div>
        </div>
      </div>

      {/* Quick stats row */}
      <div style={{
        margin: '0 18px 16px',
        background: '#F7F9FC',
        borderRadius: '10px',
        padding: '10px 14px',
        display: 'flex',
        justifyContent: 'space-around',
        fontSize: '11.5px',
        gap: '8px',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#66788A', marginBottom: '2px' }}>Loan amount</div>
          <div style={{ fontWeight: 700, color: '#0B1F33' }}>CAD {fmtCad(principal)}</div>
        </div>
        <div style={{ width: '1px', background: '#DDE4ED' }} />
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#66788A', marginBottom: '2px' }}>Loan-to-value</div>
          <div style={{ fontWeight: 700, color: ltvPct > 80 ? '#D97706' : '#0B1F33' }}>{ltvPct}%</div>
        </div>
        <div style={{ width: '1px', background: '#DDE4ED' }} />
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#66788A', marginBottom: '2px' }}>Rate</div>
          <div style={{ fontWeight: 700, color: '#0B1F33' }}>{rate}%</div>
        </div>
      </div>

      {/* Confirm CTA */}
      <div style={{ padding: '0 18px 18px' }}>
        <button
          onClick={send}
          style={{
            width: '100%', padding: '14px', border: 'none', borderRadius: '12px',
            background: BRAND, color: '#fff', fontSize: '14px', fontWeight: 700,
            cursor: 'pointer', letterSpacing: '0.2px',
            boxShadow: '0 2px 8px rgba(0,86,179,0.25)',
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={(e) => e.currentTarget.style.opacity = '0.88'}
          onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
        >
          {payload?.confirm_cta_label || 'Continue with these numbers'}
        </button>
      </div>
    </div>
  );
}
