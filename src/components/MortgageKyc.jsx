// Renders acn-mortgage-kyc — the KYC intake form for mortgage pre-approval.
// One form, batched fields, single Submit that ships a JSON payload back.
import { useState } from 'react';

export default function MortgageKyc({ payload, onCta }) {
  const fields = payload?.fields || [];
  const [values, setValues] = useState(() => {
    const initial = {};
    fields.forEach((f) => {
      initial[f.field_id] = f.prefill_value != null ? String(f.prefill_value) : '';
    });
    return initial;
  });
  const [touched, setTouched] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const BRAND = '#0056B3';
  const RED = '#DC2626';

  const setVal = (id, v) => setValues((prev) => ({ ...prev, [id]: v }));
  const markTouched = (id) => setTouched((prev) => ({ ...prev, [id]: true }));

  const isMissing = (f) => {
    if (!f.required) return false;
    const v = values[f.field_id];
    return v === undefined || v === null || String(v).trim() === '';
  };

  const missingFields = fields.filter(isMissing);
  const canSubmit = missingFields.length === 0;

  const handleSubmit = () => {
    if (!canSubmit || submitting) {
      // Mark everything touched so validation errors surface.
      const t = {};
      fields.forEach((f) => { t[f.field_id] = true; });
      setTouched(t);
      return;
    }
    setSubmitting(true);
    // Coerce numeric-looking fields to numbers for the agent.
    const coerced = {};
    fields.forEach((f) => {
      const raw = values[f.field_id];
      if (f.input_kind === 'number' || f.input_kind === 'currency_cad') {
        const n = Number(String(raw).replace(/[^0-9.-]/g, ''));
        coerced[f.field_id] = Number.isFinite(n) ? n : 0;
      } else {
        coerced[f.field_id] = raw ?? '';
      }
    });
    const base = String(payload?.submit_cta_value || 'mortgage_kyc_submit');
    onCta && onCta(`${base}:${JSON.stringify(coerced)}`);
  };

  const labelStyle = { display: 'block', fontSize: '11.5px', color: '#66788A', marginBottom: '4px', fontWeight: 600 };
  const inputStyle = {
    width: '100%', padding: '9px 11px', border: '1px solid #E2E6EA', borderRadius: '8px',
    fontSize: '13px', color: '#0B1F33', background: '#fff', boxSizing: 'border-box',
  };
  const errStyle = { fontSize: '10.5px', color: RED, marginTop: '3px' };
  const helpStyle = { fontSize: '10.5px', color: '#9AAABD', marginTop: '3px' };

  return (
    <div style={{
      background: '#fff', borderRadius: '14px', border: '1px solid #E2E6EA',
      marginBottom: '4px', maxWidth: '86%', boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
    }}>
      {/* Header */}
      <div style={{ padding: '12px 14px 8px', borderBottom: '1px solid #E2E6EA' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: '#0B1F33' }}>
          {payload?.title || 'A few last details'}
        </div>
        <div style={{ fontSize: '11px', color: '#66788A', marginTop: '2px' }}>
          {payload?.subtitle || 'Used only for this estimate.'}
        </div>
      </div>

      {/* Fields */}
      <div style={{ padding: '12px 14px', display: 'grid', gap: '12px' }}>
        {fields.map((f) => {
          const missing = touched[f.field_id] && isMissing(f);
          const prefix = f.input_kind === 'currency_cad' ? 'CAD ' : '';
          return (
            <div key={f.field_id}>
              <label style={labelStyle}>
                {f.label}
                {f.required && <span style={{ color: RED, marginLeft: '2px' }}>*</span>}
              </label>
              {f.input_kind === 'select' ? (
                <select
                  value={values[f.field_id] || ''}
                  onChange={(e) => setVal(f.field_id, e.target.value)}
                  onBlur={() => markTouched(f.field_id)}
                  style={inputStyle}
                >
                  <option value="">— Select —</option>
                  {(f.options || []).map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              ) : (
                <div style={{ position: 'relative' }}>
                  {prefix && (
                    <span style={{
                      position: 'absolute', left: '11px', top: '9px', fontSize: '13px',
                      color: '#9AAABD', pointerEvents: 'none',
                    }}>{prefix}</span>
                  )}
                  <input
                    type={f.input_kind === 'number' || f.input_kind === 'currency_cad' ? 'number' : 'text'}
                    inputMode={f.input_kind === 'currency_cad' ? 'decimal' : undefined}
                    min={f.min}
                    max={f.max}
                    value={values[f.field_id] || ''}
                    onChange={(e) => setVal(f.field_id, e.target.value)}
                    onBlur={() => markTouched(f.field_id)}
                    style={{ ...inputStyle, paddingLeft: prefix ? '46px' : '11px' }}
                    placeholder={f.help_text || ''}
                  />
                </div>
              )}
              {f.help_text && <div style={helpStyle}>{f.help_text}</div>}
              {missing && <div style={errStyle}>Required</div>}
            </div>
          );
        })}
      </div>

      {/* Submit CTA */}
      <div style={{ padding: '4px 14px 14px' }}>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          style={{
            width: '100%', padding: '12px', border: 'none', borderRadius: '10px',
            background: submitting ? '#9AAABD' : BRAND, color: '#fff',
            fontSize: '13.5px', fontWeight: 700, cursor: submitting ? 'default' : 'pointer',
          }}
        >
          {payload?.submit_cta_label || 'See my pre-approval'}
        </button>
      </div>
    </div>
  );
}
