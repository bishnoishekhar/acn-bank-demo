/* Read-only rate table, for "what are your rates?" rather than "which do I want?".
 *
 * Deliberately has no radio buttons and no CTA: a selection control implies the
 * customer is being asked to decide, when they only asked for information.
 * Choosing a rate and comparing fixed against variable both route to
 * MortgageRateShelf instead.
 *
 * ON THE SPARKLINE -- this is a FORWARD projection, not rate history.
 * mortgage_rate_board does not publish past rates, and its own source says it
 * anchors to published forward rates "rather than extrapolating a trend we
 * cannot defend". Drawing an invented 30-day trend on a bank's advertised rates
 * would be fabricating financial data, so the sparkline shows the projected
 * path the board actually returns, labelled as a projection, and only on
 * variable rows. Fixed rows read "locked", because a fixed rate genuinely does
 * not move.
 *
 * Styling is inline to match MortgageRateShelf and the other widgets here.
 */
import { useMemo } from 'react';

const BRAND = '#0056B3';
const MUTED = '#66788A';
const INK = '#0B1F33';
const AMBER = '#D97706';

function Sparkline({ points, width = 54, height = 16 }) {
  const path = useMemo(() => {
    if (!points || points.length < 2) return '';
    const rates = points.map((p) => Number(p.rate_pct) || 0);
    const min = Math.min(...rates);
    const max = Math.max(...rates);
    const span = max - min || 1;
    return rates
      .map((r, i) => {
        const x = (i / (rates.length - 1)) * (width - 2) + 1;
        const y = height - 1 - ((r - min) / span) * (height - 2);
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [points, width, height]);

  if (!path) return null;

  return (
    <svg width={width} height={height} aria-hidden="true" style={{ display: 'block' }}>
      <path d={path} fill="none" stroke={BRAND} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export default function MortgageRateTable({ payload }) {
  const rows = Array.isArray(payload?.rows) ? payload.rows : [];
  const projection = Array.isArray(payload?.variable_projection) ? payload.variable_projection : [];
  const primeRate = Number(payload?.prime_rate_pct || 0);
  const holdDays = Number(payload?.rate_hold_days || 0);
  const freqLabel = payload?.payment_frequency_label || 'Monthly';
  const disclaimer = payload?.variable_projection_disclaimer || '';

  if (!rows.length) return null;

  const money = (v) =>
    Number(v || 0).toLocaleString('en-CA', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  const cell = { padding: '9px 10px', borderTop: '1px solid #F1F4F7', verticalAlign: 'middle' };
  const headCell = {
    padding: '0 10px 7px', fontSize: '10px', fontWeight: 700, color: MUTED,
    textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'left',
  };

  return (
    <div style={{
      background: '#fff', borderRadius: '16px', border: '1px solid #E2E6EA',
      marginBottom: '4px', maxWidth: '95%', width: '380px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.06)', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid #EEF1F5' }}>
        <div style={{ fontSize: '14px', fontWeight: 700, color: INK }}>
          {payload?.title || 'Our current mortgage rates'}
        </div>
        <div style={{ fontSize: '12px', color: MUTED, marginTop: '3px' }}>
          {payload?.subtitle || `${freqLabel} payments. Illustrative until a full review.`}
        </div>
      </div>

      <div style={{ padding: '12px 14px 4px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr>
              <th scope="col" style={headCell}>Term</th>
              <th scope="col" style={{ ...headCell, textAlign: 'right' }}>Rate</th>
              <th scope="col" style={{ ...headCell, textAlign: 'right' }}>{freqLabel}</th>
              <th scope="col" style={{ ...headCell, textAlign: 'right' }}>Projected</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const isVariable = String(row.rate_type || '').toLowerCase() === 'variable';
              return (
                <tr key={row.product_id || i}>
                  <th scope="row" style={{ ...cell, textAlign: 'left', fontWeight: 600, color: INK }}>
                    <div>{row.term_label || row.product_id}</div>
                    {row.rate_basis && (
                      <div style={{ fontSize: '10px', color: MUTED, fontWeight: 400, marginTop: '2px' }}>
                        {row.rate_basis}
                      </div>
                    )}
                    {row.note && (
                      <div style={{ fontSize: '10px', color: BRAND, fontWeight: 600, marginTop: '2px' }}>
                        {row.note}
                      </div>
                    )}
                  </th>
                  <td style={{ ...cell, textAlign: 'right', fontWeight: 700, color: BRAND, fontSize: '13px' }}>
                    {Number(row.rate_pct || 0).toFixed(2)}%
                  </td>
                  <td style={{ ...cell, textAlign: 'right', color: INK, whiteSpace: 'nowrap' }}>
                    CAD {money(row.payment_per_period_cad)}
                  </td>
                  <td style={{ ...cell, textAlign: 'right' }}>
                    {isVariable && projection.length > 1 ? (
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <Sparkline points={projection} />
                      </div>
                    ) : (
                      <span style={{ fontSize: '10px', color: MUTED }}>locked</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ padding: '8px 18px 14px', fontSize: '11px', color: MUTED }}>
        {primeRate > 0 && <span>Prime {primeRate.toFixed(2)}%</span>}
        {primeRate > 0 && holdDays > 0 && <span> · </span>}
        {holdDays > 0 && <span>{holdDays}-day rate hold</span>}
        {projection.length > 1 && disclaimer && (
          <div style={{ color: AMBER, marginTop: '6px', lineHeight: 1.4 }}>{disclaimer}</div>
        )}
      </div>
    </div>
  );
}
