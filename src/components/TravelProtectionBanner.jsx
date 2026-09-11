function safeHttpsUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

function text(value, fallback = '') {
  const result = String(value ?? '').trim();
  return result || fallback;
}

export default function TravelProtectionBanner({ payload, onSendUtterance, onDismiss }) {
  if (!payload) return null;
  const action = payload.action || {};
  const status = payload.status || payload.state || payload.displayState || '';
  const actionType = action.actionType || action.action_type;
  const actionUrl = safeHttpsUrl(action.url);
  const isSavedEstimateActivation = status === 'estimate_saved' && /activate/i.test(text(action.label));
  const canSend = !isSavedEstimateActivation && status !== 'ready_for_activation' && actionType === 'SEND_UTTERANCE' && text(action.utterance);
  const canOpen = !isSavedEstimateActivation && actionType === 'OPEN_URL' && actionUrl;
  const label = text(action.label, status === 'active' ? 'View details' : status === 'request_started' || status === 'request_in_progress' ? 'Continue request' : 'Review estimate');

  return <aside className="acn-travel-protection-banner" aria-label={text(payload.title, 'Travel protection estimate')}>
    <div className="acn-travel-protection-banner__icon" aria-hidden="true">i</div>
    <div>
      <h3>{text(payload.title, 'Travel protection estimate saved')}</h3>
      {text(payload.subtitle) && <p>{payload.subtitle}</p>}
    </div>
    <div className="acn-travel-protection-banner__actions">
      {canSend && <button type="button" onClick={() => onSendUtterance?.(action.utterance)}>{label}</button>}
      {canOpen && <a className="acn-travel-protection-banner__cta" href={actionUrl} target="_blank" rel="noopener noreferrer">{label}</a>}
      <button type="button" className="acn-travel-protection-banner__dismiss" aria-label="Dismiss travel protection banner" title="Dismiss" onClick={onDismiss}>×</button>
    </div>
  </aside>;
}
