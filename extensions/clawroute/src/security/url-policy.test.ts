import { describe, it, expect } from "vitest";
import { UrlPolicy } from "./url-policy.js";

describe("security/url-policy", () => {
  const policy = new UrlPolicy({ allowGlobs: ["**"], denyGlobs: [] });

  it("allows normal HTTPS URLs", () => {
    expect(policy.check("https://example.com/page").allowed).toBe(true);
  });

  it("allows HTTP URLs", () => {
    expect(policy.check("http://example.com").allowed).toBe(true);
  });

  it("blocks non-HTTP protocols", () => {
    expect(policy.check("ftp://example.com").allowed).toBe(false);
    expect(policy.check("file:///etc/passwd").allowed).toBe(false);
  });

  it("blocks private IPs", () => {
    expect(policy.check("http://10.0.0.1/api").allowed).toBe(false);
    expect(policy.check("http://192.168.1.1").allowed).toBe(false);
    expect(policy.check("http://172.16.0.1").allowed).toBe(false);
    expect(policy.check("http://127.0.0.1").allowed).toBe(false);
    expect(policy.check("http://169.254.1.1").allowed).toBe(false);
    expect(policy.check("http://0.0.0.0").allowed).toBe(false);
  });

  it("blocks localhost", () => {
    expect(policy.check("http://localhost/api").allowed).toBe(false);
    expect(policy.check("http://myhost.local/api").allowed).toBe(false);
  });

  it("blocks invalid URLs", () => {
    expect(policy.check("not-a-url").allowed).toBe(false);
  });

  it("respects deny globs", () => {
    const p = new UrlPolicy({
      allowGlobs: ["**"],
      denyGlobs: ["evil.com", "*.evil.com"],
    });
    expect(p.check("https://evil.com/bad").allowed).toBe(false);
    expect(p.check("https://good.com/ok").allowed).toBe(true);
  });

  it("respects allow globs", () => {
    const p = new UrlPolicy({
      allowGlobs: ["*.example.com"],
      denyGlobs: [],
    });
    expect(p.check("https://api.example.com/v1").allowed).toBe(true);
    // The hostname doesn't match *.example.com, and neither does the full URL
    expect(p.check("https://other.com/page").allowed).toBe(false);
  });
});
