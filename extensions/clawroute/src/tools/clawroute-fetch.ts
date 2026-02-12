import type { RelayClient, RelayResult } from "../client/relay-client.js";

export interface ClawRouteFetchParams {
  url: string;
  extractMode?: "markdown" | "text";
  maxChars?: number;
}

export const TOOL_DEFINITION = {
  name: "clawroute_fetch",
  description:
    "Fetch a web page through the ClawRoute relay mesh for IP diversity. " +
    "Routes the request through a random peer node to avoid IP-based blocking.",
  parameters: {
    type: "object" as const,
    properties: {
      url: {
        type: "string" as const,
        format: "uri",
        description: "The URL to fetch",
      },
      extractMode: {
        type: "string" as const,
        enum: ["markdown", "text"],
        description: "How to extract content (default: text)",
      },
      maxChars: {
        type: "number" as const,
        description: "Maximum characters to return (default: 50000)",
      },
    },
    required: ["url"],
  },
};

export async function executeClawRouteFetch(
  params: ClawRouteFetchParams,
  client: RelayClient
): Promise<string> {
  const { url, extractMode = "text", maxChars = 50_000 } = params;

  const result: RelayResult = await client.fetch(url, "GET");

  let content = result.body;

  // Truncate if needed
  if (content.length > maxChars) {
    content = content.slice(0, maxChars) + "\n\n[Truncated at " + maxChars + " chars]";
  }

  const meta = [
    `Status: ${result.statusCode}`,
    `Relayed: ${result.direct ? "no (direct)" : `yes (through ${result.relayedThrough})`}`,
    `Duration: ${result.fetchDurationMs}ms`,
    result.bodyTruncated ? "Body was truncated at size limit" : "",
  ]
    .filter(Boolean)
    .join("\n");

  return `${meta}\n\n---\n\n${content}`;
}
