// Offline test: which widget payloads does the chat actually render?
// Extracts the REAL resolvePayloadName / isKnownPayload from src/components/chat/ChatPanel.jsx (no copy to drift) and checks
// them against the payloads the CES agents emit. A widget whose `name` the screen does not know used to be dropped silently
// (the model picked names like 'spending_insights' or 'appointment_booking_form'); it must now be recognised by its shape.
// Run: node scripts/test_widget_resolution.mjs

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '..', 'src', 'components', 'chat', 'ChatPanel.jsx'), 'utf8').replace(/\r\n/g, '\n');
const slice = (from, to) => { const a = src.indexOf(from); const b = src.indexOf(to, a); assert.ok(a >= 0 && b > a, `cannot find ${from}`); return src.slice(a, b); };

const code = [
  slice('function normalizeWidgetPayload(raw)', 'function stableOutputValue'),
  slice('// Widget names the chat knows how to render', 'function filterDuplicateQuickActions'),
  'return { resolvePayloadName, isKnownPayload };',
].join('\n');
const { resolvePayloadName, isKnownPayload } = new Function(code)();

let failed = 0;
const check = (label, payload, expectName, expectRenders = true) => {
  const name = resolvePayloadName(payload);
  const renders = isKnownPayload(payload);
  const ok = name === expectName && renders === expectRenders;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  -> ${name} (renders=${renders})${ok ? '' : `   expected ${expectName} renders=${expectRenders}`}`);
};

const custom = (p) => ({ type: 'custom_template', ...p });

// names the agents really emitted in live runs
check('insight card, invented name', custom({ name: 'card_approval_card', insight_type: 'offer', headline: 'Approved' }), 'acn-insight-card');
check('insight card, name spending_insights', custom({ name: 'spending_insights', insight_type: 'cash_flow', headline: 'x' }), 'acn-insight-card');
check('form, name appointment_booking_form', custom({ name: 'appointment_booking_form', fields: [{ id: 'a', label: 'A', type: 'text' }] }), 'acn-form-input');
check('amount input, name personal_loan_amount', custom({ name: 'personal_loan_amount', min_amount: 1000, max_amount: 50000 }), 'acn-amount-input');
check('payment receipt, invented name', custom({ name: 'fx_receipt', receipt_id: 'R1' }), 'acn-payment-receipt');

// correct names keep working
check('insight card, exact name', custom({ name: 'acn-insight-card', insight_type: 'offer', headline: 'x' }), 'acn-insight-card');
check('form, exact name', custom({ name: 'acn-form-input', fields: [{ id: 'a' }] }), 'acn-form-input');
check('payment carousel', custom({ name: 'acn-payment-carousel', payments: [{ payee_name: 'x' }] }), 'acn-payment-carousel');
check('card carousel via alias', custom({ name: 'card_carousel', productDetails: [{ title: 'x' }] }), 'acn-card-carousel');
check('card widget via alias', custom({ name: 'card_widget', productDetails: [{ title: 'x' }], features: [{ label: 'f' }] }), 'acn-card-compare');
check('mortgage rate table', custom({ name: 'mortgage_rate_table' }), 'acn-mortgage-rate-table');
check('quick actions without a name', custom({ actions: [{ content: 'a', utterance: 'a' }] }), 'quick_actions');
check('card list without a name', custom({ productDetails: [{ title: 'x' }] }), 'acn-card-carousel');

// widgets other people added keep rendering by their exact name
check('QR widget, exact name', custom({ name: 'acn-qr-widget', qr_code_url: 'https://x/y.png', amount: 5 }), 'acn-qr-widget');

check('investment card, exact name', custom({ name: 'acn-investment-card', principal: 25000 }), 'acn-investment-card');
check('spending dashboard, exact name', custom({ name: 'acn-spending-dashboard', total: 100 }), 'acn-spending-dashboard');
check('proactive alert, exact name', custom({ name: 'acn-proactive-alert', headline: 'x' }), 'acn-proactive-alert');
check('transactions widget, exact name', custom({ name: 'acn-transactions-widget', transactions: [] }), 'acn-transactions-widget');

// product cards (accounts, GIC terms, summaries, application status, checklists)
const cards = [{ title: 'High-Interest Savings', headline: '4.50%', details: [{ label: 'Monthly fee', value: '$0' }] }];
check('product cards, exact name', custom({ name: 'acn-product-cards', title: 'Accounts', items: cards }), 'acn-product-cards');
check('product cards, snake_case alias', custom({ name: 'product_cards', items: cards }), 'acn-product-cards');
check('product cards, invented name', custom({ name: 'account_comparison', items: cards }), 'acn-product-cards');
check('product cards, no name', custom({ title: 'GIC rates', items: cards }), 'acn-product-cards');
check('plain items list is NOT product cards', custom({ name: 'whatever', items: [{ title: 'x' }] }), 'whatever', false);

// an unknown name with nothing recognisable stays unrendered (unchanged behaviour)
check('unknown name, unknown shape', custom({ name: 'something_else', foo: 1 }), 'something_else', false);

if (failed) { console.error(`\n${failed} FAILED`); process.exit(1); }
console.log('\nALL PASSED');
