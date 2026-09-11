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
      background: '#fff', borderRadius: '14px', border: '1px solid #E2E6EA',
      marginBottom: '4px', maxWidth: '86%', boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
      overflow: 'hidden',
    }}>
      {/* Verdict banner */}
      <div style={{
        padding: '10px 14px', background: verdictMeta.bg, color: verdictMeta.color,
        fontSize: '12px', fontWeight: 700, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span>{verdictMeta.label}</span>
        {is_provisional && (
          <span style={{
            fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px',
            background: 'rgba(255,255,255,0.6)', padding: '2px 6px', borderRadius: '4px',
          }}>Provisional</span>
        )}
      </div>

      {/* Headline + big monthly */}
      <div style={{ padding: '14px', textAlign: 'center' }}>
        {product_image_url && (
          <div style={{
            width: '60px', height: '60px', borderRadius: '10px', overflow: 'hidden',
            background: '#F0F5FA', margin: '0 auto 8px',
          }}>
            <img src={product_image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        )}
        {product_name && (
          <div style={{ fontSize: '12.5px', color: '#66788A', marginBottom: '2px' }}>{product_name}</div>
        )}
        <div style={{ fontSize: '14px', fontWeight: 700, color: '#0B1F33', marginBottom: '10px' }}>
          {headline || (verdict === 'pre_approved' ? 'You are pre-approved.' : verdictMeta.label)}
        </div>
        <div style={{ fontSize: '10.5px', color: '#66788A', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Monthly
        </div>
        <div style={{ fontSize: '30px', fontWeight: 800, color: BRAND, lineHeight: 1.1, marginTop: '2px' }}>
          CAD {fmt(monthly_payment_cad)}
        </div>
        <div style={{ fontSize: '10.5px', color: '#9AAABD', marginTop: '4px' }}>
          {tenure_label || ''}{interest_rate_pct != null ? ` · at ${interest_rate_pct}%` : ''}
        </div>
      </div>

      {/* Breakdown grid */}
      {breakdown.length > 0 && (
        <div style={{ padding: '4px 14px 12px' }}>
          <div style={{
            display: 'grid', gap: '4px', padding: '10px 12px', background: '#F7F9FC',
            borderRadius: '8px', fontSize: '11.5px', color: '#66788A',
          }}>
            {breakdown.map((row, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{row.label}</span>
                <b style={{ color: '#0B1F33' }}>{row.value}</b>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CTAs */}
      <div style={{ padding: '4px 14px 14px', display: 'grid', gap: '8px' }}>
        {primary_cta_value && (
          <button
            onClick={() => send(primary_cta_value)}
            style={{
              width: '100%', padding: '12px', border: 'none', borderRadius: '10px',
              background: BRAND, color: '#fff', fontSize: '13.5px', fontWeight: 700, cursor: 'pointer',
            }}
          >
            {primary_cta_label || 'Continue'}
          </button>
        )}
        {secondary_cta_value && (
          <button
            onClick={() => send(secondary_cta_value)}
            style={{
              width: '100%', padding: '10px', border: `1px solid ${BRAND}`, borderRadius: '10px',
              background: '#fff', color: BRAND, fontSize: '12.5px', fontWeight: 600, cursor: 'pointer',
            }}
          >
            {secondary_cta_label || 'Back'}
          </button>
        )}
      </div>
    </div>
  );
}
