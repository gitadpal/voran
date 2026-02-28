import { tool } from "ai";
import { z } from "zod";
import { fetchSource, fetchBrowser, resolveHeaders } from "../resolver/fetch.js";
import { extractValue } from "../resolver/extract.js";
import { transformValue } from "../resolver/transform.js";
import { validateSpec, dryRunSpec } from "./validate.js";
import { expandTemplate } from "./template.js";
import { searchTemplates } from "./template-library.js";
import { loadRegistry } from "../registry/index.js";
import type { ResolutionSpec, TemplateSpec } from "../types.js";

const httpSourceSchema = z.object({
  type: z.literal("http"),
  method: z.enum(["GET", "POST"]),
  url: z.string(),
  query: z.record(z.union([z.string(), z.number()])).optional(),
  headers: z.record(z.string()).optional(),
});

const browserSourceSchema = z.object({
  type: z.literal("browser"),
  url: z.string(),
  waitFor: z.string().optional(),
});

const sourceSchema = z.discriminatedUnion("type", [httpSourceSchema, browserSourceSchema]);

const extractionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("jsonpath"), path: z.string() }),
  z.object({ type: z.literal("script"), lang: z.literal("javascript"), code: z.string() }),
]);

const transformSchema = z.object({
  type: z.enum(["decimal", "score_diff", "score_sum"]),
});

const ruleSchema = z.object({
  type: z.enum(["greater_than", "less_than", "equals"]),
  value: z.number(),
});

export const fetch_url = tool({
  description:
    "Fetch a URL and return a truncated response body. Use this to inspect page structure before writing extraction code. Set useBrowser=true for JS-rendered pages.",
  inputSchema: z.object({
    url: z.string().describe("The URL to fetch"),
    useBrowser: z
      .boolean()
      .optional()
      .default(false)
      .describe("Use headless browser (puppeteer) instead of plain HTTP fetch"),
    waitFor: z
      .string()
      .optional()
      .describe("CSS selector to wait for when using browser mode"),
    maxLength: z
      .number()
      .optional()
      .default(15000)
      .describe("Max characters of body to return"),
  }),
  execute: async ({ url, useBrowser, waitFor, maxLength }) => {
    try {
      let body: string;
      let status = 200;
      let contentType = "unknown";

      if (useBrowser) {
        body = await fetchBrowser({ url, waitFor });
        contentType = "text/html";
      } else {
        const response = await fetch(url);
        status = response.status;
        contentType = response.headers.get("content-type") || "unknown";
        body = await response.text();
        if (!response.ok) {
          return { status, contentType, bodyLength: body.length, body: body.slice(0, maxLength), error: `HTTP ${status}` };
        }
      }

      return {
        status,
        contentType,
        bodyLength: body.length,
        body: body.slice(0, maxLength),
      };
    } catch (e) {
      return { status: 0, contentType: "error", bodyLength: 0, body: "", error: (e as Error).message };
    }
  },
});

export const search_registry = tool({
  description:
    "Search available data sources in the registry by keyword. Returns matching sources with their API details and example paths.",
  inputSchema: z.object({
    query: z.string().describe("Search keyword (e.g. 'bitcoin', 'football', 'weather', 'forex')"),
  }),
  execute: async ({ query }) => {
    const registry = loadRegistry();
    const q = query.toLowerCase();
    const matches = registry.filter((ds) => {
      const searchable = [
        ds.id,
        ds.name,
        ds.description,
        ds.category,
        ...ds.response.commonPaths.map((p) => p.description),
      ]
        .join(" ")
        .toLowerCase();
      return searchable.includes(q);
    });

    if (matches.length === 0) {
      return { matches: [], message: `No registry sources match "${query}". You may need to use a custom URL.` };
    }

    return {
      matches: matches.map((ds) => ({
        id: ds.id,
        name: ds.name,
        description: ds.description,
        category: ds.category,
        api: ds.api,
        examplePaths: ds.response.commonPaths,
        applicableTransforms: ds.applicableTransforms,
        applicableRules: ds.applicableRules,
      })),
    };
  },
});

export const test_extraction = tool({
  description:
    "Test an extraction against a real URL. Fetches data, runs extraction + transform, and returns results or errors. Use this to verify your spec works before submitting.",
  inputSchema: z.object({
    source: sourceSchema,
    extraction: extractionSchema,
    transform: transformSchema,
  }),
  execute: async ({ source, extraction, transform }) => {
    try {
      // Resolve $env: headers for authenticated API testing
      let resolvedSource = source;
      if (source.type === "http" && source.headers) {
        const resolved = resolveHeaders(source.headers);
        resolvedSource = { ...source, headers: resolved };
      }

      const rawResponse = await fetchSource(resolvedSource as ResolutionSpec["source"]);
      const rawPreview = rawResponse.length > 2000 ? rawResponse.slice(0, 2000) + "..." : rawResponse;

      let extractedValue: string;
      try {
        extractedValue = extractValue(rawResponse, extraction);
      } catch (e) {
        return {
          success: false,
          rawResponsePreview: rawPreview,
          error: `Extraction failed: ${(e as Error).message}`,
        };
      }

      let transformedValue: string;
      try {
        transformedValue = transformValue(extractedValue, transform);
      } catch (e) {
        return {
          success: false,
          rawResponsePreview: rawPreview,
          extractedValue,
          error: `Transform failed: ${(e as Error).message}`,
        };
      }

      return {
        success: true,
        rawResponsePreview: rawPreview,
        extractedValue,
        transformedValue,
      };
    } catch (e) {
      return {
        success: false,
        error: `Fetch failed: ${(e as Error).message}`,
      };
    }
  },
});

export const submit_spec = tool({
  description:
    "Submit the final ResolutionSpec. Validates the spec and returns success or validation errors. Only call this when you are confident the spec is correct.",
  inputSchema: z.object({
    marketId: z.string(),
    source: sourceSchema,
    extraction: extractionSchema,
    transform: transformSchema,
    rule: ruleSchema,
    timestampRule: z
      .object({
        type: z.string(),
        utc: z.string(),
      })
      .optional(),
  }),
  execute: async (spec) => {
    const validation = validateSpec(spec);
    if (!validation.valid) {
      return {
        success: false as const,
        errors: validation.errors,
        warnings: validation.warnings,
      };
    }

    return {
      success: true as const,
      spec,
      warnings: validation.warnings,
    };
  },
});

export const submit_template = tool({
  description:
    "Submit a template for generating multiple variant specs. Use this when the user's prompt describes a family of similar markets. Params are combined as paired rows (zipped by index, not cross-product). Placeholders like {param_name} can appear anywhere: marketIdTemplate, source.query values, source.url, extraction.path, extraction.code, rule.value, timestampRule.utc. All param arrays must have the same length. A dry-run is performed on the first variant to verify the pipeline works.",
  inputSchema: z.object({
    marketIdTemplate: z
      .string()
      .describe("Market ID with {param} placeholders, e.g. 'epl-{home_team}-vs-{away_team}-md{matchday}'"),
    source: sourceSchema,
    extraction: extractionSchema,
    transform: transformSchema,
    rule: z.object({
      type: z.enum(["greater_than", "less_than", "equals"]),
      value: z.union([z.number(), z.string()]).describe("Static number (e.g. 0) or string with {param} placeholder (e.g. '{price}')"),
    }),
    timestampRule: z
      .object({
        type: z.string(),
        utc: z.string(),
      })
      .optional(),
    params: z
      .array(
        z.object({
          name: z.string(),
          values: z.array(z.union([z.string(), z.number()])).min(1),
        })
      )
      .min(1)
      .describe("Parameters with paired values (all arrays must be same length)"),
  }),
  execute: async (input) => {
    const { params } = input;

    // Validate all params have same length
    const count = params[0].values.length;
    for (const param of params) {
      if (param.values.length !== count) {
        return {
          success: false as const,
          errors: [
            `All params must have the same number of values. "${param.name}" has ${param.values.length}, expected ${count}.`,
          ],
        };
      }
    }

    // Validate marketIdTemplate contains at least one placeholder
    const hasPlaceholder = params.some((p) =>
      input.marketIdTemplate.includes(`{${p.name}}`)
    );
    if (!hasPlaceholder) {
      return {
        success: false as const,
        errors: [
          `marketIdTemplate must contain at least one {param} placeholder. Available: ${params.map((p) => `{${p.name}}`).join(", ")}`,
        ],
      };
    }

    const template: TemplateSpec = {
      marketIdTemplate: input.marketIdTemplate,
      source: input.source,
      extraction: input.extraction,
      transform: input.transform,
      rule: input.rule,
      timestampRule: input.timestampRule,
      params: input.params,
    };

    // Expand and validate all variants
    let specs: ResolutionSpec[];
    try {
      specs = expandTemplate(template);
    } catch (e) {
      return {
        success: false as const,
        errors: [(e as Error).message],
      };
    }

    const errors: string[] = [];
    for (const spec of specs) {
      const v = validateSpec(spec);
      if (!v.valid) {
        errors.push(`${spec.marketId}: ${v.errors.join(", ")}`);
      }
    }
    if (errors.length > 0) {
      return { success: false as const, errors };
    }

    // Dry-run the first variant to verify the pipeline
    const dryResult = await dryRunSpec(specs[0]);
    if (!dryResult.success) {
      return {
        success: false as const,
        errors: [
          `Dry-run failed on ${specs[0].marketId}: ${dryResult.error}`,
        ],
      };
    }

    return {
      success: true as const,
      template,
      expandedCount: specs.length,
      dryRunSample: {
        marketId: specs[0].marketId,
        extractedValue: dryResult.extractedValue,
        transformedValue: dryResult.transformedValue,
        ruleResult: dryResult.ruleResult,
      },
    };
  },
});

export const search_templates = tool({
  description:
    "Search saved template specs by keyword. Returns matching templates with their structure and required parameters. Use these as starting points — fill in the param values from the user's request and submit via submit_template.",
  inputSchema: z.object({
    query: z.string().describe("Search keyword (e.g. 'epl', 'stock price', 'crypto')"),
  }),
  execute: async ({ query }) => {
    const matches = searchTemplates(query);
    if (matches.length === 0) {
      return { matches: [], message: `No saved templates match "${query}". Build one from scratch.` };
    }
    return {
      matches: matches.map((t) => ({
        id: t.id,
        description: t.description,
        keywords: t.keywords,
        template: t.template,
      })),
    };
  },
});
