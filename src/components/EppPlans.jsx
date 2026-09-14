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
  const MUTED = '#66788A';

  const fmt = (amount) => {
    const n = Number(amount);
    if (Number.isNaN(n)) return String(amount ?? '');
    return n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const chosen = plans[selectedIdx] || {};
  const tenureStr = String(chosen.tenure_months || '');
  const confirmValue = String(payload?.confirm_cta_value || 'epp_plan_confirm')
    .replace('{tenure}', tenureStr);
  // Label is always dynamic — echo the currently selected chip. If the agent
  // sent a template with {tenure}, substitute; otherwise ignore its static
  // label so it never shows a stale tenure after the user picks a chip.
  const rawLabel = payload?.confirm_cta_label;
  const confirmLabel = rawLabel && rawLabel.includes('{tenure}')
    ? rawLabel.replace('{tenure}', tenureStr)
    : `Continue with ${tenureStr} months`;

  const send = (v) => v && onCta && onCta(v);

  return (
    <div style={{
      background: '#fff', borderRadius: '16px', border: '1px solid #E2E6EA',
      marginBottom: '4px', maxWidth: '95%', width: '380px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
    }}>
      {/* Product header — bigger image, more breathing room */}
      <div style={{
        display: 'flex', gap: '14px', padding: '18px 20px',
        borderBottom: '1px solid #EEF2F7', alignItems: 'center',
      }}>
        {payload?.product_image_url && (
          <div style={{
            width: '64px', height: '64px', borderRadius: '12px', overflow: 'hidden',
            background: '#F0F5FA', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <img
              src={payload.product_image_url}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '4px' }}
            />
          </div>
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#0B1F33', lineHeight: 1.25 }}>
            {payload?.product_name || 'Choose your plan'}
          </div>
          {payload?.retail_price_cad != null && (
            <div style={{ fontSize: '12px', color: MUTED, marginTop: '4px' }}>
              Retail CAD {fmt(payload.retail_price_cad)}
            </div>
          )}
        </div>
      </div>

      {/* Tenure chips — taller, bigger monthly figure, real spacing */}
      <div style={{ padding: '18px 20px 12px' }}>
        <div style={{
          fontSize: '11px', color: MUTED, textTransform: 'uppercase',
          letterSpacing: '0.6px', marginBottom: '12px', fontWeight: 600,
        }}>
          Pick your pace
        </div>
        <div style={{
          display: 'grid', gridTemplateColumns: `repeat(${plans.length}, 1fr)`,
          gap: '10px',
        }}>
          {plans.map((plan, i) => {
            const selected = i === selectedIdx;
            return (
              <button
                key={plan.tenure_months || i}
                onClick={() => setSelectedIdx(i)}
                style={{
                  padding: '14px 6px', textAlign: 'center', cursor: 'pointer',
                  background: selected ? BRAND : '#fff',
                  color: selected ? '#fff' : '#0B1F33',
                  border: `1.5px solid ${selected ? BRAND : '#E2E6EA'}`,
                  borderRadius: '12px',
                  transition: 'all 0.15s ease',
                  boxShadow: selected ? '0 2px 8px rgba(0,86,179,0.25)' : 'none',
                }}
              >
                <div style={{
                  fontSize: '11px', opacity: 0.85, marginBottom: '6px',
                  fontWeight: 500,
                }}>
                  {plan.tenure_months} months
                </div>
                <div style={{ fontSize: '20px', fontWeight: 800, lineHeight: 1.1 }}>
                  ${fmt(plan.monthly_amount_cad)}
                </div>
                <div style={{ fontSize: '10.5px', opacity: 0.75, marginTop: '3px' }}>/mo</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Plan details — collapsed. Interest & totals only live here. */}
      <div style={{ padding: '0 20px 12px' }}>
        <button
          onClick={() => setDetailsOpen((o) => !o)}
          style={{
            background: 'none', border: 'none', color: MUTED,
            fontSize: '12px', padding: '6px 0', cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          {detailsOpen ? '▾ Hide plan details' : '▸ Plan details'}
        </button>
        {detailsOpen && (
          <div style={{
            marginTop: '6px', padding: '12px 14px', background: '#F7F9FC',
            borderRadius: '10px', fontSize: '12.5px', color: MUTED, lineHeight: 1.7,
          }}>
            <div>Total repayable: <b style={{ color: '#0B1F33' }}>CAD {fmt(chosen.total_repayable_cad)}</b></div>
            <div>Processing fee: <b style={{ color: '#0B1F33' }}>{chosen.interest_rate_pct ?? 1.5}%</b> one-time</div>
            <div style={{ marginTop: '6px', fontSize: '11px', lineHeight: 1.5 }}>
              Fee is added to the retail price and split across your chosen tenure.
            </div>
          </div>
        )}
      </div>

      {/* Confirm CTA — taller, more presence */}
      <div style={{ padding: '4px 20px 20px' }}>
        <button
          onClick={() => send(confirmValue)}
          style={{
            width: '100%', padding: '15px', border: 'none', borderRadius: '12px',
            background: BRAND, color: '#fff', fontSize: '14px', fontWeight: 700,
            cursor: 'pointer', letterSpacing: '0.2px',
            boxShadow: '0 2px 8px rgba(0,86,179,0.25)',
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
