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

describe("development service worker cleanup", () => {
  const layoutSource = readFileSync(
    path.join(process.cwd(), "app", "layout.tsx"),
    "utf8",
  );

  it("unregisters service workers outside production", () => {
    expect(layoutSource).toContain("const unregisterServiceWorkerScript");
    expect(layoutSource).toContain("navigator.serviceWorker");
    expect(layoutSource).toContain(".getRegistrations()");
    expect(layoutSource).toContain("registration.unregister()");
    expect(layoutSource).toContain('process.env.NODE_ENV === "production"');
    expect(layoutSource).toContain(": unregisterServiceWorkerScript");
  });

  it("clears xconfess caches during dev cleanup", () => {
    expect(layoutSource).toContain("caches");
    expect(layoutSource).toContain("key.startsWith('xconfess-')");
    expect(layoutSource).toContain("caches.delete(key)");
  });
});
