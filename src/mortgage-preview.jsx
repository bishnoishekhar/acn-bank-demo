// Dev-only preview harness for the mortgage widgets — no CES, no backend.
// Run with: npm run dev, then open http://localhost:5173/mortgage-preview.html
// (port may differ; check the terminal output).
//
// Renders all four mortgage widgets stacked with realistic mock payloads so
// you can drag sliders, pick rates, and click suggestions and see exactly
// what a customer would see. Every onCta call is logged to the panel below
// each widget instead of being sent anywhere, so this is fully offline.
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import MortgageCalculator from './components/MortgageCalculator';
import MortgageAffordability from './components/MortgageAffordability';
import MortgageRateShelf from './components/MortgageRateShelf';
import MortgageNudge from './components/MortgageNudge';
import LoanPreapproval from './components/LoanPreapproval';
import MobileHandoff from './components/MobileHandoff';

function Section({ title, children }) {
  const [lastCta, setLastCta] = useState(null);
  return (
    <div style={{
      background: '#fff', borderRadius: '14px', padding: '20px', margin: '0 0 28px',
      boxShadow: '0 1px 4px rgba(0,0,0,0.08)', maxWidth: '460px',
    }}>
      <div style={{ fontSize: '13px', fontWeight: 700, color: '#0056B3', marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {title}
      </div>
      {typeof children === 'function' ? children(setLastCta) : children}
      {lastCta && (
        <div style={{
          marginTop: '14px', padding: '10px 12px', background: '#F0F5FA', borderRadius: '8px',
          fontSize: '11px', color: '#33608F', fontFamily: 'monospace', wordBreak: 'break-all',
        }}>
          onCta fired: {lastCta}
        </div>
      )}
    </div>
  );
}

const rateOptions = [
  { product_id: 'ACN_FIXED_5Y_CLOSED', name: '5-year fixed closed', rate_type: 'fixed', term_years: 5, rate_pct: 4.09 },
  { product_id: 'ACN_VARIABLE_5Y_CLOSED', name: '5-year variable closed', rate_type: 'variable', term_years: 5, rate_pct: 3.35 },
];

const shelfPayload = {
  title: 'Choose your rate',
  payment_frequency_label: 'Monthly',
  payments_per_year: 12,
  prime_rate_pct: 4.45,
  rate_hold_days: 120,
  products: [
    {
      product_id: 'ACN_FIXED_5Y_CLOSED', name: '5-year fixed closed', rate_type: 'fixed', term_years: 5,
      rate_pct: 4.09, rate_basis: 'Fixed for 5 years, compounded semi-annually',
      payment_per_period_cad: 2760.73, monthly_equivalent_cad: 2760.73,
      blurb: 'Your payment does not move for five years.', badge: 'Payment locked', recommended: true,
    },
    {
      product_id: 'ACN_VARIABLE_5Y_CLOSED', name: '5-year variable closed', rate_type: 'variable', term_years: 5,
      rate_pct: 3.35, rate_basis: 'Prime 4.45% minus 1.1%',
      payment_per_period_cad: 2561.60, monthly_equivalent_cad: 2561.60,
      blurb: 'Moves with our prime rate. Lower today, convertible to fixed any time.',
      badge: 'Lowest today', recommended: false,
    },
    {
      product_id: 'ACN_FIXED_3Y_CLOSED', name: '3-year fixed closed', rate_type: 'fixed', term_years: 3,
      rate_pct: 4.24, rate_basis: 'Fixed for 3 years, compounded semi-annually',
      payment_per_period_cad: 2803.38, monthly_equivalent_cad: 2803.38,
      blurb: 'A shorter commitment if you expect rates to fall before you renew.',
      badge: '', recommended: false,
    },
  ],
  variable_projection: [
    { month: 0, label: 'Today', rate_pct: 3.35 },
    { month: 4, label: 'In 4 months', rate_pct: 3.60 },
    { month: 10, label: 'In 10 months', rate_pct: 4.10 },
    { month: 28, label: 'In 28 months', rate_pct: 4.35 },
    { month: 60, label: 'In 60 months', rate_pct: 4.35 },
  ],
  variable_projection_disclaimer: 'A projection based on published forward rates, not a promise.',
  break_even: {
    break_even_month: 31, horizon_months: 60, crosses_within_horizon: true,
    variable_advantage_over_horizon_cad: -4622,
    summary: 'On this projection variable costs more than fixed from month 31, ending about CAD 4,622 behind across the term.',
  },
  confirm_cta_label: 'Continue with {product}',
  confirm_cta_value: 'mortgage_rate_select',
};

const nudgePayload = {
  suggestions: [
    {
      suggestion_id: 'cmhc_avoidance', kind: 'down_payment',
      title: 'Reaching 20 percent down would remove the insurance premium',
      body: 'At 15 percent down your mortgage has to be insured, which adds CAD 15,470 to the balance and you pay interest on it for the full term. Another CAD 32,500 would take you to 20 percent and remove it entirely. Would you like to see that side by side?',
      evidence: [
        { label: 'Your down payment', value: '15 percent' },
        { label: 'Insurance premium', value: 'CAD 15,470' },
        { label: 'More needed for 20 percent', value: 'CAD 32,500' },
      ],
      cta_label: 'Compare at 20 percent down', cta_value: 'mortgage_suggestion_accept:cmhc_avoidance',
      decline_label: 'Not now', decline_value: 'mortgage_suggestion_decline:cmhc_avoidance',
    },
    {
      suggestion_id: 'rate_hold', kind: 'rate_hold',
      title: 'We can hold this rate for 120 days',
      body: 'With a pre-approval we can hold 4.09 percent for 120 days while you shop. If rates fall before you close you get the lower one. Holding a rate does not commit you to borrowing. Would you like me to note the hold on your file?',
      evidence: [
        { label: 'Rate held', value: '4.09 percent' },
        { label: 'For', value: '120 days' },
        { label: 'Commitment', value: 'none' },
      ],
      cta_label: 'Hold my rate', cta_value: 'mortgage_suggestion_accept:rate_hold',
      decline_value: 'mortgage_suggestion_decline:rate_hold',
    },
  ],
};

const preapprovalPayload = {
  loan_kind: 'mortgage', verdict: 'pre_approved',
  headline: 'Based on the numbers you shared, you look pre-approved for a monthly of around CAD 2,760.73.',
  monthly_payment_cad: 2760.73, principal_cad: 520000, tenure_label: '25 years',
  interest_rate_pct: 4.09, product_name: 'fixed mortgage estimate', is_provisional: true,
  breakdown: [
    { label: 'Property price', value: 'CAD 650,000' },
    { label: 'Down payment', value: 'CAD 130,000 (20%)' },
    { label: 'Loan-to-value', value: '80%' },
    { label: 'Rate', value: '4.09% fixed' },
    { label: 'Qualified at', value: '6.09%' },
    { label: 'Gross debt service', value: '21.7%' },
    { label: 'Total debt service', value: '21.7%' },
  ],
  primary_cta_label: 'Review in the app', primary_cta_value: 'loan_confirm_review',
  secondary_cta_label: 'Adjust numbers', secondary_cta_value: 'mortgage_change_numbers',
};

const handoffPayload = {
  title: 'Finish in the ACN Bank app',
  body: 'Sign, upload documents, and get final approval in the app.',
  handoff_url: 'https://emvnzir-canada-song.web.app/?loan_draft=LOAN_20260918_ABC123&handoff_token=deadbeef&customer_id=CUST_001&sso=web',
  cta_label: 'Continue in the app', loan_kind: 'mortgage',
  monthly_payment_cad: 2760.73, principal_cad: 520000, interest_rate_pct: 4.09,
  tenure_label: '25 years', verdict: 'pre_approved', product_name: 'Home mortgage',
  property_price_cad: 650000, down_payment_cad: 130000, loan_to_value_pct: 80,
  gds_pct: 21.7, tds_pct: 21.7, rate_type: 'fixed', payment_frequency_label: 'Monthly',
  cmhc_premium_cad: 0,
};

function App() {
  return (
    <div style={{ padding: '28px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <h1 style={{ fontSize: '20px', color: '#0B1F33', marginBottom: '4px' }}>Mortgage widget preview</h1>
      <p style={{ fontSize: '13px', color: '#66788A', marginBottom: '28px', maxWidth: '460px', textAlign: 'center' }}>
        Fully interactive, fully offline. Drag sliders, pick rates, click suggestions.
        No CES, no network calls. onCta values are logged under each widget.
      </p>

      <Section title="1. Payment calculator (acn-mortgage-calculator)">
        {(log) => (
          <MortgageCalculator
            payload={{
              title: 'Estimate your payment',
              subtitle: 'Provisional. A final approval needs a full review.',
              defaults: {
                property_price_cad: 650000, down_payment_cad: 97500, tenure_years: 25,
                interest_rate_pct: 4.09, rate_type: 'fixed', payment_frequency: 'monthly',
                province: 'ON', property_city: 'Toronto', property_type: 'Detached',
                first_time_buyer: true,
              },
              bounds: {
                property_price_min_cad: 150000, property_price_max_cad: 3000000,
                down_payment_min_pct: 5, down_payment_max_pct: 50,
                tenure_min_years: 15, tenure_max_years: 30,
              },
              rate_options: rateOptions,
              confirm_cta_label: 'Continue with these numbers',
              confirm_cta_value: 'mortgage_calc_confirm',
            }}
            onCta={log}
          />
        )}
      </Section>

      <Section title="2. Affordability calculator (acn-mortgage-affordability)">
        {(log) => (
          <MortgageAffordability
            payload={{
              title: 'What could you afford?',
              subtitle: 'Provisional. A final approval needs a full review.',
              defaults: {
                gross_annual_income_cad: 120000, down_payment_cad: 100000,
                monthly_debt_obligations_cad: 500, province: 'ON', property_city: 'Toronto',
                property_type: 'Detached', first_time_buyer: true,
                interest_rate_pct: 4.09, amortization_years: 25,
              },
              bounds: {
                income_min_cad: 30000, income_max_cad: 400000,
                down_payment_min_cad: 5000, down_payment_max_cad: 600000,
                monthly_debt_max_cad: 4000,
              },
              submit_cta_label: 'Continue with this budget',
              submit_cta_value: 'mortgage_afford_confirm',
            }}
            onCta={log}
          />
        )}
      </Section>

      <Section title="3. Rate shelf, click the variable row to see the projection (acn-mortgage-rate-shelf)">
        {(log) => <MortgageRateShelf payload={shelfPayload} onCta={log} />}
      </Section>

      <Section title="4. Soft suggestion card (acn-mortgage-nudge)">
        {(log) => <MortgageNudge payload={nudgePayload} onCta={log} />}
      </Section>

      <Section title="5. Pre-approval verdict (acn-loan-preapproval, existing widget)">
        {(log) => <LoanPreapproval payload={preapprovalPayload} onCta={log} />}
      </Section>

      <Section title="6. Mobile handoff (acn-mobile-handoff, existing widget)">
        <MobileHandoff payload={handoffPayload} />
      </Section>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
