// Renders acn-mobile-handoff — the "Continue in the ACN Bank app" card that
// ends both loan flows. Reuses the trusted-host guard from CardActivationWidget
// so the same allowlist protects both handoff pathways.
//
// Design intent: this card is the ONLY chance to tell the customer "clicking
// this button will sign you into the app automatically AND land you on a
// review page — you don't have to re-enter credentials, you don't have to
// hunt for the loan." So we render a compact 3-step journey preview above
// the CTA. The button also carries an arrow so it's obviously actionable.
const TRUSTED_ACTIVATION_HOST = 'emvnzir-canada-song.web.app';

function safeHandoffUrl(raw) {
  try {
    const url = new URL(String(raw || ''));
    if (url.protocol !== 'https:') return null;
    if (url.host !== TRUSTED_ACTIVATION_HOST) return null;
    // The URL must carry the SSO markers or the app can't auto-sign the
    // customer in. If they're missing we still let the link through (defence
    // in depth — the app itself re-checks), but we surface a warning in the
    // console so demo bugs are obvious.
    const qp = url.searchParams;
    if (qp.get('sso') !== 'web') {
      // eslint-disable-next-line no-console
      console.warn('[ACN] handoff URL missing sso=web — app will show login screen:', raw);
    }
    if (!qp.get('customer_id')) {
      // eslint-disable-next-line no-console
      console.warn('[ACN] handoff URL missing customer_id — app cannot auto-SSO:', raw);
    }
    return url;
  } catch {
    return null;
  }
}

export default function MobileHandoff({ payload }) {
  const {
    title, body, cta_label, handoff_url,
    loan_kind, monthly_payment_cad, product_name, product_image_url,
    principal_cad, interest_rate_pct, tenure_label, verdict,
  } = payload || {};

  const url = safeHandoffUrl(handoff_url);
  const disabled = !url;

  // Ensure the Flutter side's deep-link snapshot has every field the review
  // screen needs. CES currently emits handoff_url with only loan_draft +
  // handoff_token + customer_id + sso, and its Firestore stub doc is often
  // missing monetary fields — the Flutter review screen would then render
  // "CAD 0.00" for both Principal and Monthly. We inject the plan values
  // from the widget payload here so the URL always carries the full plan,
  // regardless of what the agent's handoff_url template happens to include.
  // Only set params the URL doesn't already carry — never overwrite what the
  // agent explicitly encoded.
  if (url) {
    const inject = {
      kind: loan_kind,
      monthly: monthly_payment_cad,
      principal: principal_cad,
      rate: interest_rate_pct,
      tenure: tenure_label,
      product: product_name,
      img: product_image_url,
      verdict,
    };
    for (const [k, v] of Object.entries(inject)) {
      if (v == null || v === '') continue;
      if (url.searchParams.has(k)) continue;
      url.searchParams.set(k, String(v));
    }
  }

  const BRAND = '#0056B3';
  const MUTED = '#66788A';

  const fmt = (v) => Number(v || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const kindLabel = loan_kind === 'mortgage' ? 'Mortgage' : loan_kind === 'epp' ? 'Easy Payment Plan' : '';
  const isEpp = loan_kind === 'epp';

  // Journey preview — the three things that will happen AFTER they tap.
  // Copy is short and outcome-oriented, never process-oriented ("You sign
  // in", not "We open an OAuth window").
  const journey = [
    { icon: '🔓', label: 'Signed in automatically' },
    { icon: '📄', label: isEpp ? 'Review your plan' : 'Review your estimate' },
    { icon: '✅', label: isEpp ? 'Activate & auto-pay' : 'Talk to an advisor' },
  ];

  // Never let the button label render as empty. If the agent sent nothing,
  // a whitespace string, or something weird — fall back.
  const label = (typeof cta_label === 'string' && cta_label.trim())
    ? cta_label.trim()
    : 'Continue in the app';

  return (
    <div style={{
      background: '#fff', borderRadius: '14px', border: '1px solid #E2E6EA',
      marginBottom: '4px', maxWidth: '86%', boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
    }}>
      {/* Header */}
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
          <div style={{ fontSize: '12px', color: MUTED, marginTop: '4px', lineHeight: 1.4 }}>{body}</div>
        )}
      </div>

      {/* Product/loan snapshot */}
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
              <div style={{ fontSize: '11px', color: MUTED, marginTop: '2px' }}>
                CAD {fmt(monthly_payment_cad)} / month
              </div>
            )}
          </div>
        </div>
      )}

      {/* Journey preview — the three things that happen after they tap */}
      <div style={{ padding: '12px 14px 0' }}>
        <div style={{
          fontSize: '10px', color: MUTED, textTransform: 'uppercase',
          letterSpacing: '0.5px', marginBottom: '8px',
        }}>
          What happens next
        </div>
        <div style={{ display: 'flex', alignItems: 'stretch', gap: '4px' }}>
          {journey.map((step, i) => (
            <div key={i} style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              position: 'relative',
            }}>
              <div style={{
                width: '28px', height: '28px', borderRadius: '50%',
                background: '#EFF6FF', border: `1.5px solid ${BRAND}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '14px', lineHeight: 1,
              }}>
                {step.icon}
              </div>
              <div style={{
                fontSize: '10px', color: '#0B1F33', textAlign: 'center',
                marginTop: '6px', fontWeight: 500, lineHeight: 1.25,
              }}>
                {step.label}
              </div>
              {/* Connector line to next step */}
              {i < journey.length - 1 && (
                <div style={{
                  position: 'absolute', top: '13px', left: 'calc(50% + 18px)',
                  right: 'calc(-50% + 18px)', height: '1.5px',
                  background: '#CBD5E1',
                }} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div style={{ padding: '14px' }}>
        {disabled ? (
          <div style={{
            padding: '10px 12px', background: '#FEF2F2', color: '#DC2626',
            borderRadius: '8px', fontSize: '11.5px',
          }}>
            The handoff link couldn't be verified. Please contact support.
          </div>
        ) : (
          <>
            <a
              href={url.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                // eslint-disable-next-line no-console
                console.log('[ACN] handoff URL clicked:', url.href, {
                  loan_draft: url.searchParams.get('loan_draft'),
                  handoff_token: url.searchParams.get('handoff_token'),
                  customer_id: url.searchParams.get('customer_id'),
                  sso: url.searchParams.get('sso'),
                  // Plan fields injected client-side from the widget payload
                  // so the Flutter review screen doesn't fall back to CAD 0.00.
                  kind: url.searchParams.get('kind'),
                  monthly: url.searchParams.get('monthly'),
                  principal: url.searchParams.get('principal'),
                  tenure: url.searchParams.get('tenure'),
                  rate: url.searchParams.get('rate'),
                  product: url.searchParams.get('product'),
                });
              }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                textDecoration: 'none', padding: '13px 12px', borderRadius: '10px',
                background: BRAND, color: '#fff', fontSize: '13.5px', fontWeight: 700,
                minHeight: '48px', boxSizing: 'border-box',
              }}
            >
              <span style={{ color: '#fff' }}>{label}</span>
              <span aria-hidden="true" style={{ fontSize: '14px', color: '#fff' }}>→</span>
            </a>
            <div style={{
              fontSize: '10.5px', color: MUTED, textAlign: 'center', marginTop: '8px',
            }}>
              Secure hand-off · Opens the ACN Bank app
            </div>
          </>
        )}
      </div>
    </div>
  );
}
