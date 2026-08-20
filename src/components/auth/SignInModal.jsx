import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';

// Firestore stores a 4-digit mobile_pin (customers/{id}/security/profile).
const PIN_LENGTH = 4;

export default function SignInModal({ isOpen, onClose, onSuccess, context = 'nav' }) {
  const { signIn, error, clearError } = useAuth();
  const [phone,   setPhone]   = useState('');
  const [pin,     setPin]     = useState('');
  const [loading, setLoading] = useState(false);
  const phoneRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    clearError();
    setPhone('');
    setPin('');
    setLoading(false);
    setTimeout(() => phoneRef.current?.focus(), 120);
  }, [isOpen]); // eslint-disable-line

  const fmt = (val) => {
    const d = val.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 1) return d;
    if (d.length <= 4) return `+1 (${d.slice(1)}`;
    if (d.length <= 7) return `+1 (${d.slice(1, 4)}) ${d.slice(4)}`;
    return `+1 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 11 || pin.length < PIN_LENGTH) return;
    setLoading(true);
    const result = await signIn(`+${digits}`, pin);
    setLoading(false);
    if (result.success) {
      onSuccess?.(result);
      onClose();
    }
  };

  if (!isOpen) return null;

  const ready = phone.replace(/\D/g, '').length >= 11 && pin.length >= PIN_LENGTH;
  // Explain *why* the modal appeared when the agent triggered it mid-conversation.
  const fromChat = context === 'chat';

  return (
    <div
      className="si-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Sign in to ACN Bank"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="si-card">
        <button className="si-close" onClick={onClose} aria-label="Close sign in">✕</button>

        {/* Brand */}
        <div className="si-brand">
          <div className="si-brand-mark" aria-hidden="true">»</div>
          <span className="si-brand-name">ACN Bank</span>
        </div>

        <h2 className="si-title">{fromChat ? 'Verify your identity' : 'Welcome back'}</h2>
        <p className="si-sub">
          {fromChat
            ? 'Sign in to continue — your assistant will pick up right where you left off.'
            : 'Sign in to access your accounts'}
        </p>

        <form onSubmit={handleSubmit} noValidate>
          <div className="si-field">
            <label className="si-label" htmlFor="si-phone">Phone number</label>
            <input
              id="si-phone"
              ref={phoneRef}
              className="si-input"
              type="tel"
              inputMode="tel"
              placeholder="+1 (416) 555-0199"
              value={phone}
              onChange={(e) => setPhone(fmt(e.target.value))}
              autoComplete="tel"
            />
          </div>

          <div className="si-field">
            <label className="si-label" htmlFor="si-pin">
              Mobile PIN <span className="si-label-hint">{PIN_LENGTH} digits</span>
            </label>
            <input
              id="si-pin"
              className="si-input si-pin-input"
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder={'•'.repeat(PIN_LENGTH)}
              maxLength={PIN_LENGTH}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH))}
              autoComplete="current-password"
            />
          </div>

          {error && (
            <p className="si-error" role="alert">{error}</p>
          )}

          <button
            type="submit"
            className={`si-btn${loading ? ' si-btn-loading' : ''}`}
            disabled={loading || !ready}
          >
            {loading
              ? <><span className="si-spinner" aria-hidden="true" /> Signing in…</>
              : 'Sign in'}
          </button>
        </form>

        {/* Live Firestore credentials (customers/{id}/security/profile.mobile_pin) */}
        <p className="si-demo-hint">
          <strong>Demo:</strong> +1 (226) 927-4374 · PIN 2244<br />
          <span className="si-demo-alt">or +1 (217) 858-2973 · PIN 1234</span>
        </p>
      </div>
    </div>
  );
}
