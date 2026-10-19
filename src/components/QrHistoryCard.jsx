import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { subscribeQrTransactions } from '../firebase';

/**
 * QrHistoryCard — live-updating ACN QR Pay history for the signed-in customer.
 *
 * Subscribes via Firestore onSnapshot to customers/{id}/transactions so
 * incoming transfers from the Flutter mobile app (GECXBankingACN) appear
 * immediately without refreshing the browser.
 */
export default function QrHistoryCard() {
  const { isAuthenticated, customer } = useAuth();
  const [rows, setRows] = useState(null); // null = loading, [] = empty, [...] = ok
  const [justReceived, setJustReceived] = useState(null);
  const prevTopIdRef = useRef(null);

  useEffect(() => {
    if (!isAuthenticated || !customer?.customerId) {
      setRows(null);
      prevTopIdRef.current = null;
      return undefined;
    }
    return subscribeQrTransactions(customer.customerId, (list) => {
      const top = list?.[0];
      if (
        prevTopIdRef.current &&
        top?.id &&
        top.id !== prevTopIdRef.current &&
        top.type === 'credit'
      ) {
        setJustReceived(top);
        setTimeout(() => setJustReceived(null), 6000);
      }
      if (top?.id) prevTopIdRef.current = top.id;
      setRows(list || []);
    }, 6);
  }, [isAuthenticated, customer?.customerId]);

  if (!isAuthenticated || !customer?.customerId) return null;
  if (customer.qrEnabled === false) return null;

  return (
    <section className="qrhist-card" aria-label="Recent QR payments">
      <style>{`
        .qrhist-card {
          width: 100%;
          max-width: 390px;
          background: #ffffff;
          border-radius: 20px;
          padding: 22px 20px;
          border: 1px solid #E1E6EB;
          box-shadow:
            0 1px 2px rgba(0, 33, 71, 0.06),
            0 12px 32px rgba(0, 33, 71, 0.08);
          display: flex;
          flex-direction: column;
        }
        .qrhist-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
        }
        .qrhist-title {
          margin: 0;
          font-size: 16px;
          font-weight: 800;
          color: #0B1F33;
        }
        .qrhist-count {
          font-size: 11px;
          color: #0F5132;
          background: #ECFDF5;
          border: 1px solid #A7F3D0;
          padding: 3px 9px;
          border-radius: 999px;
          font-weight: 700;
        }
        .qrhist-toast {
          margin-bottom: 12px;
          padding: 10px 12px;
          border-radius: 12px;
          background: linear-gradient(135deg, #065F46 0%, #047857 100%);
          color: #ffffff;
          font-size: 12px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          animation: qrToastIn 0.25s ease-out;
        }
        @keyframes qrToastIn {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .qrhist-empty {
          padding: 28px 12px;
          text-align: center;
          font-size: 13px;
          color: #66788A;
          background: #F8FAFC;
          border-radius: 12px;
          border: 1px dashed #CBD5E1;
        }
        .qrhist-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 11px 0;
          border-top: 1px solid #F0F5FA;
        }
        .qrhist-row:first-of-type { border-top: none; }
        .qrhist-icon {
          width: 36px; height: 36px;
          border-radius: 10px;
          background: #E6F2F5;
          color: #002147;
          display: flex; align-items: center; justify-content: center;
          font-size: 16px; font-weight: 800;
          flex-shrink: 0;
        }
        .qrhist-icon.credit { background: #E6F5EA; color: #1F7A3A; }
        .qrhist-txt { flex: 1; min-width: 0; text-align: left; }
        .qrhist-name {
          font-size: 13px; font-weight: 700; color: #0B1F33;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .qrhist-sub {
          font-size: 11px; color: #66788A;
        }
        .qrhist-amt {
          font-size: 14px; font-weight: 800;
          font-variant-numeric: tabular-nums;
          white-space: nowrap;
        }
        .qrhist-amt.debit  { color: #0B1F33; }
        .qrhist-amt.credit { color: #1F7A3A; }
      `}</style>

      <header className="qrhist-head">
        <h4 className="qrhist-title">Live QR Payments</h4>
        <span className="qrhist-count">
          {rows === null ? 'Syncing…' : `● Live (${rows.length})`}
        </span>
      </header>

      {justReceived && (
        <div className="qrhist-toast" role="status">
          <span>
            🎉 Received {justReceived.currency || 'CAD'} ${Number(justReceived.amount || 0).toFixed(2)} from {justReceived.counterparty_name || 'ACN Customer'}!
          </span>
        </div>
      )}

      {rows !== null && rows.length === 0 && (
        <div className="qrhist-empty">
          No QR payments yet.<br />
          <span style={{ fontSize: 11, color: '#94A3B8' }}>
            Scan your QR code from the ACN Bank Flutter app to see transfers appear here in real time.
          </span>
        </div>
      )}

      {rows && rows.map((tx) => {
        const isCredit = tx.type === 'credit' || Number(tx.amount) > 0 && tx.category === 'qr_credit';
        const sign = isCredit ? '+' : '−';
        const amt = Math.abs(Number(tx.amount || 0)).toFixed(2);
        const currency = tx.currency || 'CAD';
        const who =
          tx.counterparty_name ||
          tx.merchant ||
          tx.description ||
          (isCredit ? 'ACN Customer' : 'Recipient');
        const rawTs = tx.timestamp || tx.date;
        const when = rawTs
          ? new Date(rawTs).toLocaleString(undefined, {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })
          : 'Just now';
        return (
          <div key={tx.id} className="qrhist-row">
            <div className={`qrhist-icon ${isCredit ? 'credit' : ''}`}>
              {isCredit ? '↓' : '↑'}
            </div>
            <div className="qrhist-txt">
              <div className="qrhist-name">
                {isCredit ? `From ${who}` : `To ${who}`}
              </div>
              <div className="qrhist-sub">{when} · ACN QR Pay</div>
            </div>
            <div className={`qrhist-amt ${isCredit ? 'credit' : 'debit'}`}>
              {sign}{currency} ${amt}
            </div>
          </div>
        );
      })}
    </section>
  );
}

