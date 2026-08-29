import {
  insertBold,
  insertItalic,
  insertLink,
  insertEmoji,
  sanitizeMarkdown,
} from "../markdown";

// Mock textarea element
function createMockTextarea(value: string, selectionStart: number, selectionEnd: number) {
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.selectionStart = selectionStart;
  textarea.selectionEnd = selectionEnd;
  return textarea;
}

describe("markdown utilities", () => {
  describe("insertBold", () => {
    it("should insert bold markdown around selected text", () => {
      const textarea = createMockTextarea("Hello world", 6, 11);
      textarea.value = insertBold(textarea).newText;
      expect(textarea.value).toBe("Hello **world**");
    });

    it("should insert bold markdown at cursor when no selection", () => {
      const textarea = createMockTextarea("Hello world", 6, 6);
      textarea.value = insertBold(textarea).newText;
      expect(textarea.value).toBe("Hello ****world");
    });
  });

  describe("insertItalic", () => {
    it("should insert italic markdown around selected text", () => {
      const textarea = createMockTextarea("Hello world", 6, 11);
      textarea.value = insertItalic(textarea).newText;
      expect(textarea.value).toBe("Hello *world*");
    });
  });

  describe("insertLink", () => {
    it("should insert link markdown with selected text", () => {
      const textarea = createMockTextarea("Hello world", 6, 11);
      textarea.value = insertLink(textarea).newText;
      expect(textarea.value).toBe("Hello [world](https://)");
    });

    it("should use default text when no selection", () => {
      const textarea = createMockTextarea("Hello world", 6, 6);
      textarea.value = insertLink(textarea).newText;
      expect(textarea.value).toBe("Hello [link text](https://)world");
    });
  });

  describe("insertEmoji", () => {
    it("should insert emoji at cursor position", () => {
      const textarea = createMockTextarea("Hello world", 6, 6);
      textarea.value = insertEmoji(textarea, "😀").newText;
      expect(textarea.value).toBe("Hello 😀world");
    });
  });

  describe("sanitizeMarkdown", () => {
    it("should block script tags", () => {
      const input = "Hello <script>alert(1)</script> World";
      expect(sanitizeMarkdown(input)).toBe("Hello  World");
    });

    it("should block iframe tags", () => {
      const input = "Video <iframe src='http://evil.com'></iframe>";
      expect(sanitizeMarkdown(input)).toBe("Video ");
    });

    it("should block inline event handlers", () => {
      const input = "Click <a href='#' onclick='alert(1)'>here</a>";
      expect(sanitizeMarkdown(input)).toBe("Click <a href='#' >here</a>");
    });

    it("should block unsafe URL protocols", () => {
      const input = "[link](javascript:alert(1))";
      expect(sanitizeMarkdown(input)).toBe("[link](javascript_blocked:alert(1))");
    });

    it("should allow safe markdown formatting", () => {
      const input = "**bold** and *italic* and [link](https://example.com)";
      expect(sanitizeMarkdown(input)).toBe("**bold** and *italic* and [link](https://example.com)");
    });
  });
});
