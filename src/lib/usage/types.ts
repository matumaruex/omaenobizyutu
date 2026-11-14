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
  pipeline?: {
    exhibitionId: string;
    stage: "retrieval" | "selection";
  };
  id: string;
  createdAt: string;
  model: string;
  status: "pending" | "succeeded" | "failed";
  usage: TokenUsage;
  estimate: CostEstimate | null;
  pricing: Pricing;
  /** Successful calls: send to complete response body; failures: send to failure. */
  elapsedMs?: number;
  failure?: SelectionFailureDiagnostic;
}
export type ValidationIssue =
  | "tag_profile"
  | "candidate_count"
  | "title"
  | "atmosphere"
  | "selection_count"
  | "selection_fields"
  | "duplicate_ids"
  | "outside_candidates";
export interface SelectionFailureDiagnostic {
  validationIssue?: ValidationIssue;
  kind:
    | "timeout"
    | "cancelled"
    | "network"
    | "provider_auth"
    | "provider_limit"
    | "provider_error"
    | "provider_request"
    | "invalid_response"
    | "invalid_selection";
  elapsedMs: number;
  httpStatus?: number;
}
export interface AccountingResult {
  record: UsageRecord;
  records?: UsageRecord[];
  persisted: boolean;
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
