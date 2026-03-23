// Shared lightweight ML runtime helpers used by serverless risk/analytics functions.
// Keep deterministic and dependency-free so it is safe in Base44 function runtime.
export const ML_RUNTIME_VERSION = 'ml_runtime_v1';

const EPSILON = 1e-9;

export function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

export function logistic(x: number): number {
  if (!Number.isFinite(x)) return 0.5;
  if (x > 20) return 1;
  if (x < -20) return 0;
  return 1 / (1 + Math.exp(-x));
}

export function mean(values: number[]): number {
  if (!Array.isArray(values) || values.length === 0) return 0;
  return values.reduce((sum, v) => sum + (Number(v) || 0), 0) / values.length;
}

export function std(values: number[]): number {
  if (!Array.isArray(values) || values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((sum, v) => {
    const delta = (Number(v) || 0) - m;
    return sum + delta * delta;
  }, 0) / values.length;
  return Math.sqrt(Math.max(variance, 0));
}

export function robustZScore(value: number, values: number[]): number {
  if (!Array.isArray(values) || values.length < 3 || !Number.isFinite(value)) return 0;
  const sorted = values
    .map((v) => Number(v) || 0)
    .sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  const absDeviations = sorted.map((v) => Math.abs(v - median)).sort((a, b) => a - b);
  const mad = absDeviations.length % 2 === 0
    ? (absDeviations[mid - 1] + absDeviations[mid]) / 2
    : absDeviations[mid];
  if (mad <= EPSILON) return 0;
  return 0.6745 * ((value - median) / mad);
}

type RiskFeatures = {
  firstOrder?: boolean;
  value?: number;
  avgValue?: number;
  countryMismatch?: boolean;
  zipMismatch?: boolean;
  suspiciousEmail?: boolean;
  velocity24h?: number;
  refundRatePct?: number;
  negativeProfit?: boolean;
};

export function mlRiskProbability(features: RiskFeatures = {}): { probability: number; score: number } {
  const value = Number(features.value) || 0;
  const avgValue = Number(features.avgValue) || 0;
  const valueRatio = avgValue > 0 ? value / avgValue : value > 0 ? 1 : 0;
  const velocity24h = Number(features.velocity24h) || 0;
  const refundRatePct = Number(features.refundRatePct) || 0;

  let score = -1.1;
  if (features.firstOrder) score += 0.35;
  if (features.countryMismatch) score += 0.75;
  if (features.zipMismatch) score += 0.2;
  if (features.suspiciousEmail) score += 0.45;
  if (features.negativeProfit) score += 0.25;
  if (value > 500) score += 0.2;
  if (value > 1000) score += 0.25;
  score += Math.max(0, Math.min(0.7, (valueRatio - 1) * 0.12));
  score += Math.max(0, Math.min(0.6, (velocity24h - 1) * 0.14));
  score += Math.max(0, Math.min(0.8, (refundRatePct / 100) * 0.9));

  return {
    probability: Number(clamp(logistic(score), 0.01, 0.99).toFixed(4)),
    score: Number(score.toFixed(4))
  };
}

type ChurnFeatures = {
  daysSinceLastOrder?: number;
  orderCount?: number;
  totalSpent?: number;
  refundRatePct?: number;
  highRiskOrders?: number;
};

export function mlChurnProbability(features: ChurnFeatures = {}): { probability: number; score: number } {
  const days = Number(features.daysSinceLastOrder) || 0;
  const orders = Number(features.orderCount) || 0;
  const spent = Number(features.totalSpent) || 0;
  const refundRate = Number(features.refundRatePct) || 0;
  const highRiskOrders = Number(features.highRiskOrders) || 0;

  let score = -2.0;
  score += Math.min(2.0, days / 90);
  score -= Math.min(1.2, orders * 0.12);
  score -= Math.min(1.0, spent / 800);
  score += Math.min(1.0, refundRate / 35);
  score += Math.min(0.8, highRiskOrders * 0.15);

  return {
    probability: Number(clamp(logistic(score), 0.01, 0.99).toFixed(4)),
    score: Number(score.toFixed(4))
  };
}
