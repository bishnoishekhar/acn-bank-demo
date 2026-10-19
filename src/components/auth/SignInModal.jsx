import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';

// Firestore stores a 4-digit mobile_pin (customers/{id}/security/profile).
const PIN_LENGTH = 4;

const DEMO_ACCOUNTS = [
  { label: 'Chander',  phone: '+1 (226) 927-4374', rawPhone: '12269274374', pin: '2244', sub: '226-927-4374 · PIN 2244' },
  { label: 'Intan',    phone: '+1 (519) 555-1234', rawPhone: '15195551234', pin: '1234', sub: '519-555-1234 · PIN 1234' },
  { label: 'Emiliano', phone: '+1 (217) 858-2973', rawPhone: '12178582973', pin: '1234', sub: '217-858-2973 · PIN 1234' },
  { label: 'Sophie',   phone: '+1 (416) 555-0144', rawPhone: '14165550144', pin: '9876', sub: '416-555-0144 · PIN 9876' },
];

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
    let raw = val.replace(/\D/g, '');
    if (!raw) return '';
    // If user starts typing an area code (e.g. 226..., 416..., 519...) without
    // a leading '1', prepend '1' automatically so the first digit is never lost.
    if (raw[0] !== '1') {
      raw = `1${raw}`;
    }
    const d = raw.slice(0, 11);
    if (d.length <= 1) return '+1 ';
    if (d.length <= 4) return `+1 (${d.slice(1)}`;
    if (d.length <= 7) return `+1 (${d.slice(1, 4)}) ${d.slice(4)}`;
    return `+1 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  };

  const getTenDigits = (val) => {
    const d = val.replace(/\D/g, '');
    if (d.length === 11 && d.startsWith('1')) return d.slice(1);
    return d.slice(-10);
  };

  const performSignIn = async (phoneVal, pinVal) => {
    const ten = getTenDigits(phoneVal);
    if (ten.length < 10 || pinVal.length < PIN_LENGTH) return;
    setLoading(true);
    const result = await signIn(`+1${ten}`, pinVal);
    setLoading(false);
    if (result.success) {
      onSuccess?.(result.customer);
      onClose();
    }
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    await performSignIn(phone, pin);
  };

  const handleQuickDemo = async (acct) => {
    clearError();
    setPhone(acct.phone);
    setPin(acct.pin);
    await performSignIn(acct.rawPhone, acct.pin);
  };

  if (!isOpen) return null;

  const ready = getTenDigits(phone).length === 10 && pin.length >= PIN_LENGTH;
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
            : 'Sign in to access your accounts & ACN QR Pay'}
        </p>

        <form onSubmit={handleSubmit} noValidate>
          <div className="si-field">
            <label className="si-label" htmlFor="si-phone">Phone or Account number</label>
            <input
              id="si-phone"
              ref={phoneRef}
              className="si-input"
              type="tel"
              inputMode="tel"
              placeholder="+1 (226) 927-4374"
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

        {/* Quick 1-click demo profiles */}
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid rgba(148,163,184,0.22)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8, textAlign: 'center' }}>
            1-Click Demo Sign In
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {DEMO_ACCOUNTS.map((acct) => (
              <button
                key={acct.label}
                type="button"
                disabled={loading}
                onClick={() => handleQuickDemo(acct)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  padding: '7px 10px',
                  borderRadius: 8,
                  border: '1px solid #E2E8F0',
                  background: '#F8FAFC',
                  cursor: loading ? 'wait' : 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 700, color: '#0F172A' }}>{acct.label}</span>
                <span style={{ fontSize: 10, color: '#64748B' }}>{acct.sub}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

