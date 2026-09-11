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

  const BRAND = '#0056B3';

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
    const base = String(payload?.confirm_cta_value || 'mortgage_calc_confirm');
    const payloadArgs = JSON.stringify({ price, down, tenure });
    onCta(`${base}:${payloadArgs}`);
  };

  const sliderStyle = { width: '100%', accentColor: BRAND };
  const rowLabel = { display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: '#66788A', marginBottom: '4px' };
  const rowValue = { fontSize: '14px', fontWeight: 700, color: '#0B1F33' };

  return (
    <div style={{
      background: '#fff', borderRadius: '14px', border: '1px solid #E2E6EA',
      marginBottom: '4px', maxWidth: '86%', boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
    }}>
      {/* Header */}
      <div style={{ padding: '12px 14px 8px', borderBottom: '1px solid #E2E6EA' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: '#0B1F33' }}>
          {payload?.title || 'Estimate your monthly payment'}
        </div>
        <div style={{ fontSize: '11px', color: '#66788A', marginTop: '2px' }}>
          {payload?.subtitle || 'Provisional. A final approval needs a full review.'}
        </div>
      </div>

      {/* Big monthly number */}
      <div style={{
        padding: '14px', textAlign: 'center',
        background: 'linear-gradient(180deg, #F0F5FA 0%, #FFFFFF 100%)',
      }}>
        <div style={{ fontSize: '10.5px', color: '#66788A', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Estimated monthly
        </div>
        <div style={{ fontSize: '30px', fontWeight: 800, color: BRAND, lineHeight: 1.1, marginTop: '4px' }}>
          CAD {fmtMonthly(monthly)}
        </div>
        <div style={{ fontSize: '10.5px', color: '#9AAABD', marginTop: '4px' }}>
          at {rate}% illustrative rate · {tenure}-year amortization
        </div>
      </div>

      {/* Sliders */}
      <div style={{ padding: '12px 14px', display: 'grid', gap: '14px' }}>
        <div>
          <div style={rowLabel}><span>Property price</span><span style={rowValue}>CAD {fmtCad(price)}</span></div>
          <input type="range" min={priceMin} max={priceMax} step={5000} value={price}
            onChange={(e) => onPriceChange(Number(e.target.value))} style={sliderStyle} />
        </div>

        <div>
          <div style={rowLabel}>
            <span>Down payment · {downPct}%</span>
            <span style={rowValue}>CAD {fmtCad(down)}</span>
          </div>
          <input type="range"
            min={Math.round(price * (downMinPct / 100))}
            max={Math.round(price * (downMaxPct / 100))}
            step={1000} value={down}
            onChange={(e) => setDown(Number(e.target.value))} style={sliderStyle} />
        </div>

        <div>
          <div style={rowLabel}><span>Amortization</span><span style={rowValue}>{tenure} years</span></div>
          <input type="range" min={tenureMin} max={tenureMax} step={1} value={tenure}
            onChange={(e) => setTenure(Number(e.target.value))} style={sliderStyle} />
        </div>
      </div>

      {/* Confirm CTA */}
      <div style={{ padding: '4px 14px 14px' }}>
        <button
          onClick={send}
          style={{
            width: '100%', padding: '12px', border: 'none', borderRadius: '10px',
            background: BRAND, color: '#fff', fontSize: '13.5px', fontWeight: 700, cursor: 'pointer',
          }}
        >
          {payload?.confirm_cta_label || 'Continue with these numbers'}
        </button>
      </div>
    </div>
  );
}
