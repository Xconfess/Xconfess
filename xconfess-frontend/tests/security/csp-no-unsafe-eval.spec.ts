import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * Regression test: Production CSP must NOT include 'unsafe-eval'.
 *
 * The next.config.mjs builds the CSP string at module-evaluation time
 * based on NODE_ENV. We verify the source code uses a conditional
 * expression so that unsafe-eval is only present when isDev is true.
 */

const CONFIG_PATH = resolve(__dirname, "../../next.config.mjs");
const configSource = readFileSync(CONFIG_PATH, "utf-8");

describe("Content-Security-Policy", () => {
  describe("production script-src", () => {
    it("must NOT hardcode unsafe-eval in the CSP string", () => {
      // There should be no single string literal that contains both
      // script-src and unsafe-eval without a conditional guard.
      const hardcodedMatch = configSource.match(
        /["']script-src[^"']*unsafe-eval[^"']*["']/,
      );
      expect(hardcodedMatch).toBeNull();
    });

    it("must use a conditional to include unsafe-eval only in dev", () => {
      // The config should contain a ternary/conditional that gates
      // unsafe-eval behind the isDev flag.
      const conditionalPattern = /isDev\s*\?[\s\S]*?unsafe-eval/;
      expect(configSource).toMatch(conditionalPattern);
    });

    it("production script-src should only contain self and unsafe-inline", () => {
      // Extract the production branch of the conditional (the else/falsy branch)
      // which should be: "script-src 'self' 'unsafe-inline'"
      const prodBranchMatch = configSource.match(
        /:\s*"script-src\s+([^"]+)"/,
      );
      expect(prodBranchMatch).not.toBeNull();
      const prodDirectives = prodBranchMatch ? prodBranchMatch[1] : "";
      expect(prodDirectives).toContain("'self'");
      expect(prodDirectives).toContain("'unsafe-inline'");
      expect(prodDirectives).not.toContain("'unsafe-eval'");
    });
  });

  describe("development script-src", () => {
    it("must include unsafe-eval for hot reloading", () => {
      // Extract the dev branch (truthy branch after isDev ?)
      const devBranchMatch = configSource.match(
        /isDev[\s\S]*?\?\s*"script-src\s+([^"]+)"/,
      );
      expect(devBranchMatch).not.toBeNull();
      const devDirectives = devBranchMatch ? devBranchMatch[1] : "";
      expect(devDirectives).toContain("'unsafe-eval'");
    });
  });

  describe("CSP header structure", () => {
    it("must include all required directives", () => {
      const requiredDirectives = [
        "default-src",
        "script-src",
        "style-src",
        "img-src",
        "font-src",
        "connect-src",
        "frame-ancestors",
        "base-uri",
        "form-action",
      ];

      for (const directive of requiredDirectives) {
        expect(configSource).toContain(directive);
      }
    });

    it("must not include unsafe-eval in style-src", () => {
      // style-src should never have unsafe-eval
      const styleSrcMatch = configSource.match(/style-src[^"']*/);
      expect(styleSrcMatch).not.toBeNull();
      expect(styleSrcMatch ? styleSrcMatch[0] : "").not.toContain("unsafe-eval");
    });
  });
});
