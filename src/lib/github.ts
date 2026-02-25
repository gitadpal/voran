import { Octokit } from "@octokit/rest";

export async function triggerResolverWorkflow(
  spec: object,
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
      spec: specB64,
    },
  });

  return response.status;
}
