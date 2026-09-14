import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { fetchQrTransactions } from '../firebase';

/**
 * QrHistoryCard — compact ACN QR Pay history for the signed-in customer.
 *
 * Reads customers/{id}/transactions filtered by category IN ("qr_transfer",
 * "qr_credit") — the categories the Fund Transfer Agent writes for QR flows
 * (see Daily_Banking_Fund_Transfer_Agent instruction, step 8 + 9b).
 *
 * Guest / qr_enabled == false → renders null (nothing shown).
 */
export default function QrHistoryCard() {
  const { isAuthenticated, customer } = useAuth();
  const [rows, setRows] = useState(null); // null = loading, [] = empty, [...] = ok
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!isAuthenticated || !customer?.customerId) {
      setRows(null);
      return;
    }
    let cancelled = false;
    fetchQrTransactions(customer.customerId, 5)
      .then((list) => { if (!cancelled) setRows(list); })
      .catch((e) => { if (!cancelled) { setErr(e.message); setRows([]); } });
    return () => { cancelled = true; };
  }, [isAuthenticated, customer?.customerId]);

  if (!isAuthenticated || !customer?.customerId) return null;
  if (customer.qrEnabled === false) return null;

  return (
    <section className="qrhist-card" aria-label="Recent QR payments">
      <style>{`
        .qrhist-card {
          margin: 0 auto 48px;
          max-width: 360px;
          background: #ffffff;
          border-radius: 20px;
          padding: 20px;
          border: 1px solid #E1E6EB;
          box-shadow: 0 1px 2px rgba(0, 33, 71, 0.04);
        }
        .qrhist-head {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          margin-bottom: 12px;
        }
        .qrhist-title {
          margin: 0;
          font-size: 15px;
          font-weight: 800;
          color: #0B1F33;
        }
        .qrhist-count {
          font-size: 11px;
          color: #66788A;
          font-weight: 600;
        }
        .qrhist-empty {
          padding: 16px 0;
          text-align: center;
          font-size: 13px;
          color: #66788A;
        }
        .qrhist-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 0;
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
        }
        .qrhist-icon.credit { background: #E6F5EA; color: #1F7A3A; }
        .qrhist-txt { flex: 1; min-width: 0; }
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
        }
        .qrhist-amt.debit  { color: #0B1F33; }
        .qrhist-amt.credit { color: #1F7A3A; }
      `}</style>

      <header className="qrhist-head">
        <h4 className="qrhist-title">Recent QR payments</h4>
        <span className="qrhist-count">
          {rows === null ? 'Loading…' : `${rows.length} shown`}
        </span>
      </header>

      {rows === null && null}
      {rows !== null && rows.length === 0 && (
        <div className="qrhist-empty">
          {err ? "Couldn't load history." : 'No QR payments yet.'}
        </div>
      )}

      {rows && rows.map((tx) => {
        const isCredit = tx.type === 'credit';
        const sign = isCredit ? '+' : '−';
        const amt = Number(tx.amount || 0).toFixed(2);
        const currency = tx.currency || 'CAD';
        const who = tx.counterparty_name || (isCredit ? 'Someone' : 'Recipient');
        // timestamp is an ISO string from the agent
        const when = tx.timestamp
          ? new Date(tx.timestamp).toLocaleDateString(undefined, {
              month: 'short', day: 'numeric',
            })
          : '';
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
              {sign}{currency} {amt}
            </div>
          </div>
        );
      })}
    </section>
  );
}
