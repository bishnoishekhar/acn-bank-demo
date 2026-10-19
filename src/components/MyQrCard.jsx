import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { useAuth } from '../context/AuthContext';
import { subscribeCustomerAccounts } from '../firebase';

const PRESET_AMOUNTS = [
  { label: 'Any amount', value: '' },
  { label: '$25',        value: '25' },
  { label: '$50',        value: '50' },
  { label: '$100',       value: '100' },
];

/**
 * MyQrCard — the receive side of ACN QR Pay on the web.
 *
 * Encodes the same base64(JSON) envelope the Flutter MyQrScreen writes:
 *   { type: "ACN_QR_PAY", v: "1", customer_id, display_name, ...(amount ? { amount } : {}) }
 *
 * The Flutter payer app scans it, matches on `type == ACN_QR_PAY`, and
 * routes into the QrPaySheet (pre-filling the amount if present, or opening
 * the numpad at $0.00 when Any amount is selected).
 */
export default function MyQrCard() {
  const { isAuthenticated, customer } = useAuth();
  const canvasRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const [reqAmount, setReqAmount] = useState('');
  const [customOpen, setCustomOpen] = useState(false);
  const [accounts, setAccounts] = useState([]);

  useEffect(() => {
    if (!isAuthenticated || !customer?.customerId) {
      setAccounts([]);
      return undefined;
    }
    return subscribeCustomerAccounts(customer.customerId, (list) => {
      setAccounts(list || []);
    });
  }, [isAuthenticated, customer?.customerId]);

  const chequing =
    accounts.find((a) => String(a.type || '').toLowerCase().includes('cheq')) ||
    accounts[0] ||
    null;

  const cleanAmt = Number(reqAmount) > 0 ? Number(reqAmount).toFixed(2) : '';

  const payloadObj =
    isAuthenticated && customer?.customerId
      ? {
          type: 'ACN_QR_PAY',
          v: '1',
          customer_id: customer.customerId,
          display_name: customer.legalName || customer.prefName || 'Customer',
          ...(cleanAmt ? { amount: Number(cleanAmt) } : {}),
        }
      : null;

  const payload = payloadObj ? btoa(JSON.stringify(payloadObj)) : null;

  useEffect(() => {
    if (!payload || !canvasRef.current) return;
    QRCode.toCanvas(
      canvasRef.current,
      payload,
      {
        width: 224,
        margin: 1,
        errorCorrectionLevel: 'M',
        color: {
          dark: '#002147', // ACN Primary Navy
          light: '#FFFFFFFF',
        },
      },
      (err) => {
        if (err) console.warn('[MyQrCard] failed to render QR', err);
      },
    );
  }, [payload]);

  async function copyPayload() {
    if (!payload) return;
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  }

  if (!isAuthenticated || !customer?.customerId) return null;
  if (customer.qrEnabled === false) return null;

  return (
    <section className="myqr-card" aria-label="My QR code">
      <style>{`
        .myqr-card {
          width: 100%;
          max-width: 390px;
          background: #ffffff;
          border-radius: 20px;
          padding: 22px 20px 20px;
          box-shadow:
            0 1px 2px rgba(0, 33, 71, 0.06),
            0 12px 32px rgba(0, 33, 71, 0.10);
          text-align: center;
          border: 1px solid #E1E6EB;
        }
        .myqr-top-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .myqr-tag {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          background: #E6F2F5;
          color: #002147;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.6px;
          text-transform: uppercase;
        }
        .myqr-live-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #10B981;
          box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.2);
        }
        .myqr-bal-pill {
          font-size: 11px;
          font-weight: 700;
          color: #0F5132;
          background: #ECFDF5;
          border: 1px solid #A7F3D0;
          padding: 4px 10px;
          border-radius: 999px;
          font-variant-numeric: tabular-nums;
        }
        .myqr-name {
          margin: 12px 0 2px;
          font-size: 19px;
          font-weight: 800;
          color: #0B1F33;
        }
        .myqr-sub {
          font-size: 12px;
          color: #66788A;
        }
        .myqr-chips {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 6px;
          margin: 12px 0 4px;
        }
        .myqr-chip {
          padding: 5px 10px;
          border-radius: 999px;
          border: 1px solid #CBD5E1;
          background: #F8FAFC;
          color: #334155;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .myqr-chip.active {
          background: #002147;
          color: #ffffff;
          border-color: #002147;
        }
        .myqr-custom-row {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          margin-top: 8px;
        }
        .myqr-custom-input {
          width: 120px;
          padding: 5px 10px;
          border-radius: 8px;
          border: 1px solid #CBD5E1;
          font-size: 12px;
          font-weight: 700;
          text-align: center;
          color: #0F172A;
        }
        .myqr-canvas-wrap {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          margin: 12px 0 10px;
          padding: 12px;
          background: #F8F9FA;
          border-radius: 14px;
          border: 1px dashed #CBD5E1;
        }
        .myqr-amt-badge {
          margin-top: 8px;
          padding: 3px 10px;
          border-radius: 999px;
          background: #002147;
          color: #ffffff;
          font-size: 12px;
          font-weight: 800;
        }
        .myqr-brand {
          font-size: 11px;
          font-weight: 800;
          color: #002147;
          letter-spacing: 0.9px;
          margin-bottom: 12px;
        }
        .myqr-actions {
          display: flex;
          gap: 10px;
        }
        .myqr-btn {
          flex: 1;
          padding: 10px 12px;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          border: none;
          transition: transform 0.05s ease, opacity 0.15s ease;
        }
        .myqr-btn:active { transform: translateY(1px); }
        .myqr-btn-outline {
          background: #ffffff;
          color: #002147;
          border: 1px solid #B6C2CE;
        }
        .myqr-btn-primary {
          background: #002147;
          color: #ffffff;
        }
      `}</style>

      <div className="myqr-top-row">
        <span className="myqr-tag">
          <span className="myqr-live-dot" aria-hidden="true" />
          ACN QR Pay · Receive
        </span>
        {chequing && (
          <span className="myqr-bal-pill" title="Updates automatically when a QR transfer arrives">
            Chequing: CAD ${Number(chequing.balance || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        )}
      </div>

      <h3 className="myqr-name">{customer.legalName || customer.prefName}</h3>
      <div className="myqr-sub">
        ID: <code>{customer.customerId}</code>
        {customer.username ? ` · ${customer.username.startsWith('@') ? customer.username : `@${customer.username}`}` : ''}
      </div>

      {/* Optional request amount chips */}
      <div className="myqr-chips" role="group" aria-label="Optional request amount">
        {PRESET_AMOUNTS.map((p) => {
          const isActive = !customOpen && reqAmount === p.value;
          return (
            <button
              key={p.label}
              type="button"
              className={`myqr-chip${isActive ? ' active' : ''}`}
              onClick={() => {
                setCustomOpen(false);
                setReqAmount(p.value);
              }}
            >
              {p.label}
            </button>
          );
        })}
        <button
          type="button"
          className={`myqr-chip${customOpen ? ' active' : ''}`}
          onClick={() => setCustomOpen((v) => !v)}
        >
          Custom $
        </button>
      </div>

      {customOpen && (
        <div className="myqr-custom-row">
          <input
            type="number"
            min="1"
            step="0.01"
            placeholder="Amount (CAD)"
            className="myqr-custom-input"
            value={reqAmount}
            onChange={(e) => setReqAmount(e.target.value)}
          />
        </div>
      )}

      <div className="myqr-canvas-wrap">
        <canvas ref={canvasRef} aria-label="Your ACN QR code" />
        {cleanAmt && (
          <span className="myqr-amt-badge">Requesting CAD ${cleanAmt}</span>
        )}
      </div>

      <div className="myqr-brand">SCAN WITH ACN BANK MOBILE APP TO TRANSFER</div>

      <div className="myqr-actions">
        <button
          type="button"
          className="myqr-btn myqr-btn-outline"
          onClick={copyPayload}
        >
          {copied ? 'Copied QR Code ✓' : 'Copy QR payload'}
        </button>
        <button
          type="button"
          className="myqr-btn myqr-btn-primary"
          onClick={() => {
            const url = canvasRef.current?.toDataURL('image/png');
            if (!url) return;
            const a = document.createElement('a');
            a.href = url;
            a.download = `acn-qr-${customer.customerId}.png`;
            a.click();
          }}
        >
          Download PNG
        </button>
      </div>
    </section>
  );
}

