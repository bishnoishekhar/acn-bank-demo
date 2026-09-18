// Renders acn-mortgage-rate-shelf — the fixed-vs-variable chooser.
//
// Structure follows EppPlans.jsx: selectable rows, a details expander, and a
// locked "selected" state after confirm so the bubble stays in the transcript
// as a record of the choice.
//
// The part that matters: picking a VARIABLE product reveals the projected rate
// path and the break-even month against the best fixed. That is the honest way
// to present the trade — variable is cheaper today, and here is roughly when
// that stops being true. The chart is hand-rolled SVG because this app has no
// chart dependency and one sparkline is not worth adding one.
//
// Every rate, payment, projection point and break-even figure comes from
// mortgage_rate_board. Nothing here is computed locally.
import { useMemo, useState } from 'react';

const BRAND = '#0056B3';
const MUTED = '#66788A';
const INK = '#0B1F33';
const AMBER = '#D97706';

export default function MortgageRateShelf({ payload, onCta }) {
  const products = Array.isArray(payload?.products) ? payload.products : [];
  const projection = Array.isArray(payload?.variable_projection) ? payload.variable_projection : [];
  const breakEven = payload?.break_even || null;
  const perYear = Number(payload?.payments_per_year || 12);
  const freqLabel = payload?.payment_frequency_label || 'Monthly';
  const holdDays = Number(payload?.rate_hold_days || 0);

  const [selectedId, setSelectedId] = useState(() => {
    const rec = products.find((p) => p.recommended);
    return (rec || products[0] || {}).product_id || '';
  });
  const [detailsOpenId, setDetailsOpenId] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const selected = products.find((p) => p.product_id === selectedId) || products[0] || {};

  const fmt2 = (v) => Number(v || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const cadence = perYear === 12 ? '/mo' : perYear === 24 ? '/semi-mo' : perYear === 26 ? '/2 wks' : '/wk';

  const confirmLabel = useMemo(() => {
    const raw = payload?.confirm_cta_label;
    if (raw && raw.includes('{product}')) return raw.replace('{product}', selected.name || '');
    return `Continue with ${selected.name || 'this rate'}`;
  }, [payload?.confirm_cta_label, selected.name]);

  const send = () => {
    if (!onCta || !selected.product_id) return;
    setSubmitted(true);
    const base = String(payload?.confirm_cta_value || 'mortgage_rate_select');
    onCta(`${base}:${JSON.stringify({
      product_id: selected.product_id,
      rate_type: selected.rate_type,
      rate_pct: selected.rate_pct,
      term_years: selected.term_years,
      payment_per_period_cad: selected.payment_per_period_cad,
    })}`);
  };

  if (products.length === 0) return null;

  return (
    <div style={{
      background: '#fff', borderRadius: '16px', border: '1px solid #E2E6EA',
      marginBottom: '4px', maxWidth: '95%', width: '380px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.06)', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid #EEF1F5' }}>
        <div style={{ fontSize: '14px', fontWeight: 700, color: INK }}>
          {payload?.title || 'Choose your rate'}
        </div>
        <div style={{ fontSize: '12px', color: MUTED, marginTop: '3px' }}>
          {payload?.subtitle || `${freqLabel} payments. Rates are illustrative until a full review.`}
        </div>
      </div>

      {/* Rate rows */}
      <div style={{ padding: '10px 14px 4px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {products.map((p) => {
          const isSelected = p.product_id === selectedId;
          const isVariable = String(p.rate_type).toLowerCase() === 'variable';
          const badges = String(p.badge || '').split('|').map((b) => b.trim()).filter(Boolean);
          const detailsOpen = detailsOpenId === p.product_id;

          return (
            <div
              key={p.product_id}
              style={{
                border: `1.5px solid ${isSelected ? BRAND : '#E2E6EA'}`,
                borderRadius: '12px',
                background: isSelected ? '#F7FAFF' : '#fff',
                opacity: submitted && !isSelected ? 0.45 : 1,
                transition: 'all 0.15s ease',
                overflow: 'hidden',
              }}
            >
              <button
                onClick={submitted ? undefined : () => setSelectedId(p.product_id)}
                disabled={submitted}
                style={{
                  width: '100%', background: 'none', border: 'none', textAlign: 'left',
                  padding: '12px 14px', cursor: submitted ? 'default' : 'pointer',
                  display: 'flex', alignItems: 'flex-start', gap: '11px',
                }}
              >
                {/* Radio */}
                <span style={{
                  width: '17px', height: '17px', borderRadius: '50%', flexShrink: 0, marginTop: '2px',
                  border: `2px solid ${isSelected ? BRAND : '#C4CEDA'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {isSelected && (
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: BRAND }} />
                  )}
                </span>

                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px' }}>
                    <span style={{ fontSize: '12.5px', fontWeight: 700, color: INK, lineHeight: 1.3 }}>
                      {p.name}
                    </span>
                    <span style={{ fontSize: '17px', fontWeight: 800, color: BRAND, whiteSpace: 'nowrap' }}>
                      {Number(p.rate_pct).toFixed(2)}%
                    </span>
                  </span>

                  <span style={{ display: 'block', fontSize: '11px', color: '#9AAABD', marginTop: '3px' }}>
                    {p.rate_basis}
                  </span>

                  <span style={{ display: 'block', fontSize: '13px', color: INK, fontWeight: 600, marginTop: '6px' }}>
                    CAD {fmt2(p.payment_per_period_cad)}
                    <span style={{ fontSize: '11px', color: MUTED, fontWeight: 400 }}>{cadence}</span>
                  </span>

                  {p.blurb && (
                    <span style={{ display: 'block', fontSize: '11.5px', color: MUTED, marginTop: '5px', lineHeight: 1.45 }}>
                      {p.blurb}
                    </span>
                  )}

                  {badges.length > 0 && (
                    <span style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '7px' }}>
                      {badges.map((b) => (
                        <span key={b} style={{
                          fontSize: '9.5px', fontWeight: 700, textTransform: 'uppercase',
                          letterSpacing: '0.5px', padding: '3px 7px', borderRadius: '5px',
                          background: b === 'Lowest today' ? '#ECFDF5' : '#EEF2F7',
                          color: b === 'Lowest today' ? '#059669' : MUTED,
                        }}>
                          {b}
                        </span>
                      ))}
                    </span>
                  )}
                </span>
              </button>

              {/* The projection lives behind the variable row, and only opens
                  once that row is the selected one. */}
              {isVariable && isSelected && projection.length > 1 && (
                <div style={{ padding: '0 14px 12px' }}>
                  <button
                    onClick={() => setDetailsOpenId(detailsOpen ? '' : p.product_id)}
                    style={{
                      background: 'none', border: 'none', color: BRAND, padding: '4px 0',
                      fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    {detailsOpen ? '▾ Hide what we project' : '▸ What we project'}
                  </button>

                  {detailsOpen && (
                    <div style={{
                      marginTop: '8px', padding: '12px 13px', background: '#F7F9FC',
                      borderRadius: '10px',
                    }}>
                      <ProjectionChart points={projection} />

                      {breakEven?.summary && (
                        <div style={{
                          fontSize: '11.5px', color: INK, lineHeight: 1.5, marginTop: '10px',
                          paddingTop: '10px', borderTop: '1px solid #E2E6EA',
                        }}>
                          {breakEven.summary}
                        </div>
                      )}

                      {breakEven?.crosses_within_horizon && (
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px',
                          fontSize: '11px', color: AMBER, fontWeight: 600,
                        }}>
                          <span>⚑</span>
                          <span>Break-even around month {breakEven.break_even_month}</span>
                        </div>
                      )}

                      <div style={{ fontSize: '10.5px', color: '#9AAABD', marginTop: '9px', lineHeight: 1.45 }}>
                        {payload?.variable_projection_disclaimer
                          || 'A projection based on published forward rates, not a promise.'}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {holdDays > 0 && (
        <div style={{ padding: '4px 18px 0', fontSize: '11px', color: MUTED }}>
          🔒 With a pre-approval we can hold your rate for {holdDays} days.
        </div>
      )}

      {/* Confirm — locks into a receipt chip, matching EppPlans. */}
      <div style={{ padding: '14px 18px 18px' }}>
        <button
          onClick={submitted ? undefined : send}
          disabled={submitted}
          style={{
            width: '100%', padding: '15px', border: 'none', borderRadius: '12px',
            background: submitted ? '#E6F2F5' : BRAND,
            color: submitted ? BRAND : '#fff',
            fontSize: '14px', fontWeight: 700,
            cursor: submitted ? 'default' : 'pointer', letterSpacing: '0.2px',
            boxShadow: submitted ? 'none' : '0 2px 8px rgba(0,86,179,0.25)',
          }}
        >
          {submitted
            ? `✓ Selected · ${selected.name} at ${Number(selected.rate_pct).toFixed(2)}%`
            : confirmLabel}
        </button>
      </div>
    </div>
  );
}

// ── Inline SVG sparkline for the projected rate path. ──────────────────────
// Kept tiny and dependency-free. Axis labels are the anchor months the tool
// returned, so we never invent a data point between them.
function ProjectionChart({ points }) {
  const W = 300;
  const H = 96;
  const PAD_L = 30;
  const PAD_B = 18;
  const PAD_T = 8;
  const PAD_R = 6;

  const rates = points.map((p) => Number(p.rate_pct));
  const months = points.map((p) => Number(p.month));
  const minRate = Math.min(...rates);
  const maxRate = Math.max(...rates);
  const span = maxRate - minRate || 1;
  const maxMonth = Math.max(...months) || 1;

  const x = (m) => PAD_L + (m / maxMonth) * (W - PAD_L - PAD_R);
  const y = (r) => PAD_T + (1 - (r - minRate) / span) * (H - PAD_T - PAD_B);

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.month).toFixed(1)} ${y(p.rate_pct).toFixed(1)}`).join(' ');
  const area = `${line} L ${x(maxMonth).toFixed(1)} ${H - PAD_B} L ${PAD_L} ${H - PAD_B} Z`;

  return (
    <div>
      <div style={{
        fontSize: '10px', color: MUTED, textTransform: 'uppercase',
        letterSpacing: '0.6px', fontWeight: 700, marginBottom: '6px',
      }}>
        Projected variable rate
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Projected variable rate path">
        {/* Gridlines at the low and high ends only — two is enough to read it. */}
        {[maxRate, minRate].map((r) => (
          <g key={r}>
            <line x1={PAD_L} y1={y(r)} x2={W - PAD_R} y2={y(r)} stroke="#E2E6EA" strokeWidth="1" />
            <text x={PAD_L - 5} y={y(r) + 3} textAnchor="end" fontSize="8.5" fill="#9AAABD">
              {r.toFixed(2)}
            </text>
          </g>
        ))}

        <path d={area} fill={BRAND} fillOpacity="0.09" />
        <path d={line} fill="none" stroke={BRAND} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {points.map((p, i) => (
          <g key={p.month}>
            <circle cx={x(p.month)} cy={y(p.rate_pct)} r="2.8" fill="#fff" stroke={BRAND} strokeWidth="1.6" />
            {(i === 0 || i === points.length - 1 || i === Math.floor(points.length / 2)) && (
              <text
                x={Math.min(Math.max(x(p.month), PAD_L + 6), W - PAD_R - 18)}
                y={H - 5}
                textAnchor="middle"
                fontSize="8.5"
                fill="#9AAABD"
              >
                {p.month === 0 ? 'now' : `${p.month}m`}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}
