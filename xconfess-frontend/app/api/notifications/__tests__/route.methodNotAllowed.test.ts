/**
 * @jest-environment jsdom
 */
import { GET, POST, PUT, PATCH, DELETE } from "../route";

describe("/api/notifications method-not-allowed", () => {
  it("keeps GET as a real handler", () => {
    expect(typeof GET).toBe("function");
  });

  it.each([
    ["POST", POST],
    ["PUT", PUT],
    ["PATCH", PATCH],
    ["DELETE", DELETE],
  ])("returns a standardized 405 for %s", async (method, handler) => {
    const response = handler();

    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET");

    const body = await response.json();
    expect(body.code).toBe("METHOD_NOT_ALLOWED");
    expect(body.message).toContain(method);
  });
});
