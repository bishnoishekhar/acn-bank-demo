// Renders acn-loan-preapproval — the verdict card shown at the end of both
// EPP and Mortgage flows. Big monthly figure, product / property snapshot,
// optional breakdown grid, primary CTA. is_provisional=true always shows a
// pill so the customer never mistakes this for a final approval.
export default function LoanPreapproval({ payload, onCta }) {
  const {
    loan_kind, verdict, headline, monthly_payment_cad, principal_cad,
    tenure_label, interest_rate_pct, product_image_url, product_name,
    breakdown = [], is_provisional,
    primary_cta_label, primary_cta_value,
    secondary_cta_label, secondary_cta_value,
  } = payload || {};

  const BRAND = '#0056B3';
  const MUTED = '#66788A';
  const GREEN = '#059669';
  const AMBER = '#D97706';
  const RED = '#DC2626';

  const verdictMeta = {
    pre_approved: { label: 'Pre-approved', color: GREEN, bg: '#ECFDF5' },
    needs_review: { label: 'Needs review', color: AMBER, bg: '#FFFBEB' },
    not_eligible: { label: 'Not eligible today', color: RED, bg: '#FEF2F2' },
  }[verdict] || { label: verdict || 'Estimate', color: BRAND, bg: '#EFF6FF' };

  const fmt = (v) => Number(v || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const send = (v) => v && onCta && onCta(v);

  return (
    <div style={{
      background: '#fff', borderRadius: '16px', border: '1px solid #E2E6EA',
      marginBottom: '4px', maxWidth: '95%', width: '380px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
      overflow: 'hidden',
    }}>
      {/* Verdict banner — taller, better balanced */}
      <div style={{
        padding: '14px 20px', background: verdictMeta.bg, color: verdictMeta.color,
        fontSize: '13px', fontWeight: 700, display: 'flex',
        justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span>{verdictMeta.label}</span>
        {is_provisional && (
          <span style={{
            fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.6px',
            background: 'rgba(255,255,255,0.7)', padding: '3px 8px', borderRadius: '5px',
            fontWeight: 700,
          }}>Provisional</span>
        )}
      </div>

      {/* Headline + big monthly — more breathing room, wider image */}
      <div style={{ padding: '20px 20px 16px', textAlign: 'center' }}>
        {product_image_url && (
          <div style={{
            width: '80px', height: '80px', borderRadius: '14px', overflow: 'hidden',
            background: '#F0F5FA', margin: '0 auto 12px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <img
              src={product_image_url}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '6px' }}
            />
          </div>
        )}
        {product_name && (
          <div style={{ fontSize: '13px', color: MUTED, marginBottom: '4px' }}>{product_name}</div>
        )}
        <div style={{
          fontSize: '15px', fontWeight: 700, color: '#0B1F33', marginBottom: '16px',
          lineHeight: 1.35,
        }}>
          {headline || (verdict === 'pre_approved' ? 'You are pre-approved.' : verdictMeta.label)}
        </div>
        <div style={{
          fontSize: '11px', color: MUTED, textTransform: 'uppercase',
          letterSpacing: '0.6px', fontWeight: 600,
        }}>
          Monthly
        </div>
        <div style={{
          fontSize: '38px', fontWeight: 800, color: BRAND, lineHeight: 1.1,
          marginTop: '4px', letterSpacing: '-0.5px',
        }}>
          CAD {fmt(monthly_payment_cad)}
        </div>
        <div style={{ fontSize: '12px', color: '#9AAABD', marginTop: '6px' }}>
          {tenure_label || ''}{interest_rate_pct != null ? ` · at ${interest_rate_pct}%` : ''}
        </div>
      </div>

      {/* Breakdown grid — spacious rows */}
      {breakdown.length > 0 && (
        <div style={{ padding: '4px 20px 16px' }}>
          <div style={{
            display: 'grid', gap: '8px', padding: '14px 16px', background: '#F7F9FC',
            borderRadius: '10px', fontSize: '12.5px', color: MUTED, lineHeight: 1.5,
          }}>
            {breakdown.map((row, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', gap: '12px',
              }}>
                <span>{row.label}</span>
                <b style={{ color: '#0B1F33', textAlign: 'right' }}>{row.value}</b>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CTAs — taller, real hierarchy */}
      <div style={{ padding: '4px 20px 20px', display: 'grid', gap: '10px' }}>
        {primary_cta_value && (
          <button
            onClick={() => send(primary_cta_value)}
            style={{
              width: '100%', padding: '15px', border: 'none', borderRadius: '12px',
              background: BRAND, color: '#fff', fontSize: '14px', fontWeight: 700,
              cursor: 'pointer', letterSpacing: '0.2px',
              boxShadow: '0 2px 8px rgba(0,86,179,0.25)',
            }}
          >
            {primary_cta_label || 'Continue'}
          </button>
        )}
        {secondary_cta_value && (
          <button
            onClick={() => send(secondary_cta_value)}
            style={{
              width: '100%', padding: '13px', border: `1.5px solid ${BRAND}`,
              borderRadius: '12px', background: '#fff', color: BRAND,
              fontSize: '13px', fontWeight: 600, cursor: 'pointer',
            }}
          >
            {secondary_cta_label || 'Back'}
          </button>
        )}
      </div>
    </div>
  );
}
