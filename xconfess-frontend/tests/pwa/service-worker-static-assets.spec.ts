import { readFileSync } from "fs";
import path from "path";

describe("service worker static asset handling", () => {
  const source = readFileSync(
    path.join(process.cwd(), "public", "sw.js"),
    "utf8",
  );

  it("serves Next static assets network-first without caching fallback", () => {
    expect(source).toContain("url.pathname.startsWith('/_next/static/')");
    expect(source).toContain("fetch(request, { cache: 'no-store' })");
    expect(source).toContain("Response.error()");
  });
});
