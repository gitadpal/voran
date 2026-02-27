import { Octokit } from "@octokit/rest";
import type { ResolutionSpec } from "../types.js";

export async function triggerResolverWorkflow(
  spec: ResolutionSpec,
  options: {
    token: string;
    owner: string;
    repo: string;
    ref?: string;
  }
) {
  const octokit = new Octokit({ auth: options.token });

  const specB64 = Buffer.from(JSON.stringify(spec)).toString("base64");

  const response = await octokit.actions.createWorkflowDispatch({
    owner: options.owner,
    repo: options.repo,
    workflow_id: "resolve.yml",
    ref: options.ref || "main",
    inputs: {
      market_id: spec.marketId,
      spec: specB64,
    },
  });

  return response.status;
}
