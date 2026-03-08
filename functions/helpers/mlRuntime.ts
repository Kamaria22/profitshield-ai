/**
 * ML Runtime Helpers (safe, deterministic, no external model dependency)
 * Version marker: ml_runtime_v1
 */

export const ML_RUNTIME_VERSION = 'ml_runtime_v1';

export function mean(values: number[] = []): number {
  if (!Array.isArray(values) || values.length === 0) return 0;
  return values.reduce((s, v) => s + (Number(v) || 0), 0) / values.length;
}

export function std(values: number[] = []): number {
  if (!Array.isArray(values) || values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((s, v) => s + Math.pow((Number(v) || 0) - m, 2), 0) / values.length;
  return Math.sqrt(Math.max(0, variance));
}

export function robustZScore(value: number, values: number[] = []): number {
  const m = mean(values);
  const s = std(values);
  if (s <= 0) return 0;
  return (Number(value) - m) / s;
}

export function logistic(x: number): number {
  const v = Number.isFinite(x) ? x : 0;
  return 1 / (1 + Math.exp(-v));
}

export function clamp(n: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, n));
}

export function mlRiskProbability(input: {
  firstOrder?: boolean;
  value?: number;
  avgValue?: number;
  countryMismatch?: boolean;
  zipMismatch?: boolean;
  suspiciousEmail?: boolean;
  velocity24h?: number;
  refundRatePct?: number;
  negativeProfit?: boolean;
}) {
  // Lightweight linear model -> logistic probability
  const ratio = (input.avgValue || 0) > 0 ? (input.value || 0) / (input.avgValue || 1) : 1;
  const velocity = Number(input.velocity24h || 0);
  const refundRate = Number(input.refundRatePct || 0) / 100;
  const linear =
    (input.firstOrder ? 0.35 : 0) +
    Math.min(1.2, Math.max(0, ratio - 1) * 0.4) +
    (input.countryMismatch ? 0.8 : 0) +
    (input.zipMismatch ? 0.15 : 0) +
    (input.suspiciousEmail ? 0.45 : 0) +
    Math.min(1.0, velocity * 0.25) +
    Math.min(0.8, refundRate * 1.5) +
    (input.negativeProfit ? 0.2 : 0) -
    0.9;

  const probability = logistic(linear);
  return {
    probability: clamp(probability, 0, 1),
    model: ML_RUNTIME_VERSION
  };
}

export function mlChurnProbability(input: {
  daysSinceLastOrder?: number;
  orderCount?: number;
  totalSpent?: number;
  refundCount?: number;
}) {
  const days = Number(input.daysSinceLastOrder || 999);
  const orders = Number(input.orderCount || 0);
  const spent = Number(input.totalSpent || 0);
  const refunds = Number(input.refundCount || 0);

  const refundRatio = orders > 0 ? refunds / orders : 0;
  const linear =
    (days / 120) +
    (orders < 2 ? 0.45 : 0) +
    (spent < 100 ? 0.25 : -0.15) +
    (refundRatio > 0.2 ? 0.3 : 0) -
    1.1;

  const probability = logistic(linear);
  return {
    probability: clamp(probability, 0, 1),
    model: ML_RUNTIME_VERSION
  };
}

