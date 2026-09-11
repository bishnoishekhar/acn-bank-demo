// Renders acn-mobile-handoff — the "Continue in the ACN Bank app" card that
// ends both loan flows. Reuses the trusted-host guard from CardActivationWidget
// so the same allowlist protects both handoff pathways.
const TRUSTED_ACTIVATION_HOST = 'emvnzir-canada-song.web.app';

function safeHandoffUrl(raw) {
  try {
    const url = new URL(String(raw || ''));
    if (url.protocol !== 'https:') return null;
    if (url.host !== TRUSTED_ACTIVATION_HOST) return null;
    return url;
  } catch {
    return null;
  }
}

export default function MobileHandoff({ payload }) {
  const {
    title, body, cta_label, handoff_url,
    loan_kind, monthly_payment_cad, product_name, product_image_url,
  } = payload || {};

  const url = safeHandoffUrl(handoff_url);
  const disabled = !url;

  const BRAND = '#0056B3';

  const fmt = (v) => Number(v || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const kindLabel = loan_kind === 'mortgage' ? 'Mortgage' : loan_kind === 'epp' ? 'Easy Payment Plan' : '';

  return (
    <div style={{
      background: '#fff', borderRadius: '14px', border: '1px solid #E2E6EA',
      marginBottom: '4px', maxWidth: '86%', boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
    }}>
      <div style={{ padding: '14px 14px 8px' }}>
        {kindLabel && (
          <span style={{
            display: 'inline-block', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px',
            color: BRAND, background: '#EFF6FF', padding: '2px 6px', borderRadius: '4px', marginBottom: '6px',
          }}>{kindLabel}</span>
        )}
        <div style={{ fontSize: '14px', fontWeight: 700, color: '#0B1F33' }}>
          {title || 'Finish in the ACN Bank app'}
        </div>
        {body && (
          <div style={{ fontSize: '12px', color: '#66788A', marginTop: '4px', lineHeight: 1.4 }}>{body}</div>
        )}
      </div>

      {(product_name || monthly_payment_cad != null) && (
        <div style={{
          padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px',
          borderTop: '1px solid #F0F5FA', borderBottom: '1px solid #F0F5FA', background: '#F7F9FC',
        }}>
          {product_image_url && (
            <div style={{ width: '40px', height: '40px', borderRadius: '8px', overflow: 'hidden', background: '#F0F5FA', flexShrink: 0 }}>
              <img src={product_image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            {product_name && (
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#0B1F33', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {product_name}
              </div>
            )}
            {monthly_payment_cad != null && (
              <div style={{ fontSize: '11px', color: '#66788A', marginTop: '2px' }}>
                CAD {fmt(monthly_payment_cad)} / month
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ padding: '10px 14px 14px' }}>
        {disabled ? (
          <div style={{
            padding: '10px 12px', background: '#FEF2F2', color: '#DC2626',
            borderRadius: '8px', fontSize: '11.5px',
          }}>
            The handoff link couldn't be verified. Please contact support.
          </div>
        ) : (
          <a
            href={url.href}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'block', textAlign: 'center', textDecoration: 'none',
              padding: '12px', borderRadius: '10px', background: BRAND, color: '#fff',
              fontSize: '13.5px', fontWeight: 700,
            }}
          >
            {cta_label || 'Continue in the app'}
          </a>
        )}
      </div>
    </div>
  );
}
