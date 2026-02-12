import { request } from "undici";
import { createHash } from "node:crypto";

export interface FetchResult {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  bodyHash: string;
  bodyTruncated: boolean;
  durationMs: number;
}

export async function fetchTarget(
  url: string,
  method: "GET" | "HEAD",
  headers: Record<string, string> = {},
  timeoutMs: number = 15_000,
  maxBodyBytes: number = 5 * 1024 * 1024
): Promise<FetchResult> {
  const start = Date.now();

  const { statusCode, headers: respHeaders, body } = await request(url, {
    method,
    headers: {
      ...headers,
      "user-agent": "ClawRoute/1.0",
      "x-relayed-by": "ClawRoute/1.0",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });

  // Collect response headers
  const flatHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(respHeaders)) {
    if (value !== undefined) {
      flatHeaders[key] = Array.isArray(value) ? value.join(", ") : String(value);
    }
  }

  // Read body with size limit
  const chunks: Buffer[] = [];
  let totalSize = 0;
  let truncated = false;

  for await (const chunk of body) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalSize += buf.length;
    if (totalSize <= maxBodyBytes) {
      chunks.push(buf);
    } else {
      truncated = true;
      // Still need to consume the stream
    }
  }

  const bodyBuf = Buffer.concat(chunks);
  const bodyStr = bodyBuf.toString("utf-8");
  const bodyHash = createHash("sha256").update(bodyBuf).digest("hex");
  const durationMs = Date.now() - start;

  return {
    statusCode,
    headers: flatHeaders,
    body: bodyStr,
    bodyHash,
    bodyTruncated: truncated,
    durationMs,
  };
}
