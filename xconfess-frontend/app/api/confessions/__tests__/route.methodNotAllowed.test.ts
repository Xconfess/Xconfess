/**
 * @jest-environment jsdom
 */
import { PUT, PATCH, DELETE, GET, POST } from "../route";

describe("/api/confessions method-not-allowed", () => {
  it("keeps GET and POST as real handlers", () => {
    expect(typeof GET).toBe("function");
    expect(typeof POST).toBe("function");
  });

  it.each([
    ["PUT", PUT],
    ["PATCH", PATCH],
    ["DELETE", DELETE],
  ])("returns a standardized 405 for %s", async (method, handler) => {
    const response = handler();

    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET, POST");

    const body = await response.json();
    expect(body.code).toBe("METHOD_NOT_ALLOWED");
    expect(body.message).toContain(method);
  });
});
