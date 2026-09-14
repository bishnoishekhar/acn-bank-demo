import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { useAuth } from '../context/AuthContext';

/**
 * MyQrCard — the receive side of ACN QR Pay on the web.
 *
 * Encodes the same base64(JSON) envelope the Flutter MyQrScreen writes:
 *   { type: "ACN_QR_PAY", v: "1", customer_id, display_name }
 *
 * The Flutter payer app scans it, matches on `type == ACN_QR_PAY`, and
 * routes into the QrPaySheet for amount entry. Non-ACN QRs continue to
 * the payer's generic bottom sheet unchanged.
 *
 * Renders inline in the Dashboard only when a customer is signed in — a
 * guest has no id / name to encode.
 */
export default function MyQrCard() {
  const { isAuthenticated, customer } = useAuth();
  const canvasRef = useRef(null);
  const [copied, setCopied] = useState(false);

  // Build the envelope the same way the Flutter side does — keep both
  // writers in lockstep so a QR generated on either surface scans on the
  // other. Bump `v` on any breaking change.
  const payload =
    isAuthenticated && customer?.customerId
      ? btoa(
          JSON.stringify({
            type: 'ACN_QR_PAY',
            v: '1',
            customer_id: customer.customerId,
            display_name: customer.legalName || customer.prefName || 'Customer',
          })
        )
      : null;

  useEffect(() => {
    if (!payload || !canvasRef.current) return;
    QRCode.toCanvas(
      canvasRef.current,
      payload,
      {
        width: 240,
        margin: 1,
        errorCorrectionLevel: 'M',
        color: {
          dark: '#002147', // ACN Primary Navy
          light: '#FFFFFFFF',
        },
      },
      (err) => {
        if (err) console.warn('[MyQrCard] failed to render QR', err);
      }
    );
  }, [payload]);

  async function copyPayload() {
    if (!payload) return;
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard permissions can be strict in some browsers — silent fail
      // is fine, the QR itself is still visible for phone-camera scans.
    }
  }

  if (!isAuthenticated || !customer?.customerId) return null;
  // qr_enabled: false on the customer doc hides MyQr entirely — the receive
  // side is opt-in and this is the single switch that turns it off. Default
  // is true (see firebase.js) so the demo works without the seed script.
  if (customer.qrEnabled === false) return null;

  return (
    <section className="myqr-card" aria-label="My QR code">
      <style>{`
        .myqr-card {
          margin: 32px auto 48px;
          max-width: 360px;
          background: #ffffff;
          border-radius: 20px;
          padding: 24px 20px 20px;
          box-shadow:
            0 1px 2px rgba(0, 33, 71, 0.06),
            0 12px 32px rgba(0, 33, 71, 0.10);
          text-align: center;
          border: 1px solid #E1E6EB;
        }
        .myqr-tag {
          display: inline-block;
          padding: 4px 10px;
          background: #E6F2F5;
          color: #002147;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.6px;
          text-transform: uppercase;
        }
        .myqr-name {
          margin: 10px 0 2px;
          font-size: 18px;
          font-weight: 800;
          color: #0B1F33;
        }
        .myqr-sub {
          font-size: 12px;
          color: #66788A;
        }
        .myqr-canvas-wrap {
          display: flex;
          justify-content: center;
          margin: 16px 0 12px;
          padding: 12px;
          background: #F8F9FA;
          border-radius: 14px;
        }
        .myqr-brand {
          font-size: 11px;
          font-weight: 800;
          color: #002147;
          letter-spacing: 1.1px;
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

      <span className="myqr-tag">ACN QR Pay</span>
      <h3 className="myqr-name">{customer.legalName || customer.prefName}</h3>
      <div className="myqr-sub">Show this to receive a payment</div>

      <div className="myqr-canvas-wrap">
        <canvas ref={canvasRef} aria-label="Your ACN QR code" />
      </div>

      <div className="myqr-brand">SCAN WITH ACN BANK APP</div>

      <div className="myqr-actions">
        <button
          type="button"
          className="myqr-btn myqr-btn-outline"
          onClick={copyPayload}
        >
          {copied ? 'Copied ✓' : 'Copy payload'}
        </button>
        <button
          type="button"
          className="myqr-btn myqr-btn-primary"
          onClick={() => {
            // Download-as-PNG hook. Same "Share" spot as the Flutter card so
            // the layout matches; on web the natural affordance is download.
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
