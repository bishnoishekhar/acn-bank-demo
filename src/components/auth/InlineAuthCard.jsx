import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

export default function InlineAuthCard({ onSuccess, onDismiss }) {
  const { signIn } = useAuth();
  const [phone,   setPhone]   = useState('');
  const [pin,     setPin]     = useState('');
  const [loading, setLoading] = useState(false);
  const [err,     setErr]     = useState('');

  const fmt = (val) => {
    const d = val.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 1) return d;
    if (d.length <= 4) return `+1 (${d.slice(1)}`;
    if (d.length <= 7) return `+1 (${d.slice(1, 4)}) ${d.slice(4)}`;
    return `+1 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  };

  const handleVerify = async () => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 11 || pin.length < 6) {
      setErr('Please enter your full phone number and 6-digit PIN.');
      return;
    }
    setLoading(true);
    setErr('');
    const result = await signIn(`+${digits}`, pin);
    setLoading(false);
    if (result.success) {
      onSuccess?.(result);
    } else {
      setErr('Invalid credentials. Please try again.');
    }
  };

  return (
    <div className="iac acn-msg-enter">
      <div className="iac-header">
        <span className="iac-lock" aria-hidden="true">🔒</span>
        <div>
          <div className="iac-title">Verify your identity</div>
          <div className="iac-sub">To continue, please sign in securely</div>
        </div>
      </div>

      <div className="iac-body">
        <input
          className="iac-input"
          type="tel"
          inputMode="tel"
          placeholder="+1 (416) 555-0199"
          value={phone}
          onChange={(e) => setPhone(fmt(e.target.value))}
          aria-label="Phone number"
        />
        <input
          className="iac-input"
          type="password"
          inputMode="numeric"
          placeholder="PIN (6 digits)"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
          aria-label="PIN"
        />
        {err && <p className="iac-error" role="alert">{err}</p>}
        <button
          className={`iac-btn${loading ? ' loading' : ''}`}
          onClick={handleVerify}
          disabled={loading}
        >
          {loading ? 'Verifying…' : 'Verify & continue →'}
        </button>
        <button className="iac-ghost" onClick={onDismiss}>
          Continue as guest
        </button>
      </div>
    </div>
  );
}
