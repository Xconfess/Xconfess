describe("auth client session lifecycle", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetAllMocks();
    global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("logs in through the shared session endpoint and returns the session payload", async () => {
    const user = { id: "u-1", email: "test@example.com", username: "tester" };
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ user, anonymousUserId: "anon-1" }),
    });

    const { login } = await import("../auth");
    const result = await login({ email: "test@example.com", password: "secret" });

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/auth/session",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
      }),
    );
    expect(result).toEqual({ user, anonymousUserId: "anon-1" });
  });

  it("refreshes the session via the shared session endpoint", async () => {
    const user = { id: "u-2", email: "refresh@example.com", username: "refresh" };
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ authenticated: true, user }),
    });

    const { refreshSession } = await import("../auth");
    const result = await refreshSession();

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/auth/session",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(result).toEqual(user);
  });

  it("logs out by deleting the session cookie endpoint", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true });

    const { logout } = await import("../auth");
    await logout();

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/auth/session",
      expect.objectContaining({ method: "DELETE", credentials: "include" }),
    );
  });
});
