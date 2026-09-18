// Renders acn-mortgage-calculator — property price + down payment + amortization,
// now with rate type, payment frequency, and the Canadian costs that actually
// land on a buyer: the CMHC default-insurance premium, land transfer tax with
// first-time-buyer rebates, and the cash needed on closing day.
//
// The maths runs locally through mortgageMath.js so the sliders respond
// instantly. That module is a verified port of the CES python engine
// (mortgage_payment_estimate), so this widget and the agent never disagree —
// see mortgageMath.test.mjs.
//
// Worth knowing: fixed rates compound semi-annually in Canada, variable
// monthly, so flipping rate type nudges the payment even at the same nominal
// rate. That is correct, not a bug.
import { useMemo, useState } from 'react';
import {
  paymentEstimate, acceleratedSaving, FREQUENCIES, PROVINCES, PROPERTY_TYPES,
  fmtCad, fmtCad2,
} from './mortgageMath';

const BRAND = '#0056B3';
const BRAND_LIGHT = '#E8F0FB';
const MUTED = '#66788A';
const INK = '#0B1F33';
const AMBER = '#D97706';

// Only the frequencies worth offering in a chat-width widget.
const FREQ_CHOICES = [
  ['monthly', 'Monthly'],
  ['bi_weekly', 'Bi-weekly'],
  ['accelerated_bi_weekly', 'Accel. bi-weekly'],
];

export default function MortgageCalculator({ payload, onCta }) {
  const defaults = payload?.defaults || {};
  const bounds = payload?.bounds || {};
  const rateOptions = Array.isArray(payload?.rate_options) ? payload.rate_options : [];

  const [price, setPrice] = useState(Number(defaults.property_price_cad || 650000));
  const [down, setDown] = useState(Number(defaults.down_payment_cad || 130000));
  const [tenure, setTenure] = useState(Number(defaults.tenure_years || 25));
  const [frequency, setFrequency] = useState(
    FREQUENCIES[defaults.payment_frequency] ? defaults.payment_frequency : 'monthly',
  );
  const [rateType, setRateType] = useState(String(defaults.rate_type || 'fixed').toLowerCase());
  const [rate, setRate] = useState(Number(defaults.interest_rate_pct || 4.09));
  const [selectedRateId, setSelectedRateId] = useState(
    (rateOptions.find((o) => Number(o.rate_pct) === Number(defaults.interest_rate_pct)) || {}).product_id || '',
  );
  const [province, setProvince] = useState(String(defaults.province || 'ON').toUpperCase().slice(0, 2));
  const [city, setCity] = useState(String(defaults.property_city || ''));
  const [propertyType, setPropertyType] = useState(String(defaults.property_type || 'Detached'));
  const [ftb, setFtb] = useState(Boolean(defaults.first_time_buyer));
  const [costsOpen, setCostsOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const priceMin = Number(bounds.property_price_min_cad ?? 150000);
  const priceMax = Number(bounds.property_price_max_cad ?? 3000000);
  const downMinPct = Number(bounds.down_payment_min_pct ?? 5);
  const downMaxPct = Number(bounds.down_payment_max_pct ?? 50);
  const tenureMin = Number(bounds.tenure_min_years ?? 15);
  const tenureMax = Number(bounds.tenure_max_years ?? 30);

  const est = useMemo(() => paymentEstimate({
    price, down, rate, years: tenure, frequency, rateType,
    province, city, propertyType, firstTimeBuyer: ftb,
  }), [price, down, rate, tenure, frequency, rateType, province, city, propertyType, ftb]);

  const prepay = useMemo(() => {
    if (!est || frequency.startsWith('accelerated')) return null;
    return acceleratedSaving(est.totalMortgageCad, rate, tenure, rateType);
  }, [est, rate, tenure, rateType, frequency]);

  const sliderStyle = { width: '100%', accentColor: BRAND, cursor: 'pointer', height: '4px' };
  const labelStyle = { fontSize: '12px', color: MUTED, fontWeight: 500 };
  const valueStyle = { fontSize: '15px', fontWeight: 700, color: INK };

  // Keep the down payment inside [minPct, maxPct] of price when price moves.
  const onPriceChange = (v) => {
    const newPrice = Number(v);
    setPrice(newPrice);
    const minDown = newPrice * (downMinPct / 100);
    const maxDown = newPrice * (downMaxPct / 100);
    if (down < minDown) setDown(Math.round(minDown));
    if (down > maxDown) setDown(Math.round(maxDown));
  };

  const pickRate = (option) => {
    setSelectedRateId(option.product_id);
    setRate(Number(option.rate_pct));
    setRateType(String(option.rate_type || 'fixed').toLowerCase());
  };

  const send = () => {
    if (!onCta || !est) return;
    setConfirmed(true);
    const base = String(payload?.confirm_cta_value || 'mortgage_calc_confirm');
    onCta(`${base}:${JSON.stringify({
      price,
      down,
      tenure,
      rate_type: rateType,
      rate,
      frequency,
      province,
      city,
      ftb,
      property_type: propertyType,
    })}`);
  };

  const cadence = est?.paymentsPerYear === 12 ? 'a month'
    : est?.paymentsPerYear === 26 ? 'every 2 weeks'
      : est?.paymentsPerYear === 52 ? 'a week' : 'per payment';

  // ── Confirmed (read-only) view ──────────────────────────────────────────────
  if (confirmed && est) {
    return (
      <div style={{
        background: '#fff', borderRadius: '16px', border: `1.5px solid ${BRAND}`,
        maxWidth: '380px', width: '100%', boxShadow: '0 2px 16px rgba(0,86,179,0.10)', overflow: 'hidden',
      }}>
        <div style={{
          padding: '14px 18px 10px', background: BRAND_LIGHT, borderBottom: '1px solid #C9D8F5',
          display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          <span style={{ fontSize: '15px' }}>✅</span>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: BRAND }}>Numbers confirmed</div>
            <div style={{ fontSize: '11px', color: '#4A6FA5', marginTop: '1px' }}>
              Provisional estimate · pending specialist review
            </div>
          </div>
        </div>

        <div style={{ padding: '18px 18px 12px', textAlign: 'center' }}>
          <div style={{
            fontSize: '11px', color: MUTED, textTransform: 'uppercase',
            letterSpacing: '0.6px', marginBottom: '4px',
          }}>
            {est.frequencyLabel} payment
          </div>
          <div style={{ fontSize: '34px', fontWeight: 800, color: BRAND, lineHeight: 1.1 }}>
            CAD {fmtCad2(est.paymentPerPeriodCad)}
          </div>
          <div style={{ fontSize: '11px', color: '#9AAABD', marginTop: '5px' }}>
            {rateType} at {rate}% · {tenure}-year amortization
          </div>
        </div>

        <div style={{
          margin: '0 14px 14px', background: '#F7F9FC', borderRadius: '10px', padding: '12px 14px',
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px', fontSize: '12px',
        }}>
          {[
            ['Property price', `CAD ${fmtCad(price)}`],
            ['Down payment', `CAD ${fmtCad(down)} (${est.downPaymentPct}%)`],
            ['Mortgage', `CAD ${fmtCad(est.totalMortgageCad)}`],
            ['Loan-to-value', `${est.loanToValuePct}%`],
            ...(est.insured ? [['Insurance premium', `CAD ${fmtCad(est.cmhcPremiumCad)}`]] : []),
            ['Mortgage-free', est.mortgageFreeDate],
          ].map(([label, val]) => (
            <div key={label}>
              <div style={{ color: MUTED, marginBottom: '2px' }}>{label}</div>
              <div style={{ fontWeight: 700, color: INK }}>{val}</div>
            </div>
          ))}
        </div>

        <div style={{ padding: '0 18px 16px', textAlign: 'center' }}>
          <button onClick={() => setConfirmed(false)} style={{
            background: 'none', border: 'none', color: BRAND, fontSize: '12.5px',
            fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: '2px',
          }}>
            ← Adjust numbers
          </button>
        </div>
      </div>
    );
  }

  // ── Interactive view ────────────────────────────────────────────────────────
  return (
    <div style={{
      background: '#fff', borderRadius: '16px', border: '1px solid #DDE4ED',
      maxWidth: '380px', width: '100%', boxShadow: '0 2px 16px rgba(0,0,0,0.07)', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid #EEF1F5' }}>
        <div style={{ fontSize: '14px', fontWeight: 700, color: INK }}>
          {payload?.title || 'Estimate your payment'}
        </div>
        <div style={{ fontSize: '12px', color: MUTED, marginTop: '3px' }}>
          {payload?.subtitle || 'Provisional — a final approval needs a full review.'}
        </div>
      </div>

      {/* The payment */}
      <div style={{
        padding: '20px 18px 16px', textAlign: 'center',
        background: 'linear-gradient(180deg, #F2F6FB 0%, #FFFFFF 100%)',
        borderBottom: '1px solid #EEF1F5',
      }}>
        <div style={{
          fontSize: '11px', color: MUTED, textTransform: 'uppercase',
          letterSpacing: '0.6px', marginBottom: '6px',
        }}>
          {est?.frequencyLabel || 'Monthly'} payment
        </div>
        <div style={{ fontSize: '36px', fontWeight: 800, color: BRAND, lineHeight: 1.1 }}>
          CAD {fmtCad2(est?.paymentPerPeriodCad)}
        </div>
        <div style={{ fontSize: '11.5px', color: '#9AAABD', marginTop: '6px' }}>
          {cadence} at {rate}% {rateType} · {tenure}-year amortization
        </div>
        {est && est.paymentsPerYear !== 12 && (
          <div style={{ fontSize: '11px', color: MUTED, marginTop: '4px' }}>
            equals CAD {fmtCad2(est.monthlyEquivalentCad)} a month
          </div>
        )}
      </div>

      {/* Rate switcher, when the agent supplied the shelf */}
      {rateOptions.length > 0 && (
        <div style={{ padding: '14px 18px 0' }}>
          <div style={{
            fontSize: '10.5px', color: MUTED, textTransform: 'uppercase',
            letterSpacing: '0.6px', fontWeight: 700, marginBottom: '8px',
          }}>
            Rate
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {rateOptions.map((o) => {
              const on = o.product_id === selectedRateId;
              return (
                <button key={o.product_id} onClick={() => pickRate(o)} style={{
                  padding: '7px 10px', borderRadius: '9px', cursor: 'pointer',
                  border: `1.5px solid ${on ? BRAND : '#E2E6EA'}`,
                  background: on ? BRAND : '#fff', color: on ? '#fff' : INK,
                  fontSize: '11.5px', fontWeight: 600,
                }}>
                  {o.term_years}y {o.rate_type} · {Number(o.rate_pct).toFixed(2)}%
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Sliders */}
      <div style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
            <span style={labelStyle}>Property price</span>
            <span style={valueStyle}>CAD {fmtCad(price)}</span>
          </div>
          <input type="range" min={priceMin} max={priceMax} step={5000} value={price}
            onChange={(e) => onPriceChange(Number(e.target.value))} style={sliderStyle} />
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
            <span style={labelStyle}>
              Down payment <span style={{ color: '#9AAABD' }}>({est?.downPaymentPct ?? 0}%)</span>
            </span>
            <span style={valueStyle}>CAD {fmtCad(down)}</span>
          </div>
          <input type="range"
            min={Math.round(price * (downMinPct / 100))}
            max={Math.round(price * (downMaxPct / 100))}
            step={1000} value={down}
            onChange={(e) => setDown(Number(e.target.value))} style={sliderStyle} />
          {est && !est.meetsMinimumDown && (
            <div style={{
              marginTop: '7px', padding: '8px 10px', background: '#FEF2F6',
              borderRadius: '8px', fontSize: '11px', color: '#B91C1C', lineHeight: 1.45,
            }}>
              The legal minimum here is CAD {fmtCad(est.minimumDownPaymentCad)} —
              5% of the first $500k, then 10%. You are CAD {fmtCad(est.downPaymentShortfallCad)} short.
            </div>
          )}
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
            <span style={labelStyle}>Amortization</span>
            <span style={valueStyle}>{tenure} years</span>
          </div>
          <input type="range" min={tenureMin} max={tenureMax} step={1} value={tenure}
            onChange={(e) => setTenure(Number(e.target.value))} style={sliderStyle} />
          {est && !est.insurable && est.downPaymentPct < 20 && (
            <div style={{
              marginTop: '7px', padding: '8px 10px', background: '#FFFBEB',
              borderRadius: '8px', fontSize: '11px', color: '#92400E', lineHeight: 1.45,
            }}>
              {est.insurableNote}
            </div>
          )}
        </div>

        {/* Payment frequency */}
        <div>
          <div style={{ ...labelStyle, marginBottom: '8px' }}>Payment frequency</div>
          <div style={{ display: 'flex', gap: '6px' }}>
            {FREQ_CHOICES.map(([key, label]) => {
              const on = key === frequency;
              return (
                <button key={key} onClick={() => setFrequency(key)} style={{
                  flex: 1, padding: '9px 4px', borderRadius: '9px', cursor: 'pointer',
                  border: `1.5px solid ${on ? BRAND : '#E2E6EA'}`,
                  background: on ? BRAND : '#fff', color: on ? '#fff' : INK,
                  fontSize: '11px', fontWeight: 600,
                }}>
                  {label}
                </button>
              );
            })}
          </div>
          {prepay && prepay.interestSavedCad > 0 && (
            <div style={{ fontSize: '10.5px', color: '#059669', marginTop: '6px', lineHeight: 1.45 }}>
              Accelerated bi-weekly would save about CAD {fmtCad(prepay.interestSavedCad)} in interest
              and finish {prepay.yearsSooner} years sooner.
            </div>
          )}
        </div>

        {/* Location and type — these drive land transfer tax. */}
        <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr', gap: '8px' }}>
          <label>
            <span style={{ ...labelStyle, display: 'block', marginBottom: '5px' }}>Prov.</span>
            <select value={province} onChange={(e) => setProvince(e.target.value)} style={selectStyle}>
              {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label>
            <span style={{ ...labelStyle, display: 'block', marginBottom: '5px' }}>City</span>
            <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Toronto"
              style={{ ...selectStyle, padding: '9px 8px' }} />
          </label>
          <label>
            <span style={{ ...labelStyle, display: 'block', marginBottom: '5px' }}>Type</span>
            <select value={propertyType} onChange={(e) => setPropertyType(e.target.value)} style={selectStyle}>
              {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: '9px', cursor: 'pointer' }}>
          <input type="checkbox" checked={ftb} onChange={(e) => setFtb(e.target.checked)}
            style={{ accentColor: BRAND, width: '16px', height: '16px', cursor: 'pointer' }} />
          <span style={{ fontSize: '12.5px', color: INK }}>I am a first-time buyer</span>
        </label>
      </div>

      {est && (
        <>
          {/* Quick stats */}
          <div style={{
            margin: '0 18px 14px', background: '#F7F9FC', borderRadius: '10px', padding: '10px 14px',
            display: 'flex', justifyContent: 'space-around', fontSize: '11.5px', gap: '8px',
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: MUTED, marginBottom: '2px' }}>Mortgage</div>
              <div style={{ fontWeight: 700, color: INK }}>CAD {fmtCad(est.totalMortgageCad)}</div>
            </div>
            <div style={{ width: '1px', background: '#DDE4ED' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: MUTED, marginBottom: '2px' }}>Loan-to-value</div>
              <div style={{ fontWeight: 700, color: est.loanToValuePct > 80 ? AMBER : INK }}>
                {est.loanToValuePct}%
              </div>
            </div>
            <div style={{ width: '1px', background: '#DDE4ED' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: MUTED, marginBottom: '2px' }}>Paid off</div>
              <div style={{ fontWeight: 700, color: INK }}>{est.mortgageFreeDate}</div>
            </div>
          </div>

          {/* Insurance premium */}
          {est.insured && (
            <div style={{ margin: '0 18px 14px', padding: '11px 13px', background: '#EFF6FF', borderRadius: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '4px' }}>
                <span style={{
                  fontSize: '9.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px',
                  background: BRAND, color: '#fff', padding: '3px 6px', borderRadius: '4px',
                }}>
                  Insured
                </span>
                <span style={{ fontSize: '11.5px', color: BRAND, fontWeight: 700 }}>
                  {est.cmhcPremiumPct}% premium · CAD {fmtCad(est.cmhcPremiumCad)}
                </span>
              </div>
              <div style={{ fontSize: '11px', color: '#33608F', lineHeight: 1.5 }}>
                Under 20% down, so default insurance is added to the mortgage and you pay interest
                on it for the full term.
                {est.cmhcPremiumPstCad > 0
                  && ` The sales tax on it, CAD ${fmtCad(est.cmhcPremiumPstCad)}, is due in cash at closing.`}
              </div>
            </div>
          )}

          {/* Balance paydown curve */}
          <div style={{ padding: '0 18px 12px' }}>
            <div style={{
              fontSize: '10.5px', color: MUTED, textTransform: 'uppercase',
              letterSpacing: '0.6px', fontWeight: 700, marginBottom: '6px',
            }}>
              What you still owe
            </div>
            <BalanceCurve curve={est.balanceCurve} />
          </div>

          {/* Closing costs */}
          <div style={{ padding: '0 18px 14px' }}>
            <button onClick={() => setCostsOpen((o) => !o)} style={{
              background: 'none', border: 'none', color: BRAND, padding: '4px 0',
              fontSize: '12px', fontWeight: 600, cursor: 'pointer',
            }}>
              {costsOpen ? '▾ Hide closing costs' : `▸ Closing costs · CAD ${fmtCad(est.closingCostsEstimateCad)}`}
            </button>
            {costsOpen && (
              <div style={{
                marginTop: '8px', padding: '12px 13px', background: '#F7F9FC',
                borderRadius: '10px', display: 'grid', gap: '7px', fontSize: '12px',
              }}>
                <Row label="Land transfer tax" value={`CAD ${fmtCad(est.landTransferTaxCad)}`} />
                {est.landTransferTaxRebateCad > 0 && (
                  <Row label="First-time buyer rebate" value={`− CAD ${fmtCad(est.landTransferTaxRebateCad)}`} good />
                )}
                <Row label="Legal, title, appraisal, inspection" value={`CAD ${fmtCad(est.otherClosingCostsCad)}`} />
                {est.cmhcPremiumPstCad > 0 && (
                  <Row label="Sales tax on the insurance premium" value={`CAD ${fmtCad(est.cmhcPremiumPstCad)}`} />
                )}
                <div style={{
                  display: 'flex', justifyContent: 'space-between', paddingTop: '7px',
                  borderTop: '1px solid #DDE4ED', fontWeight: 700, color: INK,
                }}>
                  <span>Cash needed on closing day</span>
                  <span>CAD {fmtCad(est.cashNeededAtClosingCad)}</span>
                </div>
                <div style={{ fontSize: '10.5px', color: '#9AAABD', lineHeight: 1.45 }}>
                  Includes your down payment. {est.landTransferTaxBasis}.
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Confirm */}
      <div style={{ padding: '0 18px 18px' }}>
        <button
          onClick={send}
          disabled={!est}
          style={{
            width: '100%', padding: '14px', border: 'none', borderRadius: '12px',
            background: est ? BRAND : '#C4CEDA', color: '#fff', fontSize: '14px', fontWeight: 700,
            cursor: est ? 'pointer' : 'default', letterSpacing: '0.2px',
            boxShadow: est ? '0 2px 8px rgba(0,86,179,0.25)' : 'none',
          }}
        >
          {payload?.confirm_cta_label || 'Continue with these numbers'}
        </button>
      </div>
    </div>
  );
}

const selectStyle = {
  width: '100%', padding: '9px 6px', borderRadius: '9px',
  border: '1px solid #DDE4ED', background: '#fff', color: '#0B1F33',
  fontSize: '12.5px', fontFamily: 'inherit', cursor: 'pointer',
};

function Row({ label, value, good }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', color: MUTED }}>
      <span>{label}</span>
      <b style={{ color: good ? '#059669' : INK, whiteSpace: 'nowrap' }}>{value}</b>
    </div>
  );
}

// Inline SVG, no chart dependency. Shows the balance falling to zero, which is
// the one chart in a mortgage that feels good to look at.
function BalanceCurve({ curve }) {
  if (!Array.isArray(curve) || curve.length < 2) return null;
  const W = 300;
  const H = 62;
  const PAD = 4;
  const maxBalance = curve[0].balanceCad || 1;
  const maxYear = curve[curve.length - 1].year || 1;

  const x = (yr) => PAD + (yr / maxYear) * (W - PAD * 2);
  const y = (bal) => PAD + (1 - bal / maxBalance) * (H - PAD * 2);

  const line = curve.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.year).toFixed(1)} ${y(p.balanceCad).toFixed(1)}`).join(' ');
  const area = `${line} L ${x(maxYear).toFixed(1)} ${H - PAD} L ${PAD} ${H - PAD} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Mortgage balance over time">
      <path d={area} fill={BRAND} fillOpacity="0.1" />
      <path d={line} fill="none" stroke={BRAND} strokeWidth="2" strokeLinecap="round" />
      <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="#E2E6EA" strokeWidth="1" />
    </svg>
  );
}
