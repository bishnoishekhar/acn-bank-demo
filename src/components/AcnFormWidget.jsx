import { useState, useRef, useEffect } from 'react';

/* Renders acn-form-input.
 *
 * The CES tool schema (tools/acn-form-input) is the contract, and it calls the
 * field key `id` -- not `field_id`. Reading the wrong key made EVERY field
 * resolve to values[undefined], i.e. one shared slot: typing in any field wrote
 * the same text into all of them, and submit sent that one value N times. Same
 * class of bug for the button (`submit_label`, not `cta_label`) and the submit
 * payload (`submit_utterance`, not `cta_value_prefix`). The older names are
 * still accepted as fallbacks so short legacy forms (PIN, amount) keep working.
 */

// The tool requires `id`; the rest are tolerated for older payloads.
const keyOf = (f) => f.id || f.field_id || f.name || '';

export default function AcnFormWidget({ payload, onSubmit }) {
  const {
    title,
    subtitle,
    fields = [],
    submit_label,
    cta_label,
    submit_utterance,
    cta_value_prefix = '',
  } = payload;

  const submitLabel = submit_label || cta_label || 'Submit';
  const submitPrefix = submit_utterance || cta_value_prefix || '';

  // Seed from whatever the agent prefilled, so the customer is not asked twice.
  const initial = () => {
    const seed = {};
    fields.forEach((f) => {
      const k = keyOf(f);
      if (!k) return;
      if (f.type === 'checkbox') seed[k] = f.value ?? f.default ?? false;
      else if (f.value != null || f.default != null) seed[k] = String(f.value ?? f.default);
    });
    return seed;
  };

  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const firstRef = useRef(null);

  // Enter-to-submit fires inside the same render that produced the keystroke,
  // so state can be one character stale. The ref always has the latest.
  const valuesRef = useRef(null);
  if (valuesRef.current === null) valuesRef.current = initial();

  useEffect(() => {
    setTimeout(() => firstRef.current?.focus(), 100);
  }, []);

  const setField = (k, val) => {
    valuesRef.current = { ...valuesRef.current, [k]: val };
    setValues((prev) => ({ ...prev, [k]: val }));
    if (errors[k]) setErrors((prev) => ({ ...prev, [k]: '' }));
  };

  const handleSubmit = () => {
    const current = { ...values, ...valuesRef.current };
    const errs = {};

    fields.forEach((f) => {
      const k = keyOf(f);
      if (!k) return;
      if (f.type === 'checkbox') return;           // a checkbox is never "empty"
      const val = String(current[k] ?? '').trim();
      if (f.required && !val) {
        errs[k] = f.validation?.error_message || 'This field is required.';
        return;
      }
      if (f.validation?.pattern && val) {
        const re = new RegExp(f.validation.pattern);
        if (!re.test(val)) errs[k] = f.validation.error_message || 'Invalid input.';
      }
      if (f.validation?.min_length && val.length < f.validation.min_length) {
        errs[k] = f.validation.error_message || 'Too short.';
      }
    });

    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setSubmitted(true);

    // The agent parses `submit_utterance:id=value&id=value` BY FIELD ID -- see
    // MTG-03 step 4. Sending bare values left it guessing by position.
    const value = submitPrefix
      ? `${submitPrefix}:${fields
          .map((f) => {
            const k = keyOf(f);
            const v = f.type === 'checkbox'
              ? (current[k] ? 'true' : 'false')
              : String(current[k] ?? '');
            return `${k}=${v}`;
          })
          .join('&')}`
      : fields.map((f) => String(current[keyOf(f)] ?? '')).join(' ');

    const isSensitive = fields.some((f) => f.type === 'tel' || f.type === 'password');
    const displayText = isSensitive
      ? '••••'
      : fields.length > 4
        ? `${title || 'Form'} submitted`
        : fields.map((f) => String(current[keyOf(f)] ?? '')).join(' ').trim();

    onSubmit(value, displayText);
  };

  return (
    <div className="acn-form-widget">
      {title && <div className="acn-form-title">{title}</div>}
      {subtitle && <div className="acn-form-subtitle">{subtitle}</div>}
      <div className="acn-form-fields">
        {fields.map((f, i) => {
          const k = keyOf(f);
          const hasOptions = Array.isArray(f.options) && f.options.length > 0;
          const isSelect = f.type === 'select' || hasOptions;
          const isCheckbox = f.type === 'checkbox';
          const cls = `acn-form-input-el${errors[k] ? ' error' : ''}`;

          return (
            <div key={k || `field-${i}`} className={`acn-form-field${isCheckbox ? ' checkbox' : ''}`}>
              <label className="acn-form-label">
                {f.label}{f.required && <span className="acn-form-req"> *</span>}
              </label>

              {isSelect ? (
                // A `select` type rendered as <input> gave a free-text box where
                // the agent expected one of its options.
                <select
                  ref={i === 0 ? firstRef : null}
                  className={cls}
                  value={values[k] ?? ''}
                  disabled={submitted}
                  onChange={(e) => setField(k, e.target.value)}
                >
                  <option value="">{f.placeholder || 'Select…'}</option>
                  {(f.options || []).map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              ) : isCheckbox ? (
                <input
                  ref={i === 0 ? firstRef : null}
                  className="acn-form-checkbox"
                  type="checkbox"
                  checked={Boolean(values[k])}
                  disabled={submitted}
                  onChange={(e) => setField(k, e.target.checked)}
                />
              ) : (
                <input
                  ref={i === 0 ? firstRef : null}
                  className={cls}
                  type={f.type === 'tel' ? 'password' : (f.type || 'text')}
                  inputMode={f.type === 'tel' || f.type === 'number' ? 'numeric' : undefined}
                  placeholder={f.placeholder || ''}
                  value={values[k] ?? ''}
                  disabled={submitted}
                  onChange={(e) => setField(k, e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !submitted && handleSubmit()}
                />
              )}

              {f.hint && !errors[k] && <span className="acn-form-hint">{f.hint}</span>}
              {errors[k] && <span className="acn-form-error">{errors[k]}</span>}
            </div>
          );
        })}
      </div>
      <button
        className={`acn-form-cta${submitted ? ' submitted' : ''}`}
        onClick={handleSubmit}
        disabled={submitted}
      >
        {submitted ? '✓ Submitted' : submitLabel}
      </button>
    </div>
  );
}
