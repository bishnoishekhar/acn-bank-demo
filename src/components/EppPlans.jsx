// Renders acn-epp-plans — the tenure chooser. The chip is the whole point:
// tenure_months + monthly_amount is the headline. total_repayable and
// interest_rate live behind a "Plan details" expander only.
import { useState } from 'react';

export default function EppPlans({ payload, onCta }) {
  const plans = payload?.plans || [];
  const [selectedIdx, setSelectedIdx] = useState(() => {
    const recIdx = plans.findIndex((p) => p.recommended);
    return recIdx >= 0 ? recIdx : Math.max(0, plans.length - 1);
  });
  const [detailsOpen, setDetailsOpen] = useState(false);

  const BRAND = '#0056B3';

  const fmt = (amount) => {
    const n = Number(amount);
    if (Number.isNaN(n)) return String(amount ?? '');
    return n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const chosen = plans[selectedIdx] || {};
  const confirmValue = String(payload?.confirm_cta_value || 'epp_plan_confirm')
    .replace('{tenure}', String(chosen.tenure_months || ''));

  const send = (v) => v && onCta && onCta(v);

  return (
    <div style={{
      background: '#fff', borderRadius: '14px', border: '1px solid #E2E6EA',
      marginBottom: '4px', maxWidth: '86%', boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
    }}>
      {/* Product header */}
      <div style={{ display: 'flex', gap: '12px', padding: '12px 14px', borderBottom: '1px solid #E2E6EA', alignItems: 'center' }}>
        {payload?.product_image_url && (
          <div style={{ width: '48px', height: '48px', borderRadius: '10px', overflow: 'hidden', background: '#F0F5FA' }}>
            <img src={payload.product_image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0B1F33' }}>
            {payload?.product_name || 'Choose your plan'}
          </div>
          {payload?.retail_price_cad != null && (
            <div style={{ fontSize: '11px', color: '#9AAABD', marginTop: '2px' }}>
              CAD {fmt(payload.retail_price_cad)}
            </div>
          )}
        </div>
      </div>

      {/* Tenure chips */}
      <div style={{ padding: '12px 14px 8px' }}>
        <div style={{ fontSize: '11px', color: '#66788A', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
          Pick your pace
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${plans.length}, 1fr)`, gap: '8px' }}>
          {plans.map((plan, i) => {
            const selected = i === selectedIdx;
            return (
              <button
                key={plan.tenure_months || i}
                onClick={() => setSelectedIdx(i)}
                style={{
                  padding: '10px 6px', textAlign: 'center', cursor: 'pointer',
                  background: selected ? BRAND : '#fff',
                  color: selected ? '#fff' : '#0B1F33',
                  border: `1px solid ${selected ? BRAND : '#E2E6EA'}`,
                  borderRadius: '10px',
                }}
              >
                <div style={{ fontSize: '10.5px', opacity: 0.85, marginBottom: '3px' }}>
                  {plan.tenure_months} months
                </div>
                <div style={{ fontSize: '17px', fontWeight: 800, lineHeight: 1.1 }}>
                  ${fmt(plan.monthly_amount_cad)}
                </div>
                <div style={{ fontSize: '9.5px', opacity: 0.8, marginTop: '2px' }}>/mo</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Plan details — collapsed. Interest & totals only live here. */}
      <div style={{ padding: '0 14px 8px' }}>
        <button
          onClick={() => setDetailsOpen((o) => !o)}
          style={{
            background: 'none', border: 'none', color: '#66788A',
            fontSize: '11px', padding: '4px 0', cursor: 'pointer',
          }}
        >
          {detailsOpen ? '▾ Hide plan details' : '▸ Plan details'}
        </button>
        {detailsOpen && (
          <div style={{
            marginTop: '4px', padding: '10px 12px', background: '#F7F9FC',
            borderRadius: '8px', fontSize: '11.5px', color: '#66788A', lineHeight: 1.6,
          }}>
            <div>Total repayable: <b style={{ color: '#0B1F33' }}>CAD {fmt(chosen.total_repayable_cad)}</b></div>
            <div>Processing fee: <b style={{ color: '#0B1F33' }}>{chosen.interest_rate_pct ?? 1.5}%</b> one-time</div>
            <div style={{ marginTop: '4px', fontSize: '10.5px' }}>
              Fee is added to the retail price and split across your chosen tenure.
            </div>
          </div>
        )}
      </div>

      {/* Confirm CTA */}
      <div style={{ padding: '4px 14px 14px' }}>
        <button
          onClick={() => send(confirmValue)}
          style={{
            width: '100%', padding: '12px', border: 'none', borderRadius: '10px',
            background: BRAND, color: '#fff', fontSize: '13.5px', fontWeight: 700, cursor: 'pointer',
          }}
        >
          {payload?.confirm_cta_label || `Continue with ${chosen.tenure_months || ''} months`}
        </button>
      </div>
    </div>
  );
}
