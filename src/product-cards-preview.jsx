// Dev-only preview of the acn-product-cards widget: no CES, no backend.
// Run with: npm run dev, then open http://localhost:5173/acn-bank-demo/product-cards-preview.html
// Every button click is logged under its widget instead of being sent anywhere.
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import ProductCards from './components/ProductCards';

const SAMPLES = {
  'Account comparison (variant: rates)': {
    title: 'Everyday accounts',
    subtitle: 'Pick one to start an application',
    items: [
      { title: 'Everyday Chequing', badge: 'Most popular', headline: '$14.95', headline_label: 'per month, waived with $3,000 balance',
        details: [{ label: 'Opening deposit', value: '$0' }, { label: 'Transactions', value: 'Unlimited' }, { label: 'e-Transfer', value: 'Included' }],
        cta_label: 'Open this account', cta_value: 'I want to open the Everyday Chequing account' },
      { title: 'High-Interest Savings', badge: '4.50% for 6 months', tone: 'positive', headline: '4.50%', headline_label: 'promo for 6 months, then 2.00%',
        details: [{ label: 'Monthly fee', value: '$0' }, { label: 'Minimum balance', value: 'None' }],
        cta_label: 'Open this account', cta_value: 'I want to open the High-Interest Savings account' },
      { title: 'TFSA Savings', headline: '2.25%', headline_label: 'tax-free interest',
        details: [{ label: 'Monthly fee', value: '$0' }, { label: 'Contribution room', value: 'Tracked for you' }],
        cta_label: 'Open this account', cta_value: 'I want to open the TFSA Savings account' },
    ],
    footnote: 'CDIC protects eligible deposits up to $100,000 per depositor per insured category.',
  },
  'GIC terms (variant: rates)': {
    title: 'GIC rates', subtitle: 'Non-redeemable, interest paid at maturity',
    items: [
      { title: '6 months', headline: '3.45%', headline_label: 'per year', details: [{ label: 'Minimum', value: '$500' }, { label: 'Redeemable', value: 'No' }], cta_label: 'Ask about this term', cta_value: 'Tell me about the 6 month GIC' },
      { title: '1 year', badge: 'Highest rate', tone: 'positive', headline: '3.80%', headline_label: 'per year', details: [{ label: 'Minimum', value: '$500' }, { label: 'Redeemable', value: 'No' }], cta_label: 'Ask about this term', cta_value: 'Tell me about the 1 year GIC' },
      { title: '5 years', headline: '3.65%', headline_label: 'per year', details: [{ label: 'Minimum', value: '$500' }, { label: 'Redeemable', value: 'No' }], cta_label: 'Ask about this term', cta_value: 'Tell me about the 5 year GIC' },
    ],
  },
  'Registered accounts (variant: summary)': {
    title: 'Your registered accounts',
    items: [
      { title: 'TFSA', headline: '$41,800.00', headline_label: 'balance', details: [{ label: 'Contribution room 2026', value: '$12,400' }, { label: 'Holdings', value: '2 funds' }], cta_label: 'See holdings', cta_value: 'Show my TFSA holdings' },
      { title: 'RRSP', headline: '$86,420.55', headline_label: 'balance', details: [{ label: 'Contribution room 2026', value: '$25,560' }, { label: 'Holdings', value: '2 funds' }], cta_label: 'See holdings', cta_value: 'Show my RRSP holdings' },
    ],
  },
  'Application status (variant: status)': {
    title: 'Your applications',
    items: [
      { title: 'ACN Cash Back Mastercard', badge: 'Approved', tone: 'positive', headline: '$25,000', headline_label: 'approved credit limit',
        details: [{ label: 'Submitted', value: 'Oct 19' }, { label: 'Reference', value: 'APPL-E035CC' }, { label: 'Next step', value: 'Activate in the app' }],
        cta_label: 'Activate my card', cta_value: 'How do I activate my new card?' },
      { title: 'Personal loan', badge: 'In review', tone: 'warning', headline: '$15,000', headline_label: 'requested',
        details: [{ label: 'Submitted', value: 'Oct 19' }, { label: 'Term', value: '36 months' }],
        cta_label: 'Talk to a specialist', cta_value: 'I would like to talk to a specialist about my loan' },
    ],
  },
  'Trip readiness (variant: checklist)': {
    title: 'Japan trip readiness', subtitle: 'Mar 3 to Mar 17',
    items: [
      { title: 'Before you go', badge: '60% ready', tone: 'warning', details: [
        { label: 'Travel notice on your cards', done: false }, { label: 'Credit limit is enough for the trip', done: true },
        { label: 'International transactions enabled', done: true }, { label: 'Emergency number saved', done: false }, { label: 'ACN Bank app installed', done: true }],
        cta_label: 'Set my travel notice', cta_value: 'Set a travel notice for my trip to Japan' },
      { title: 'Spending plan', headline: '$285', headline_label: 'per day on a $4,000 budget', details: [{ label: 'Foreign transaction fee', value: '2.5%' }, { label: 'Best card', value: 'ACN Infinite Travel Visa' }],
        cta_label: 'Plan my spending', cta_value: 'Help me plan my spending for the trip' },
    ],
  },
  'Explore shelf (variant: shelf)': {
    title: 'What would you like to explore?',
    items: [
      { title: 'Credit cards', description: 'Compare cards and apply in minutes.', cta_label: 'Show me cards', cta_value: 'Show me credit cards' },
      { title: 'Mortgages', description: 'Rates, what you can afford, pre-approval.', cta_label: 'Explore mortgages', cta_value: 'I want to explore mortgages' },
      { title: 'Loans & payment plans', description: 'Personal loans and equal payment plans.', cta_label: 'See options', cta_value: 'I want to see loan options' },
      { title: 'Savings & investing', description: 'GICs, TFSA, RRSP and savings accounts.', cta_label: 'Explore', cta_value: 'I want to explore savings and investing' },
    ],
  },
};

function Section({ title, payload }) {
  const [last, setLast] = useState(null);
  return (
    <div style={{ background: '#EEF1F5', margin: '0 0 28px', maxWidth: 760 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#0056B3', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.6px' }}>{title}</div>
      <ProductCards payload={payload} onCta={setLast} />
      {last && <div style={{ marginTop: 8, fontSize: 12, color: '#475569' }}>onCta sent: <code>{last}</code></div>}
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <div>
    {Object.entries(SAMPLES).map(([title, payload]) => <Section key={title} title={title} payload={payload} />)}
  </div>,
);
