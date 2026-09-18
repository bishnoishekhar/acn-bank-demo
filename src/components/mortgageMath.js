// Canadian mortgage maths, shared by MortgageCalculator and MortgageAffordability.
//
// This is a deliberate port of the CES python engines
// (ACN_Bank_Demo/tools/mortgage_payment_estimate and
// .../mortgage_affordability_estimate) so the sliders can update instantly
// without a round trip. The python tools stay authoritative for anything the
// agent says out loud or persists to a loan draft; this module only powers
// live feedback while the customer is still dragging.
//
// Keep the two in step. The constants and the formulas below are 1:1 with the
// python, and there is a parity check in mortgageMath.test.mjs that compares
// both against fixed expected values.
//
// The one thing worth knowing if you touch this: Canadian FIXED rates compound
// semi-annually, not monthly. A naive monthly-compounded PMT overstates the
// payment. Variable rates and HELOCs do compound monthly.

export const INSURED_PRICE_CEILING_CAD = 1_500_000;
export const CONVENTIONAL_DOWN_PCT = 20;
export const STANDARD_AMORTIZATION_YEARS = 25;
export const MAX_INSURED_LTV_PCT = 95;

export const GDS_CAP_PCT = 39;
export const TDS_CAP_PCT = 44;
export const STRESS_TEST_FLOOR_PCT = 5.25;
export const STRESS_TEST_MARGIN_PCT = 2;

// Premium as a % of the loan, by loan-to-value. Only below 20% down.
const CMHC_PREMIUM_BANDS = [
  [65, 0.60], [75, 1.70], [80, 2.40], [85, 2.80], [90, 3.10], [95, 4.00],
];
const CMHC_LONG_AMORTIZATION_SURCHARGE_PCT = 0.20;

export const FREQUENCIES = {
  monthly: { perYear: 12, accelerated: false, label: 'Monthly' },
  semi_monthly: { perYear: 24, accelerated: false, label: 'Semi-monthly' },
  bi_weekly: { perYear: 26, accelerated: false, label: 'Bi-weekly' },
  weekly: { perYear: 52, accelerated: false, label: 'Weekly' },
  accelerated_bi_weekly: { perYear: 26, accelerated: true, label: 'Accelerated bi-weekly' },
  accelerated_weekly: { perYear: 52, accelerated: true, label: 'Accelerated weekly' },
};

const ASSUMED_PROPERTY_TAX_MONTHLY_PCT = 0.085;
const ASSUMED_MAINTENANCE_MONTHLY_PCT = 0.050;
const ASSUMED_HEAT_MONTHLY_CAD = 150;
const ASSUMED_CONDO_FEE_MONTHLY_PCT = 0.055;

const CLOSING_OTHER_CAD = 1800 + 350 + 400 + 500; // legal, title, appraisal, inspection

export const FHSA_ANNUAL_LIMIT_CAD = 8_000;
export const FHSA_LIFETIME_LIMIT_CAD = 40_000;
export const HBP_WITHDRAWAL_LIMIT_CAD = 60_000;

export const ANNUAL_LUMP_SUM_PRIVILEGE_PCT = 15;

// ── Land transfer tax. Tiers are [upperBound | null, ratePct]. ──────────────

const ON_TIERS = [[55_000, 0.5], [250_000, 1.0], [400_000, 1.5], [2_000_000, 2.0], [null, 2.5]];
const TORONTO_TIERS = [
  [55_000, 0.5], [250_000, 1.0], [400_000, 1.5], [2_000_000, 2.0],
  [3_000_000, 2.5], [4_000_000, 3.5], [5_000_000, 4.5], [null, 5.5],
];
const BC_TIERS = [[200_000, 1.0], [2_000_000, 2.0], [3_000_000, 3.0], [null, 5.0]];
const MB_TIERS = [[30_000, 0.0], [90_000, 0.5], [150_000, 1.0], [200_000, 1.5], [null, 2.0]];
const QC_TIERS = [[61_500, 0.5], [307_800, 1.0], [null, 1.5]];
const MONTREAL_TIERS = [
  [61_500, 0.5], [307_800, 1.0], [552_300, 1.5], [1_104_700, 2.0],
  [2_136_500, 2.5], [3_113_000, 3.5], [null, 4.0],
];

// province -> { tiers, ftbCap, label }. tiers null means no LTT at all.
const PROVINCE_LTT = {
  ON: { tiers: ON_TIERS, ftbCap: 4000, label: 'Ontario land transfer tax' },
  BC: { tiers: BC_TIERS, ftbCap: 8000, label: 'BC property transfer tax' },
  MB: { tiers: MB_TIERS, ftbCap: 0, label: 'Manitoba land transfer tax' },
  QC: { tiers: QC_TIERS, ftbCap: 0, label: 'Quebec transfer duties' },
  NS: { tiers: [[null, 1.5]], ftbCap: 0, label: 'Nova Scotia deed transfer tax (Halifax rate)' },
  NB: { tiers: [[null, 1.0]], ftbCap: 0, label: 'New Brunswick real property transfer tax' },
  PE: { tiers: [[null, 1.0]], ftbCap: 2000, label: 'PEI real property transfer tax' },
  NL: { tiers: [[null, 0.4]], ftbCap: 0, label: 'Newfoundland registration fee' },
  SK: { tiers: [[null, 0.3]], ftbCap: 0, label: 'Saskatchewan title registration fee' },
  AB: { tiers: null, ftbCap: 0, label: 'Alberta has no land transfer tax, only registration fees' },
  YT: { tiers: null, ftbCap: 0, label: 'Yukon has no land transfer tax, only registration fees' },
  NT: { tiers: null, ftbCap: 0, label: 'NWT has no land transfer tax, only registration fees' },
  NU: { tiers: null, ftbCap: 0, label: 'Nunavut has no land transfer tax, only registration fees' },
};
const NO_LTT_REGISTRATION_CAD = 300;
const TORONTO_FTB_REBATE_CAD = 4475;
const BC_FTB_FULL_CEILING_CAD = 835_000;
const BC_FTB_PARTIAL_CEILING_CAD = 860_000;

// PST on the CMHC premium is payable at closing in cash and cannot be financed.
const PST_ON_PREMIUM_PCT = { ON: 8, QC: 9, MB: 7, SK: 6 };

const TORONTO_ALIASES = new Set(['toronto', 'city of toronto', 'north york', 'scarborough', 'etobicoke']);
const MONTREAL_ALIASES = new Set(['montreal', 'montréal', 'ville de montreal', 'ville de montréal']);

export const PROVINCES = ['ON', 'QC', 'BC', 'AB', 'MB', 'SK', 'NS', 'NB', 'NL', 'PE', 'YT', 'NT', 'NU'];
export const PROPERTY_TYPES = ['Detached', 'Semi-detached', 'Townhouse', 'Condo', 'Duplex'];

// ── Core maths ─────────────────────────────────────────────────────────────

/** Nominal Canadian quoted rate -> true per-period rate. */
export function periodicRate(annualRatePct, periodsPerYear, compoundingPerYear) {
  const nominal = Number(annualRatePct) / 100;
  if (!(nominal > 0)) return 0;
  const effectiveAnnual = Math.pow(1 + nominal / compoundingPerYear, compoundingPerYear) - 1;
  return Math.pow(1 + effectiveAnnual, 1 / periodsPerYear) - 1;
}

/** Unrounded on purpose — amortizing an already-rounded payment leaves a tail. */
export function paymentFor(principal, rate, periods) {
  if (!(principal > 0) || !(periods > 0)) return 0;
  if (!(rate > 0)) return principal / periods;
  return principal * (rate / (1 - Math.pow(1 + rate, -periods)));
}

/** Walk the schedule. Returns null if the payment never clears the interest. */
export function amortize(principal, rate, payment, maxPeriods, annualLump = 0, periodsPerYear = 12) {
  if (!(payment > 0)) return null;
  let balance = principal;
  let totalInterest = 0;
  let periods = 0;
  const balances = [];
  while (balance > 0.005 && periods < maxPeriods) {
    const interest = balance * rate;
    let principalPart = payment - interest;
    if (principalPart <= 0) return null;
    // Lenders adjust the final payment rather than bill a whole extra period.
    if (principalPart > balance || balance - principalPart < 0.01) principalPart = balance;
    balance -= principalPart;
    totalInterest += interest;
    periods += 1;
    if (annualLump > 0 && periods % periodsPerYear === 0 && balance > 0) {
      balance -= Math.min(annualLump, balance);
    }
    balances.push(balance);
  }
  return { periods, totalInterest, balances };
}

export function minimumDownPaymentCad(price) {
  if (!(price > 0)) return 0;
  if (price > INSURED_PRICE_CEILING_CAD) return round2(price * 0.20);
  if (price <= 500_000) return round2(price * 0.05);
  return round2(500_000 * 0.05 + (price - 500_000) * 0.10);
}

function premiumPctForLtv(ltvPct) {
  for (const [ceiling, pct] of CMHC_PREMIUM_BANDS) if (ltvPct <= ceiling) return pct;
  return CMHC_PREMIUM_BANDS[CMHC_PREMIUM_BANDS.length - 1][1];
}

/** Whether a mortgage below 20% down can actually be insured. */
export function insurability(price, ltvPct, years, firstTimeBuyer, newlyBuilt) {
  if (price > INSURED_PRICE_CEILING_CAD) {
    return { insurable: false, note: 'Above the $1.5M insured ceiling, so 20% down is required.' };
  }
  if (ltvPct > MAX_INSURED_LTV_PCT) {
    return { insurable: false, note: 'Loan-to-value above 95% cannot be insured.' };
  }
  if (years > STANDARD_AMORTIZATION_YEARS && !(firstTimeBuyer || newlyBuilt)) {
    return {
      insurable: false,
      note: 'A 30-year insured amortization is limited to first-time buyers and newly built homes.',
    };
  }
  return { insurable: true, note: '' };
}

function tieredTax(amount, tiers) {
  let tax = 0;
  let lower = 0;
  for (const [upper, ratePct] of tiers) {
    const ceiling = upper === null ? amount : Math.min(amount, upper);
    if (ceiling > lower) {
      tax += ((ceiling - lower) * ratePct) / 100;
      lower = ceiling;
    }
    if (upper !== null && amount <= upper) break;
  }
  return round2(tax);
}

function bcFtbRebate(price, gross, cap) {
  if (price <= BC_FTB_FULL_CEILING_CAD) return Math.min(gross, cap);
  if (price >= BC_FTB_PARTIAL_CEILING_CAD) return 0;
  const span = BC_FTB_PARTIAL_CEILING_CAD - BC_FTB_FULL_CEILING_CAD;
  return Math.min(gross, cap * ((BC_FTB_PARTIAL_CEILING_CAD - price) / span));
}

export function landTransferTax(price, province, city, firstTimeBuyer) {
  const entry = PROVINCE_LTT[String(province || '').toUpperCase().slice(0, 2)];
  if (!entry || entry.tiers === null) {
    return {
      grossCad: NO_LTT_REGISTRATION_CAD,
      rebateCad: 0,
      netCad: NO_LTT_REGISTRATION_CAD,
      basis: entry ? entry.label : 'Registration fees only; no land transfer tax in this province.',
    };
  }

  const prov = String(province).toUpperCase().slice(0, 2);
  const cityKey = String(city || '').trim().toLowerCase();
  let tiers = entry.tiers;
  let basis = entry.label;

  if (prov === 'QC' && MONTREAL_ALIASES.has(cityKey)) {
    tiers = MONTREAL_TIERS;
    basis = 'Montreal welcome tax (approximate)';
  }

  let gross = tieredTax(price, tiers);
  let rebate = 0;

  if (prov === 'ON') {
    const inToronto = TORONTO_ALIASES.has(cityKey);
    if (inToronto) {
      gross = round2(gross + tieredTax(price, TORONTO_TIERS));
      basis = 'Ontario land transfer tax plus Toronto municipal land transfer tax';
    }
    if (firstTimeBuyer) {
      rebate = Math.min(gross, entry.ftbCap + (inToronto ? TORONTO_FTB_REBATE_CAD : 0));
    }
  } else if (prov === 'BC' && firstTimeBuyer) {
    rebate = bcFtbRebate(price, gross, entry.ftbCap);
  } else if (firstTimeBuyer && entry.ftbCap > 0) {
    rebate = Math.min(gross, entry.ftbCap);
  }

  rebate = round2(rebate);
  return { grossCad: gross, rebateCad: rebate, netCad: round2(Math.max(gross - rebate, 0)), basis };
}

export function housingCosts(price, propertyType) {
  const isCondo = String(propertyType || '').toLowerCase().includes('condo');
  return {
    propertyTaxMonthlyCad: round2((price * ASSUMED_PROPERTY_TAX_MONTHLY_PCT) / 100),
    heatMonthlyCad: ASSUMED_HEAT_MONTHLY_CAD,
    maintenanceMonthlyCad: round2((price * ASSUMED_MAINTENANCE_MONTHLY_PCT) / 100),
    condoFeeMonthlyCad: isCondo ? round2((price * ASSUMED_CONDO_FEE_MONTHLY_PCT) / 100) : 0,
  };
}

/** Only half of condo fees count toward the lender's debt-service test. */
function housingForGds(costs) {
  return costs.propertyTaxMonthlyCad + costs.heatMonthlyCad + costs.condoFeeMonthlyCad * 0.5;
}

// ── The payment calculator ─────────────────────────────────────────────────

export function paymentEstimate({
  price, down, rate, years = STANDARD_AMORTIZATION_YEARS, frequency = 'monthly',
  rateType = 'fixed', province = 'ON', city = '', propertyType = 'Detached',
  firstTimeBuyer = false, newlyBuilt = false,
}) {
  if (!(price > 0) || !(rate > 0)) return null;

  const freq = FREQUENCIES[frequency] || FREQUENCIES.monthly;
  const prov = String(province || 'ON').toUpperCase().slice(0, 2);
  const downSafe = Math.max(Number(down) || 0, 0);

  const minDown = minimumDownPaymentCad(price);
  const downPct = round2((downSafe / price) * 100);
  const baseLoan = Math.max(price - downSafe, 0);
  const baseLtvPct = round2((baseLoan / price) * 100);

  const { insurable, note } = insurability(price, baseLtvPct, years, firstTimeBuyer, newlyBuilt);
  const insured = downPct < CONVENTIONAL_DOWN_PCT && insurable && baseLoan > 0;

  let premiumPct = 0;
  if (insured) {
    premiumPct = premiumPctForLtv(baseLtvPct);
    if (years > STANDARD_AMORTIZATION_YEARS) {
      premiumPct = round2(premiumPct + CMHC_LONG_AMORTIZATION_SURCHARGE_PCT);
    }
  }
  const premiumCad = round2((baseLoan * premiumPct) / 100);
  const totalMortgage = round2(baseLoan + premiumCad);
  const premiumPstCad = round2((premiumCad * (PST_ON_PREMIUM_PCT[prov] || 0)) / 100);

  const compounding = String(rateType).toLowerCase() === 'fixed' ? 2 : 12;
  const monthlyRate = periodicRate(rate, 12, compounding);
  const monthlyPayment = paymentFor(totalMortgage, monthlyRate, Math.round(years * 12));

  const periodRate = periodicRate(rate, freq.perYear, compounding);
  const perPeriod = freq.accelerated
    ? monthlyPayment / (freq.perYear === 26 ? 2 : 4)
    : paymentFor(totalMortgage, periodRate, Math.round(years * freq.perYear));

  const schedule = amortize(
    totalMortgage, periodRate, perPeriod, Math.round(years * freq.perYear * 1.5) + 12,
  );
  if (!schedule) return null;

  const ltt = landTransferTax(price, prov, city, firstTimeBuyer);
  const costs = housingCosts(price, propertyType);
  const monthlyEquivalent = round2((perPeriod * freq.perYear) / 12);

  return {
    paymentPerPeriodCad: round2(perPeriod),
    paymentsPerYear: freq.perYear,
    frequencyLabel: freq.label,
    isAccelerated: freq.accelerated,
    monthlyEquivalentCad: monthlyEquivalent,
    monthlyPaymentCad: round2(monthlyPayment),
    compoundingBasis: compounding === 2 ? 'semi-annually, not in advance' : 'monthly',
    loanPrincipalCad: round2(baseLoan),
    totalMortgageCad: totalMortgage,
    downPaymentPct: downPct,
    minimumDownPaymentCad: minDown,
    downPaymentShortfallCad: round2(Math.max(minDown - downSafe, 0)),
    meetsMinimumDown: downSafe >= minDown,
    loanToValuePct: baseLtvPct,
    insured,
    insurable,
    insurableNote: note,
    cmhcPremiumPct: premiumPct,
    cmhcPremiumCad: premiumCad,
    cmhcPremiumPstCad: premiumPstCad,
    amortizationYearsActual: round2(schedule.periods / freq.perYear),
    totalInterestCad: round2(schedule.totalInterest),
    mortgageFreeDate: mortgageFreeDate(schedule.periods, freq.perYear),
    balanceCurve: sampleCurve(totalMortgage, schedule.balances, freq.perYear),
    landTransferTaxCad: ltt.grossCad,
    landTransferTaxRebateCad: ltt.rebateCad,
    landTransferTaxNetCad: ltt.netCad,
    landTransferTaxBasis: ltt.basis,
    otherClosingCostsCad: CLOSING_OTHER_CAD,
    closingCostsEstimateCad: round2(ltt.netCad + CLOSING_OTHER_CAD + premiumPstCad),
    cashNeededAtClosingCad: round2(downSafe + ltt.netCad + CLOSING_OTHER_CAD + premiumPstCad),
    housingCostBreakdown: costs,
    totalMonthlyCostOfOwnershipCad: round2(
      monthlyEquivalent + costs.propertyTaxMonthlyCad + costs.heatMonthlyCad
      + costs.maintenanceMonthlyCad + costs.condoFeeMonthlyCad,
    ),
    annualLumpSumPrivilegeCad: round2((totalMortgage * ANNUAL_LUMP_SUM_PRIVILEGE_PCT) / 100),
  };
}

/** Interest saved and years shaved by switching to accelerated bi-weekly. */
export function acceleratedSaving(principal, rate, years, rateType = 'fixed') {
  const compounding = String(rateType).toLowerCase() === 'fixed' ? 2 : 12;
  const monthlyRate = periodicRate(rate, 12, compounding);
  const monthlyPayment = paymentFor(principal, monthlyRate, Math.round(years * 12));
  if (!(monthlyPayment > 0)) return null;

  const base = amortize(principal, monthlyRate, monthlyPayment, Math.round(years * 12) + 24);
  const acc = amortize(
    principal, periodicRate(rate, 26, compounding), monthlyPayment / 2, Math.round(years * 26) + 52,
  );
  if (!base || !acc) return null;
  return {
    interestSavedCad: round2(base.totalInterest - acc.totalInterest),
    yearsSooner: round2(base.periods / 12 - acc.periods / 26),
  };
}

// ── The affordability calculator ───────────────────────────────────────────

export function affordabilityEstimate({
  income, down, monthlyDebts = 0, rate, years = STANDARD_AMORTIZATION_YEARS,
  propertyType = 'Detached', province = 'ON', city = '',
  firstTimeBuyer = false, newlyBuilt = false,
}) {
  if (!(income > 0) || !(down > 0) || !(rate > 0)) return null;

  const monthlyIncome = income / 12;
  const qualifyingRate = round2(Math.max(rate + STRESS_TEST_MARGIN_PCT, STRESS_TEST_FLOOR_PCT));
  const args = { monthlyIncome, monthlyDebts, down, qualifyingRate, years, propertyType, firstTimeBuyer, newlyBuilt };

  const maxPrice = searchMaxPrice(args);
  if (!(maxPrice > 0)) {
    return {
      affordable: false,
      maxPurchasePriceCad: 0,
      qualifyingRatePct: qualifyingRate,
      contractRatePct: rate,
      grossMonthlyIncomeCad: round2(monthlyIncome),
      monthlyDebtObligationsCad: round2(monthlyDebts),
      bindingConstraint: monthlyDebts > 0 ? 'tds' : 'gds',
      fhsaHbpBoost: fhsaHbpBoost(0, args, firstTimeBuyer),
    };
  }

  const detail = evaluatePrice(maxPrice, args);
  const contractPayment = paymentFor(
    detail.totalMortgageCad, periodicRate(rate, 12, 2), Math.round(years * 12),
  );
  const downFor20 = round2((maxPrice * CONVENTIONAL_DOWN_PCT) / 100);
  const ltt = landTransferTax(maxPrice, province, city, firstTimeBuyer);

  return {
    affordable: true,
    maxPurchasePriceCad: maxPrice,
    maxMortgageCad: detail.totalMortgageCad,
    loanPrincipalCad: detail.baseLoanCad,
    downPaymentCad: round2(down),
    downPaymentPct: detail.downPaymentPct,
    minimumDownPaymentCad: detail.minimumDownPaymentCad,
    loanToValuePct: detail.loanToValuePct,
    insured: detail.insured,
    cmhcPremiumPct: detail.cmhcPremiumPct,
    cmhcPremiumCad: detail.cmhcPremiumCad,
    gdsPct: detail.gdsPct,
    tdsPct: detail.tdsPct,
    gdsCapPct: GDS_CAP_PCT,
    tdsCapPct: TDS_CAP_PCT,
    bindingConstraint: detail.bindingConstraint,
    qualifyingRatePct: qualifyingRate,
    qualifyingPaymentCad: detail.qualifyingPaymentCad,
    contractRatePct: rate,
    contractPaymentCad: round2(contractPayment),
    stressTestGapCad: round2(detail.qualifyingPaymentCad - contractPayment),
    amortizationYears: years,
    grossMonthlyIncomeCad: round2(monthlyIncome),
    monthlyDebtObligationsCad: round2(monthlyDebts),
    housingCostBreakdown: detail.housing,
    totalMonthlyHousingCostCad: round2(
      contractPayment + detail.housing.propertyTaxMonthlyCad + detail.housing.heatMonthlyCad
      + detail.housing.maintenanceMonthlyCad + detail.housing.condoFeeMonthlyCad,
    ),
    downPaymentFor20PctCad: downFor20,
    downPaymentGapTo20PctCad: round2(Math.max(downFor20 - down, 0)),
    premiumAvoidedAt20PctCad: detail.cmhcPremiumCad,
    landTransferTaxNetCad: ltt.netCad,
    landTransferTaxRebateCad: ltt.rebateCad,
    fhsaHbpBoost: fhsaHbpBoost(maxPrice, args, firstTimeBuyer),
  };
}

function evaluatePrice(price, args) {
  const { monthlyIncome, monthlyDebts, down, qualifyingRate, years, propertyType, firstTimeBuyer, newlyBuilt } = args;
  const minDown = minimumDownPaymentCad(price);
  const downPct = round2((down / price) * 100);
  const baseLoan = Math.max(price - down, 0);
  const baseLtv = round2((baseLoan / price) * 100);

  const wantsInsurance = downPct < CONVENTIONAL_DOWN_PCT;
  let insurableOrConventional = true;
  let premiumPct = 0;

  if (wantsInsurance) {
    const { insurable } = insurability(price, baseLtv, years, firstTimeBuyer, newlyBuilt);
    if (!insurable) {
      insurableOrConventional = false;
    } else {
      premiumPct = premiumPctForLtv(baseLtv);
      if (years > STANDARD_AMORTIZATION_YEARS) {
        premiumPct = round2(premiumPct + CMHC_LONG_AMORTIZATION_SURCHARGE_PCT);
      }
    }
  }
  const premiumCad = round2((baseLoan * premiumPct) / 100);
  const totalMortgage = round2(baseLoan + premiumCad);

  const qualifyingPayment = paymentFor(
    totalMortgage, periodicRate(qualifyingRate, 12, 2), Math.round(years * 12),
  );
  const housing = housingCosts(price, propertyType);
  const gdsCosts = qualifyingPayment + housingForGds(housing);
  const gdsPct = ratioPct(gdsCosts, monthlyIncome);
  const tdsPct = ratioPct(gdsCosts + monthlyDebts, monthlyIncome);

  let bindingConstraint;
  if (down < minDown) bindingConstraint = 'down_payment';
  else if (tdsPct >= gdsPct * (TDS_CAP_PCT / GDS_CAP_PCT)) bindingConstraint = 'tds';
  else bindingConstraint = 'gds';

  return {
    baseLoanCad: round2(baseLoan),
    totalMortgageCad: totalMortgage,
    downPaymentPct: downPct,
    minimumDownPaymentCad: minDown,
    meetsMinimumDown: down >= minDown,
    insurableOrConventional,
    loanToValuePct: baseLtv,
    insured: wantsInsurance && insurableOrConventional,
    cmhcPremiumPct: premiumPct,
    cmhcPremiumCad: premiumCad,
    qualifyingPaymentCad: round2(qualifyingPayment),
    gdsPct,
    tdsPct,
    bindingConstraint,
    housing,
  };
}

function isAffordable(price, args) {
  if (!(price > 0)) return false;
  // A price at or below the down payment needs no mortgage, but it still has to
  // clear TDS — existing debts alone can put someone over the cap.
  const d = evaluatePrice(price, args);
  return d.meetsMinimumDown && d.insurableOrConventional
    && d.gdsPct <= GDS_CAP_PCT && d.tdsPct <= TDS_CAP_PCT;
}

const SEARCH_CEILING_CAD = 5_000_000;

function searchMaxPrice(args) {
  let low = 0;
  let high = Math.min(SEARCH_CEILING_CAD, args.down * 25 + 100_000);
  if (!isAffordable(1000, args)) return 0;
  while (isAffordable(high, args)) {
    high *= 2;
    if (high > SEARCH_CEILING_CAD) return SEARCH_CEILING_CAD;
  }
  for (let i = 0; i < 60; i += 1) {
    const mid = (low + high) / 2;
    if (isAffordable(mid, args)) low = mid; else high = mid;
  }
  // Round down to the nearest $1,000 — a price this precise is false comfort.
  return Math.floor(low / 1000) * 1000;
}

function fhsaHbpBoost(currentPrice, args, firstTimeBuyer) {
  if (!firstTimeBuyer) {
    return { eligible: false, note: "The FHSA and the Home Buyers' Plan are for first-time buyers." };
  }
  const extra = FHSA_LIFETIME_LIMIT_CAD + HBP_WITHDRAWAL_LIMIT_CAD;
  const boosted = searchMaxPrice({ ...args, down: args.down + extra });
  return {
    eligible: true,
    fhsaAnnualLimitCad: FHSA_ANNUAL_LIMIT_CAD,
    fhsaLifetimeLimitCad: FHSA_LIFETIME_LIMIT_CAD,
    hbpWithdrawalLimitCad: HBP_WITHDRAWAL_LIMIT_CAD,
    potentialExtraDownCad: extra,
    boostedMaxPurchasePriceCad: boosted,
    priceUpliftCad: round2(Math.max(boosted - currentPrice, 0)),
  };
}

// ── Small helpers ──────────────────────────────────────────────────────────

function round2(v) { return Math.round(Number(v) * 100) / 100; }
function ratioPct(numerator, denominator) {
  if (!(denominator > 0)) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function mortgageFreeDate(periods, periodsPerYear) {
  const months = Math.round((periods / periodsPerYear) * 12);
  const now = new Date();
  const total = now.getMonth() + months;
  const d = new Date(now.getFullYear() + Math.floor(total / 12), total % 12, 1);
  return d.toLocaleDateString('en-CA', { month: 'long', year: 'numeric' });
}

function sampleCurve(opening, balances, periodsPerYear) {
  const curve = [{ year: 0, balanceCad: round2(opening) }];
  if (!balances.length) return curve;
  const years = Math.ceil(balances.length / periodsPerYear);
  for (let y = 1; y <= years; y += 1) {
    curve.push({ year: y, balanceCad: round2(balances[Math.min(y * periodsPerYear - 1, balances.length - 1)]) });
  }
  if (curve.length > 2 && curve[curve.length - 1].balanceCad === curve[curve.length - 2].balanceCad) curve.pop();
  return curve;
}

export const fmtCad = (v) => Number(v || 0).toLocaleString('en-CA', { maximumFractionDigits: 0 });
export const fmtCad2 = (v) => Number(v || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
