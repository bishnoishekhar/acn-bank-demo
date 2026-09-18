// Parity + correctness check for mortgageMath.js.
//
// Run with:  node src/components/mortgageMath.test.mjs
//
// Every expected value below was produced by the CES python engines
// (ACN_Bank_Demo/tools/mortgage_payment_estimate and
// .../mortgage_affordability_estimate) and verified to match this module
// exactly. If you change either side, run this and make them agree again.
//
// The anchor case is deliberately one you can check against any public
// Canadian calculator: a $500,000 loan at 5.00% over 25 years, compounded
// semi-annually, is $2,908.02 a month.

import {
  paymentEstimate, affordabilityEstimate, acceleratedSaving,
  minimumDownPaymentCad, landTransferTax,
} from './mortgageMath.js';

let checks = 0;
let failures = 0;

function eq(label, actual, expected) {
  checks += 1;
  const ok = actual === expected;
  if (!ok) {
    failures += 1;
    console.error(`  FAIL  ${label}\n          expected ${expected}\n          actual   ${actual}`);
  }
  return ok;
}

function group(name, fn) {
  console.log(`\n${name}`);
  const before = failures;
  fn();
  if (failures === before) console.log('  all passed');
}

group('Anchor: semi-annual compounding matches published Canadian calculators', () => {
  // $500k loan (20% down on $625k), 5.00% fixed, 25 years.
  const r = paymentEstimate({ price: 625000, down: 125000, rate: 5.0, province: 'AB' });
  eq('monthly payment', r.paymentPerPeriodCad, 2908.02);
  eq('compounding basis', r.compoundingBasis, 'semi-annually, not in advance');
  // Variable compounds monthly, so the same nominal rate costs slightly more.
  const v = paymentEstimate({ price: 625000, down: 125000, rate: 5.0, rateType: 'variable', province: 'AB' });
  eq('variable is dearer at the same nominal rate', v.paymentPerPeriodCad > r.paymentPerPeriodCad, true);
});

group('Minimum down payment is tiered, not a flat 5%', () => {
  eq('$500k -> 5%', minimumDownPaymentCad(500000), 25000);
  eq('$600k -> 5% of 500k + 10% of 100k', minimumDownPaymentCad(600000), 35000);
  eq('$1.0M', minimumDownPaymentCad(1000000), 75000);
  eq('$1.6M -> 20%, above the insured ceiling', minimumDownPaymentCad(1600000), 320000);
});

group('CMHC premium bands by loan-to-value', () => {
  const at = (down) => paymentEstimate({ price: 650000, down, rate: 4.09, province: 'ON' });
  eq('95% LTV -> 4.00%', at(32500).cmhcPremiumPct, 4.0);
  eq('90% LTV -> 3.10%', at(65000).cmhcPremiumPct, 3.1);
  eq('85% LTV -> 2.80%', at(97500).cmhcPremiumPct, 2.8);
  eq('80% LTV -> uninsured', at(130000).insured, false);
  eq('80% LTV -> no premium', at(130000).cmhcPremiumPct, 0);
  // The premium is added to the principal, so effective LTV exceeds base LTV.
  eq('base LTV is reported, not effective', at(97500).loanToValuePct, 85);
  eq('premium rolled into the mortgage', at(97500).totalMortgageCad, 567970);

  const long = paymentEstimate({ price: 650000, down: 65000, rate: 4.09, years: 30, province: 'ON', firstTimeBuyer: true });
  eq('30-year insured adds the 0.20% surcharge', long.cmhcPremiumPct, 3.3);
  const longNonFtb = paymentEstimate({ price: 650000, down: 65000, rate: 4.09, years: 30, province: 'ON' });
  eq('30-year insured is closed to non-first-time buyers', longNonFtb.insurable, false);

  const big = paymentEstimate({ price: 1600000, down: 320000, rate: 4.09, province: 'ON' });
  eq('above $1.5M is not insurable', big.insurable, false);
});

group('Land transfer tax and first-time buyer rebates', () => {
  const on = landTransferTax(800000, 'ON', '', false);
  eq('Ontario LTT on $800k', on.grossCad, 12475);
  const toronto = landTransferTax(800000, 'ON', 'Toronto', false);
  eq('Toronto pays it twice', toronto.grossCad, 24950);
  const torontoFtb = landTransferTax(800000, 'ON', 'Toronto', true);
  eq('both rebates: $4,000 + $4,475', torontoFtb.rebateCad, 8475);
  eq('net after rebates', torontoFtb.netCad, 16475);

  const bc = landTransferTax(800000, 'BC', 'Vancouver', true);
  eq('BC PTT on $800k', bc.grossCad, 14000);
  eq('BC first-time exemption caps at $8,000', bc.rebateCad, 8000);
  eq('BC exemption gone above $860k', landTransferTax(900000, 'BC', 'Vancouver', true).rebateCad, 0);

  const ab = landTransferTax(800000, 'AB', 'Calgary', false);
  eq('Alberta has no LTT', ab.grossCad, 300);
});

group('Payment frequencies, and accelerated actually shortens the term', () => {
  const base = { price: 650000, down: 130000, rate: 4.09, province: 'ON' };
  eq('monthly amortizes in exactly 25 years', paymentEstimate({ ...base }).amortizationYearsActual, 25);
  eq('bi-weekly too', paymentEstimate({ ...base, frequency: 'bi_weekly' }).amortizationYearsActual, 25);
  eq('weekly too', paymentEstimate({ ...base, frequency: 'weekly' }).amortizationYearsActual, 25);

  const acc = paymentEstimate({ ...base, frequency: 'accelerated_bi_weekly' });
  eq('accelerated bi-weekly payment is half the monthly', acc.paymentPerPeriodCad, 1380.37);
  eq('and it clears in 21.85 years', acc.amortizationYearsActual, 21.85);

  const saving = acceleratedSaving(520000, 4.09, 25, 'fixed');
  eq('interest saved', saving.interestSavedCad, 44176.24);
  eq('years sooner', saving.yearsSooner, 3.15);
});

group('Affordability works backwards from income at the qualifying rate', () => {
  const r = affordabilityEstimate({
    income: 120000, down: 100000, monthlyDebts: 500, rate: 4.09,
    province: 'ON', city: 'Toronto', firstTimeBuyer: true,
  });
  eq('max price', r.maxPurchasePriceCad, 590000);
  eq('qualifying rate is contract + 2%', r.qualifyingRatePct, 6.09);
  eq('GDS lands on the cap', r.gdsPct, 39);
  eq('TDS lands on the cap', r.tdsPct, 44);
  eq('tested at the qualifying payment', r.qualifyingPaymentCad, 3249.83);
  eq('but would actually pay less', r.contractPaymentCad, 2674.3);
  eq('the stress test gap', r.stressTestGapCad, 575.53);
  eq('FHSA + HBP lifts the price', r.fhsaHbpBoost.boostedMaxPurchasePriceCad, 690000);

  // Round-trip: the max price, priced at the qualifying rate, must land on GDS.
  const p = paymentEstimate({
    price: r.maxPurchasePriceCad, down: 100000, rate: r.qualifyingRatePct,
    province: 'ON', city: 'Toronto', firstTimeBuyer: true,
  });
  eq('round-trip: same qualifying payment', p.monthlyEquivalentCad, r.qualifyingPaymentCad);
  eq('round-trip: same premium', p.cmhcPremiumCad, r.cmhcPremiumCad);
  eq('round-trip: same total mortgage', p.totalMortgageCad, r.maxMortgageCad);
});

group('Affordability moves the right way, and refuses when it should', () => {
  const at = (monthlyDebts) => affordabilityEstimate({
    income: 120000, down: 100000, monthlyDebts, rate: 4.09, province: 'ON', firstTimeBuyer: true,
  }).maxPurchasePriceCad;
  eq('more debt buys less', at(1500) < at(500), true);
  eq('$1,500 of debt', at(1500), 465000);
  eq('$2,500 of debt', at(2500), 328000);

  const byIncome = (income) => affordabilityEstimate({
    income, down: 100000, monthlyDebts: 500, rate: 4.09, province: 'ON', firstTimeBuyer: true,
  }).maxPurchasePriceCad;
  eq('more income buys more', byIncome(200000) > byIncome(90000), true);
  eq('$60k income', byIncome(60000), 300000);

  // Debts alone over the cap: must refuse rather than quote the savings figure.
  const broke = affordabilityEstimate({ income: 25000, down: 10000, monthlyDebts: 2000, rate: 4.09 });
  eq('unaffordable is reported honestly', broke.affordable, false);
  eq('and quotes no price', broke.maxPurchasePriceCad, 0);

  eq('condo fees reduce the price', affordabilityEstimate({
    income: 120000, down: 100000, monthlyDebts: 500, rate: 4.09, propertyType: 'Condo',
    province: 'ON', firstTimeBuyer: true,
  }).maxPurchasePriceCad, 569000);

  eq('30 years buys more, for a first-time buyer', affordabilityEstimate({
    income: 120000, down: 100000, monthlyDebts: 500, rate: 4.09, years: 30,
    province: 'ON', firstTimeBuyer: true,
  }).maxPurchasePriceCad, 621000);

  eq('non-first-time buyer is pushed to 20% down at 30 years', affordabilityEstimate({
    income: 120000, down: 100000, monthlyDebts: 500, rate: 4.09, years: 30, province: 'ON',
  }).downPaymentPct, 20);
});

group('Bad input returns null rather than a wrong number', () => {
  eq('no price', paymentEstimate({ price: 0, down: 0, rate: 4.09 }), null);
  eq('no rate', paymentEstimate({ price: 650000, down: 130000, rate: 0 }), null);
  eq('no income', affordabilityEstimate({ income: 0, down: 100000, rate: 4.09 }), null);
  eq('no down payment', affordabilityEstimate({ income: 120000, down: 0, rate: 4.09 }), null);
});

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) {
  console.error(`${failures} FAILED`);
  process.exit(1);
}
