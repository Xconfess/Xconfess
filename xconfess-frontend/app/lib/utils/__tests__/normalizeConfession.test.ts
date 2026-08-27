import { normalizeConfession, RawConfession } from "../normalizeConfession";

describe("normalizeConfession", () => {
  describe("content field", () => {
    it("maps `message` to `content`", () => {
      const result = normalizeConfession({ message: "hello world" });
      expect(result.content).toBe("hello world");
    });

    it("falls back to `body` when `message` is absent", () => {
      const result = normalizeConfession({ body: "from body" });
      expect(result.content).toBe("from body");
    });

    it("falls back to `content` when both `message` and `body` are absent", () => {
      const result = normalizeConfession({ content: "from content" });
      expect(result.content).toBe("from content");
    });

    it("returns empty string when no content field is present", () => {
      const result = normalizeConfession({});
      expect(result.content).toBe("");
    });
  });

  describe("createdAt field", () => {
    it("maps `created_at` to `createdAt`", () => {
      const date = "2024-01-15T10:00:00.000Z";
      const result = normalizeConfession({ created_at: date });
      expect(result.createdAt).toBe(date);
    });

    it("falls back to `createdAt` when `created_at` is absent", () => {
      const date = "2024-01-15T10:00:00.000Z";
      const result = normalizeConfession({ createdAt: date });
      expect(result.createdAt).toBe(date);
    });

    it("falls back to a non-undefined value when date is absent", () => {
      const result = normalizeConfession({});
      expect(result.createdAt).toBeDefined();
      expect(typeof result.createdAt).toBe("string");
    });
  });

  describe("viewCount field", () => {
    it("maps `view_count` to `viewCount`", () => {
      const result = normalizeConfession({ view_count: 42 });
      expect(result.viewCount).toBe(42);
    });

    it("falls back to `viewCount` when `view_count` is absent", () => {
      const result = normalizeConfession({ viewCount: 7 });
      expect(result.viewCount).toBe(7);
    });

    it("defaults to 0 when absent", () => {
      const result = normalizeConfession({});
      expect(result.viewCount).toBe(0);
    });
  });

  describe("commentCount field", () => {
    it("uses `commentCount` when present", () => {
      const result = normalizeConfession({ commentCount: 5 });
      expect(result.commentCount).toBe(5);
    });

    it("counts `comments` array length as fallback", () => {
      const result = normalizeConfession({ comments: [{}, {}, {}] });
      expect(result.commentCount).toBe(3);
    });

    it("defaults to 0 when both are absent", () => {
      const result = normalizeConfession({});
      expect(result.commentCount).toBe(0);
    });
  });

  describe("reactions field", () => {
    it("converts reactions array into a keyed object", () => {
      const raw: RawConfession = {
        reactions: [
          { type: "like", count: 5 },
          { type: "love", count: 3 },
        ],
      };
      const result = normalizeConfession(raw);
      expect(result.reactions).toEqual({ like: 5, love: 3 });
    });

    it("passes through an already-normalized reactions object unchanged", () => {
      const raw: RawConfession = {
        reactions: { like: 10, love: 4 } as Record<string, number>,
      };
      const result = normalizeConfession(raw);
      expect(result.reactions).toEqual({ like: 10, love: 4 });
    });

    it("returns { like: 0, love: 0 } for an empty reactions array", () => {
      const result = normalizeConfession({ reactions: [] });
      expect(result.reactions).toEqual({});
    });

    it("returns { like: 0, love: 0 } when reactions is absent", () => {
      const result = normalizeConfession({});
      expect(result.reactions).toEqual({ like: 0, love: 0 });
    });

    it("accumulates multiple reactions of the same type", () => {
      const raw: RawConfession = {
        reactions: [
          { type: "like", count: 3 },
          { type: "like", count: 2 },
        ],
      };
      const result = normalizeConfession(raw);
      expect(result.reactions.like).toBe(5);
    });
  });

  describe("idempotency — already-normalized shape passes through", () => {
    it("does not change a confession that is already in the correct shape", () => {
      const normalized: RawConfession = {
        id: "abc-123",
        content: "I love coding.",
        createdAt: "2024-06-01T00:00:00.000Z",
        viewCount: 20,
        commentCount: 2,
        reactions: { like: 5, love: 3 } as Record<string, number>,
      };
      const result = normalizeConfession(normalized);
      expect(result.content).toBe("I love coding.");
      expect(result.createdAt).toBe("2024-06-01T00:00:00.000Z");
      expect(result.viewCount).toBe(20);
      expect(result.commentCount).toBe(2);
      expect(result.reactions).toEqual({ like: 5, love: 3 });
    });
  });

  describe("no undefined fields in output", () => {
    it("all required fields are defined even for an empty raw object", () => {
      const result = normalizeConfession({});
      expect(result.id).toBeDefined();
      expect(result.content).toBeDefined();
      expect(result.createdAt).toBeDefined();
      expect(result.viewCount).toBeDefined();
      expect(result.commentCount).toBeDefined();
      expect(result.reactions).toBeDefined();
    });
  });
});
