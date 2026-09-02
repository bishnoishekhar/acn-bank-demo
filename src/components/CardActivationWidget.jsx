const TRUSTED_ACTIVATION_HOST = 'emvnzir-canada-song.web.app';
const CTA_LABEL = 'Continue activation in your ACN Bank app';
const activationBackground = `${import.meta.env.BASE_URL}images/card-activation-background.png`;

function validateActivationAction(action = {}) {
  const actionType = String(action.actionType || '').trim();
  const rawUrl = typeof action.url === 'string' ? action.url.trim() : '';

  if (actionType !== 'OPEN_URL') return { isValid: false, reason: 'unsupported-action-type' };
  if (!rawUrl) return { isValid: false, reason: 'missing-url' };

  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:') return { isValid: false, reason: 'non-https' };
    if (url.hostname !== TRUSTED_ACTIVATION_HOST) return { isValid: false, reason: 'untrusted-host' };
    return { isValid: true, url: url.href };
  } catch {
    return { isValid: false, reason: 'invalid-url' };
  }
}

export default function CardActivationWidget({ payload }) {
  const data = payload || {};
  const action = data.action && typeof data.action === 'object' ? data.action : {};
  const productName = data.productName || 'ACN card';
  const validation = validateActivationAction(action);

  if (!validation.isValid && action.actionType === 'OPEN_URL' && action.url) {
    console.warn('[ACN] card activation CTA rejected:', { url: action.url, reason: validation.reason });
  }

  return (
    <div
      className="acn-card-activation"
      aria-live="polite"
      style={{ backgroundImage: `url(${activationBackground})` }}
    >
      <div className="acn-card-activation-content">
        <span className="acn-card-activation-badge">
          <span className="acn-card-activation-badge-icon" aria-hidden="true">✓</span>
          READY TO ACTIVATE
        </span>

        <h3 className="acn-card-activation-title">Your journey is one step away.</h3>
        <div className="acn-card-activation-product">{productName}</div>
        <p className="acn-card-activation-subtitle">
          Your application has been approved. Complete activation securely in the ACN Bank app.
        </p>
      </div>

      <div className="acn-card-activation-cta-block">
        {validation.isValid ? (
          <a
            className="acn-card-activation-cta"
            href={validation.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={CTA_LABEL}
          >
            <span>{CTA_LABEL}</span>
            <span className="acn-card-activation-cta-icon" aria-hidden="true">→</span>
          </a>
        ) : (
          <button type="button" className="acn-card-activation-cta acn-card-activation-cta--disabled" disabled aria-label={CTA_LABEL}>
            <span>{CTA_LABEL}</span>
            <span className="acn-card-activation-cta-icon" aria-hidden="true">→</span>
          </button>
        )}

        {validation.isValid && (
          <div className="acn-card-activation-footnote">Secure activation · Opens in a new tab</div>
        )}
      </div>
    </div>
  );
}
