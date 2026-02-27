export interface DataSourceDescriptor {
  id: string;
  name: string;
  description: string;
  category: "crypto" | "sports" | "forex" | "weather" | "esports";
  api: {
    baseUrl: string;
    pathTemplate: string;
    method: "GET" | "POST";
    queryParams?: Record<string, string>;
    headers?: Record<string, string>;
    auth?: {
      type: "header";
      headerName: string;
      envVar: string;
    };
  };
  response: {
    exampleJson: unknown;
    commonPaths: Array<{
      path: string;
      description: string;
    }>;
  };
  applicableTransforms: Array<"decimal" | "score_diff" | "score_sum">;
  applicableRules: Array<"greater_than" | "less_than" | "equals">;
}
