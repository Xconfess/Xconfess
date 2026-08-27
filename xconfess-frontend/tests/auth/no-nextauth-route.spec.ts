import { existsSync } from "node:fs";
import path from "node:path";

describe("auth route surface", () => {
  it("does not ship a NextAuth catch-all route stub", () => {
    const nextAuthRoutePath = path.join(
      process.cwd(),
      "app",
      "api",
      "auth",
      "[...nextauth]",
      "route.ts",
    );

    expect(existsSync(nextAuthRoutePath)).toBe(false);
  });
});
