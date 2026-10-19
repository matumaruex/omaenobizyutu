export interface TokenUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  cachedInputTokens: number | null;
}
export interface Pricing {
  version: string;
  inputUsdPerMillion: number;
  cachedInputUsdPerMillion: number;
  outputUsdPerMillion: number;
  usdJpy: number;
  source: string;
  checkedOn: string;
}
export interface CostEstimate {
  nanoJpy: number;
  cacheAssumedMiss: boolean;
}
export interface UsageRecord {
  id: string;
  createdAt: string;
  model: string;
  status: "pending" | "succeeded" | "failed";
  usage: TokenUsage;
  estimate: CostEstimate | null;
  pricing: Pricing;
}
export interface UsageReport {
  calls: number;
  limit: number;
  totalNanoJpy: number;
  unpricedCalls: number;
  pendingCalls: number;
  records: UsageRecord[];
  pricing: Pricing;
}
