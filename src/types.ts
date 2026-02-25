export interface ResolutionSpec {
  marketId: string;
  source: {
    type: "http";
    method: "GET" | "POST";
    url: string;
    query?: Record<string, string | number>;
    headers?: Record<string, string>;
  };
  extraction: {
    type: "jsonpath";
    path: string;
  };
  transform: {
    type: "decimal" | "score_diff" | "score_sum";
  };
  rule: {
    type: "greater_than" | "less_than" | "equals";
    value: number;
  };
  timestampRule?: {
    type: string;
    utc: string;
  };
}

export interface ResolverPayload {
  marketId: `0x${string}`;
  specHash: `0x${string}`;
  rawHash: `0x${string}`;
  parsedValue: string;
  result: boolean;
  executedAt: number;
}

export interface SignedPayload extends ResolverPayload {
  signature: `0x${string}`;
}
