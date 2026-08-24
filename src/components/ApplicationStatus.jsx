// ─────────────────────────────────────────────────────────────────────────────
//  Application status page.
//
//  Reached from the link in both applicant emails:
//    /acn-bank-demo/?application=APP_20260820_7F3A9C&token=<opaque>
//
//  The token is the authorisation — there is no sign-in here, because the
//  applicant may not be a customer yet. Everything rendered comes straight from
//  the card_applications record, so the page and the emails can never disagree.
//
//  Deliberately NOT shown: the internal reason codes, the fraud verdict, and
//  anything about the identity checks. A declined or referred applicant sees the
//  outcome and what they can do next, not the machinery behind it.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { fetchApplicationStatus } from '../firebase';

/* One entry per stored status. Copy lives here so it matches the email
   templates in the CES send_application_email tool. */
const STATUS_VIEW = {
  received: {
    label: 'Received',
    tone: 'pending',
    step: 1,
    headline: "We've got your application",
    detail:
      'It is queued for review. An ACN Bank agent will come back to you by email as soon as there is news — you do not need to do anything.',
  },
  under_review: {
    label: 'Under review',
    tone: 'pending',
    step: 2,
    headline: 'Your application is being reviewed',
    detail:
      'We are checking the details and documents you sent. We will email you the moment this is finished.',
  },
  approved: {
    label: 'Approved',
    tone: 'good',
    step: 3,
    headline: 'Your application was approved',
    detail:
      'In a live deployment your card would now be produced and mailed to you. In this demonstration no physical card is issued.',
  },
  declined: {
    label: 'Not approved',
    tone: 'bad',
    step: 3,
    headline: 'We could not approve this application',
    detail:
      'This decision applies to this card only. Other ACN Bank cards may still be open to you — the assistant can talk you through the alternatives.',
  },
  referred: {
    label: 'With a specialist',
    tone: 'pending',
    step: 2,
    headline: 'An ACN Bank specialist is reviewing your application',
    detail:
      'This is a routine additional check. We will email you as soon as it is complete.',
  },
  abandoned: {
    label: 'Not completed',
    tone: 'neutral',
    step: 1,
    headline: 'This application was not completed',
    detail:
      'You can start again at any time, and the assistant can pick up where you left off.',
  },
};

const STEPS = ['Received', 'In review', 'Decision'];

const fmtMoney = (v) =>
  Number(v) > 0 ? `CAD ${Number(v).toLocaleString('en-CA')}` : null;

const fmtDate = (v) => {
  if (!v) return null;
  const d = v?.toDate ? v.toDate() : new Date(v);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString('en-CA', { day: 'numeric', month: 'long', year: 'numeric' });
};

export default function ApplicationStatus({ applicationId, token, onExit }) {
  const [state, setState] = useState({ phase: 'loading' });

  useEffect(() => {
    let alive = true;
    fetchApplicationStatus(applicationId, token).then((result) => {
      if (!alive) return;
      setState(
        result.ok
          ? { phase: 'ready', application: result.application }
          : { phase: result.reason },
      );
    });
    return () => { alive = false; };
  }, [applicationId, token]);

  if (state.phase === 'loading') {
    return (
      <main className="appstatus">
        <p className="appstatus-loading">Looking up your application…</p>
      </main>
    );
  }

  if (state.phase !== 'ready') {
    return (
      <main className="appstatus">
        <div className="appstatus-card">
          <h1 className="appstatus-headline">We couldn't find that application</h1>
          <p className="appstatus-detail">
            {state.phase === 'error'
              ? 'Something went wrong on our side. Please try the link again shortly.'
              : 'The link may have expired or been mistyped. Check the most recent email we sent you, or ask the assistant.'}
          </p>
          <button className="appstatus-btn" onClick={onExit}>
            Go to ACN Bank
          </button>
        </div>
      </main>
    );
  }

  const app = state.application;
  const view = STATUS_VIEW[app.status] ?? {
    label: 'Unavailable',
    tone: 'neutral',
    step: 1,
    headline: 'Status unavailable',
    detail: 'We could not read the status of this application.',
  };

  const income = fmtMoney(app.verified_annual_income || app.declared_annual_income);
  const submitted = fmtDate(app.created_at);
  const updated = fmtDate(app.updated_at);

  return (
    <main className="appstatus">
      <div className="appstatus-card">
        <p className="appstatus-eyebrow">ACN Bank · Application status</p>

        <div className={`appstatus-badge ${view.tone}`}>{view.label}</div>

        <h1 className="appstatus-headline">{view.headline}</h1>
        <p className="appstatus-detail">{view.detail}</p>

        {/* Progress — three steps, because more granularity would imply we know
            more about timing than we do. */}
        <ol className="appstatus-steps" aria-label="Application progress">
          {STEPS.map((label, i) => (
            <li
              key={label}
              className={
                i + 1 < view.step ? 'done' : i + 1 === view.step ? 'current' : ''
              }
            >
              <span className="appstatus-dot" aria-hidden="true" />
              {label}
            </li>
          ))}
        </ol>

        <dl className="appstatus-facts">
          <div>
            <dt>Reference</dt>
            <dd>{app.application_id}</dd>
          </div>
          <div>
            <dt>Card applied for</dt>
            <dd>{app.selected_product_name || '—'}</dd>
          </div>
          {app.full_name && (
            <div>
              <dt>Applicant</dt>
              <dd>{app.full_name}</dd>
            </div>
          )}
          {income && (
            <div>
              <dt>Income used</dt>
              <dd>{income}</dd>
            </div>
          )}
          {submitted && (
            <div>
              <dt>Submitted</dt>
              <dd>{submitted}</dd>
            </div>
          )}
          {updated && (
            <div>
              <dt>Last updated</dt>
              <dd>{updated}</dd>
            </div>
          )}
        </dl>

        <button className="appstatus-btn" onClick={onExit}>
          Continue to ACN Bank
        </button>

        <p className="appstatus-foot">
          Questions about this application? Ask the ACN Bank assistant and quote
          your reference.
        </p>
      </div>
    </main>
  );
}
