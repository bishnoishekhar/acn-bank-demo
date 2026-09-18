// Renders acn-mortgage-affordability — the income-side calculator.
//
// The mirror of MortgageCalculator: instead of "here is a price, what is the
// payment", this answers "here is my income, what can I buy". The maths is
// the real Canadian thing — bisected against the GDS and TDS caps at the
// stress-test rate, with the CMHC premium folded in — and it runs locally via
// mortgageMath.js so the sliders respond instantly. That module is a verified
// port of the CES python engine, so this widget and the agent never disagree.
//
// Two things are shown that most calculators hide, because they are the two
// things that surprise people:
//   - the qualifying payment they were TESTED on, next to the payment they
//     would actually make;
//   - which cap actually bound, GDS or TDS or the down payment.
import { useMemo, useState } from 'react';
import {
  affordabilityEstimate, PROVINCES, PROPERTY_TYPES,
  GDS_CAP_PCT, TDS_CAP_PCT, fmtCad, fmtCad2,
} from './mortgageMath';

const BRAND = '#0056B3';
const MUTED = '#66788A';
const INK = '#0B1F33';
const GREEN = '#059669';
const AMBER = '#D97706';

export default function MortgageAffordability({ payload, onCta }) {
  const d = payload?.defaults || {};
  const b = payload?.bounds || {};

  const [income, setIncome] = useState(Number(d.gross_annual_income_cad || 110000));
  const [down, setDown] = useState(Number(d.down_payment_cad || 80000));
  const [debts, setDebts] = useState(Number(d.monthly_debt_obligations_cad || 400));
  const [province, setProvince] = useState(String(d.province || 'ON').toUpperCase().slice(0, 2));
  const [city, setCity] = useState(String(d.property_city || ''));
  const [propertyType, setPropertyType] = useState(String(d.property_type || 'Detached'));
  const [ftb, setFtb] = useState(Boolean(d.first_time_buyer));
  const [boostOpen, setBoostOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const rate = Number(d.interest_rate_pct || 4.09);
  const years = Number(d.amortization_years || 25);

  const incomeMin = Number(b.income_min_cad ?? 30000);
  const incomeMax = Number(b.income_max_cad ?? 400000);
  const downMin = Number(b.down_payment_min_cad ?? 5000);
  const downMax = Number(b.down_payment_max_cad ?? 600000);
  const debtsMax = Number(b.monthly_debt_max_cad ?? 4000);

  const result = useMemo(() => affordabilityEstimate({
    income, down, monthlyDebts: debts, rate, years,
    propertyType, province, city, firstTimeBuyer: ftb,
  }), [income, down, debts, rate, years, propertyType, province, city, ftb]);

  const sliderStyle = { width: '100%', accentColor: BRAND, cursor: 'pointer', height: '4px' };
  const labelStyle = { fontSize: '12px', color: MUTED, fontWeight: 500 };
  const valueStyle = { fontSize: '15px', fontWeight: 700, color: INK };

  const send = () => {
    if (!onCta || !result) return;
    setSubmitted(true);
    const base = String(payload?.submit_cta_value || 'mortgage_afford_confirm');
    onCta(`${base}:${JSON.stringify({
      gross_annual_income_cad: income,
      down_payment_cad: down,
      monthly_debt_obligations_cad: debts,
      province,
      property_city: city,
      property_type: propertyType,
      first_time_buyer: ftb,
      amortization_years: years,
      interest_rate_pct: rate,
      max_purchase_price_cad: result.affordable ? result.maxPurchasePriceCad : 0,
      affordable: Boolean(result.affordable),
    })}`);
  };

  const bindingCopy = {
    gds: 'Housing costs are what limit this, not your other debts.',
    tds: 'Your existing monthly payments are what limit this.',
    down_payment: 'The legal minimum down payment is what limits this.',
  }[result?.bindingConstraint] || '';

  return (
    <div style={{
      background: '#fff', borderRadius: '16px', border: `1px solid ${submitted ? BRAND : '#DDE4ED'}`,
      maxWidth: '380px', width: '100%', boxShadow: '0 2px 16px rgba(0,0,0,0.07)', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid #EEF1F5' }}>
        <div style={{ fontSize: '14px', fontWeight: 700, color: INK }}>
          {payload?.title || 'What could you afford?'}
        </div>
        <div style={{ fontSize: '12px', color: MUTED, marginTop: '3px' }}>
          {payload?.subtitle || 'Provisional. A final approval needs a full review.'}
        </div>
      </div>

      {/* Headline result */}
      <div style={{
        padding: '18px 18px 16px', textAlign: 'center',
        background: 'linear-gradient(180deg, #F2F6FB 0%, #FFFFFF 100%)',
        borderBottom: '1px solid #EEF1F5',
      }}>
        {result?.affordable ? (
          <>
            <div style={{
              fontSize: '11px', color: MUTED, textTransform: 'uppercase',
              letterSpacing: '0.6px', marginBottom: '6px',
            }}>
              You may be able to buy up to
            </div>
            <div style={{ fontSize: '34px', fontWeight: 800, color: BRAND, lineHeight: 1.1 }}>
              CAD {fmtCad(result.maxPurchasePriceCad)}
            </div>
            <div style={{ fontSize: '11.5px', color: '#9AAABD', marginTop: '6px' }}>
              about CAD {fmtCad2(result.contractPaymentCad)}/mo at {rate}% over {years} years
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: '15px', fontWeight: 700, color: AMBER, lineHeight: 1.4 }}>
              We could not clear the debt-service caps
            </div>
            <div style={{ fontSize: '12px', color: MUTED, marginTop: '7px', lineHeight: 1.5 }}>
              At this income and these monthly payments there is no price that works yet.
              Lowering the monthly debts is usually the fastest lever.
            </div>
          </>
        )}
      </div>

      {/* Inputs */}
      <div style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
            <span style={labelStyle}>Household income, before tax</span>
            <span style={valueStyle}>CAD {fmtCad(income)}</span>
          </div>
          <input type="range" min={incomeMin} max={incomeMax} step={1000} value={income}
            onChange={(e) => setIncome(Number(e.target.value))} style={sliderStyle} />
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
            <span style={labelStyle}>Down payment saved</span>
            <span style={valueStyle}>CAD {fmtCad(down)}</span>
          </div>
          <input type="range" min={downMin} max={downMax} step={1000} value={down}
            onChange={(e) => setDown(Number(e.target.value))} style={sliderStyle} />
          {result?.affordable && (
            <div style={{ fontSize: '10.5px', color: '#9AAABD', marginTop: '4px' }}>
              {result.downPaymentPct}% of that price · minimum is CAD {fmtCad(result.minimumDownPaymentCad)}
            </div>
          )}
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
            <span style={labelStyle}>Other monthly payments</span>
            <span style={valueStyle}>CAD {fmtCad(debts)}</span>
          </div>
          <input type="range" min={0} max={debtsMax} step={25} value={debts}
            onChange={(e) => setDebts(Number(e.target.value))} style={sliderStyle} />
          <div style={{ fontSize: '10.5px', color: '#9AAABD', marginTop: '4px' }}>
            Cards, loans, leases, child support. Not rent.
          </div>
        </div>

        {/* Location and type */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <label style={{ display: 'block' }}>
            <span style={{ ...labelStyle, display: 'block', marginBottom: '5px' }}>Province</span>
            <select value={province} onChange={(e) => setProvince(e.target.value)} style={selectStyle}>
              {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label style={{ display: 'block' }}>
            <span style={{ ...labelStyle, display: 'block', marginBottom: '5px' }}>Home type</span>
            <select value={propertyType} onChange={(e) => setPropertyType(e.target.value)} style={selectStyle}>
              {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        </div>

        <label style={{ display: 'block' }}>
          <span style={{ ...labelStyle, display: 'block', marginBottom: '5px' }}>City</span>
          <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Toronto"
            style={{ ...selectStyle, padding: '9px 10px' }} />
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: '9px', cursor: 'pointer' }}>
          <input type="checkbox" checked={ftb} onChange={(e) => setFtb(e.target.checked)}
            style={{ accentColor: BRAND, width: '16px', height: '16px', cursor: 'pointer' }} />
          <span style={{ fontSize: '12.5px', color: INK }}>I am a first-time buyer</span>
        </label>
      </div>

      {result?.affordable && (
        <>
          {/* Debt service meters — the two ratios lenders actually test. */}
          <div style={{ padding: '0 18px 14px' }}>
            <div style={{
              fontSize: '10.5px', color: MUTED, textTransform: 'uppercase',
              letterSpacing: '0.6px', fontWeight: 700, marginBottom: '9px',
            }}>
              Debt service at the qualifying rate
            </div>
            <Meter label="Gross debt service" pct={result.gdsPct} cap={GDS_CAP_PCT} />
            <div style={{ height: '8px' }} />
            <Meter label="Total debt service" pct={result.tdsPct} cap={TDS_CAP_PCT} />
            {bindingCopy && (
              <div style={{ fontSize: '11px', color: MUTED, marginTop: '9px', lineHeight: 1.45 }}>
                {bindingCopy}
              </div>
            )}
          </div>

          {/* The stress test, stated plainly. */}
          <div style={{ margin: '0 14px 12px', background: '#FFFBEB', borderRadius: '10px', padding: '11px 13px' }}>
            <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#92400E', marginBottom: '4px' }}>
              You are tested at {result.qualifyingRatePct}%, not {rate}%
            </div>
            <div style={{ fontSize: '11px', color: '#92400E', lineHeight: 1.5 }}>
              Lenders must qualify you at the higher of your rate plus 2% or 5.25%. That is
              CAD {fmtCad2(result.qualifyingPaymentCad)} a month on paper, against
              CAD {fmtCad2(result.contractPaymentCad)} you would actually pay.
            </div>
          </div>

          {/* Monthly cost breakdown */}
          <div style={{
            margin: '0 14px 12px', background: '#F7F9FC', borderRadius: '10px',
            padding: '12px 14px', display: 'grid', gap: '7px', fontSize: '12px',
          }}>
            {[
              ['Mortgage payment', `CAD ${fmtCad2(result.contractPaymentCad)}`],
              ['Property tax', `CAD ${fmtCad2(result.housingCostBreakdown.propertyTaxMonthlyCad)}`],
              ['Heat', `CAD ${fmtCad2(result.housingCostBreakdown.heatMonthlyCad)}`],
              ['Maintenance', `CAD ${fmtCad2(result.housingCostBreakdown.maintenanceMonthlyCad)}`],
              ...(result.housingCostBreakdown.condoFeeMonthlyCad > 0
                ? [['Condo fees', `CAD ${fmtCad2(result.housingCostBreakdown.condoFeeMonthlyCad)}`]]
                : []),
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', color: MUTED }}>
                <span>{k}</span>
                <b style={{ color: INK }}>{v}</b>
              </div>
            ))}
            <div style={{
              display: 'flex', justifyContent: 'space-between', paddingTop: '7px',
              borderTop: '1px solid #DDE4ED', fontWeight: 700, color: INK,
            }}>
              <span>Total each month</span>
              <span>CAD {fmtCad2(result.totalMonthlyHousingCostCad)}</span>
            </div>
          </div>

          {/* Insurance premium, if any. */}
          {result.insured && (
            <div style={{ margin: '0 14px 12px', padding: '11px 13px', background: '#EFF6FF', borderRadius: '10px' }}>
              <div style={{ fontSize: '11.5px', color: BRAND, fontWeight: 700, marginBottom: '3px' }}>
                Insured mortgage · {result.cmhcPremiumPct}% premium
              </div>
              <div style={{ fontSize: '11px', color: '#33608F', lineHeight: 1.5 }}>
                Under 20% down, so CAD {fmtCad(result.cmhcPremiumCad)} of default insurance is added to
                the mortgage. Another CAD {fmtCad(result.downPaymentGapTo20PctCad)} saved would remove it.
              </div>
            </div>
          )}

          {/* FHSA / HBP booster */}
          {result.fhsaHbpBoost?.eligible && result.fhsaHbpBoost.priceUpliftCad > 0 && (
            <div style={{ padding: '0 18px 14px' }}>
              <button onClick={() => setBoostOpen((o) => !o)} style={{
                background: 'none', border: 'none', color: BRAND, padding: '4px 0',
                fontSize: '12px', fontWeight: 600, cursor: 'pointer',
              }}>
                {boostOpen ? '▾ Hide the first-home accounts' : '▸ Could first-home accounts help?'}
              </button>
              {boostOpen && (
                <div style={{
                  marginTop: '8px', padding: '12px 13px', background: '#ECFDF5',
                  borderRadius: '10px', fontSize: '11.5px', color: '#065F46', lineHeight: 1.55,
                }}>
                  An FHSA takes CAD {fmtCad(result.fhsaHbpBoost.fhsaAnnualLimitCad)} a year up to
                  CAD {fmtCad(result.fhsaHbpBoost.fhsaLifetimeLimitCad)}, and the Home Buyers&apos; Plan lets
                  you draw up to CAD {fmtCad(result.fhsaHbpBoost.hbpWithdrawalLimitCad)} from an RRSP.
                  With the full CAD {fmtCad(result.fhsaHbpBoost.potentialExtraDownCad)} you could look at
                  homes up to{' '}
                  <b>CAD {fmtCad(result.fhsaHbpBoost.boostedMaxPurchasePriceCad)}</b>
                  {' '}— about CAD {fmtCad(result.fhsaHbpBoost.priceUpliftCad)} more.
                  <div style={{ marginTop: '6px', fontSize: '10.5px', color: '#047857' }}>
                    Assumes both limits are available. The HBP has to be repaid.
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* CTA */}
      <div style={{ padding: '0 18px 18px' }}>
        <button
          onClick={submitted ? undefined : send}
          disabled={submitted || !result}
          style={{
            width: '100%', padding: '14px', border: 'none', borderRadius: '12px',
            background: submitted ? '#E6F2F5' : (result ? BRAND : '#C4CEDA'),
            color: submitted ? BRAND : '#fff',
            fontSize: '14px', fontWeight: 700,
            cursor: submitted || !result ? 'default' : 'pointer', letterSpacing: '0.2px',
            boxShadow: submitted || !result ? 'none' : '0 2px 8px rgba(0,86,179,0.25)',
          }}
        >
          {submitted
            ? (result?.affordable ? `✓ Using CAD ${fmtCad(result.maxPurchasePriceCad)}` : '✓ Noted')
            : (payload?.submit_cta_label || 'Continue with this budget')}
        </button>
      </div>
    </div>
  );
}

const selectStyle = {
  width: '100%', padding: '9px 8px', borderRadius: '9px',
  border: '1px solid #DDE4ED', background: '#fff', color: '#0B1F33',
  fontSize: '13px', fontFamily: 'inherit', cursor: 'pointer',
};

// A ratio bar with the cap marked. Amber once it is within a point of the cap,
// because that is the point at which more borrowing stops being available.
function Meter({ label, pct, cap }) {
  const filled = Math.min((pct / cap) * 100, 100);
  const atCap = pct >= cap - 1;
  const color = atCap ? AMBER : GREEN;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', marginBottom: '4px' }}>
        <span style={{ color: MUTED }}>{label}</span>
        <span style={{ color, fontWeight: 700 }}>{pct}% <span style={{ color: '#9AAABD', fontWeight: 400 }}>of {cap}%</span></span>
      </div>
      <div style={{ height: '6px', background: '#EEF1F5', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ width: `${filled}%`, height: '100%', background: color, borderRadius: '3px', transition: 'width 0.15s' }} />
      </div>
    </div>
  );
}
