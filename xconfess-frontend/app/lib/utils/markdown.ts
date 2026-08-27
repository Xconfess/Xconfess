export function insertMarkdown(
  textarea: HTMLTextAreaElement,
  before: string,
  after: string = ""
): { newText: string; cursorPos: number } {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;
  const selectedText = text.substring(start, end);

  const newText =
    text.substring(0, start) +
    before +
    selectedText +
    after +
    text.substring(end);

  let cursorPos: number;
  if (selectedText.length > 0) {
    cursorPos = start + before.length + selectedText.length + after.length;
  } else {
    cursorPos = start + before.length;
  }

  return { newText, cursorPos };
}

export function insertBold(textarea: HTMLTextAreaElement): { newText: string; cursorPos: number } {
  return insertMarkdown(textarea, "**", "**");
}

export function insertItalic(textarea: HTMLTextAreaElement): { newText: string; cursorPos: number } {
  return insertMarkdown(textarea, "*", "*");
}

export function insertLink(textarea: HTMLTextAreaElement, url?: string): { newText: string; cursorPos: number } {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selectedText = textarea.value.substring(start, end);
  const linkUrl = url || "https://";

  if (selectedText.length > 0) {
    return insertMarkdown(textarea, `[`, `](${linkUrl})`);
  } else {
    return insertMarkdown(textarea, `[link text](`, `${linkUrl})`);
  }
}

export function insertEmoji(textarea: HTMLTextAreaElement, emoji: string): { newText: string; cursorPos: number } {
  return insertMarkdown(textarea, emoji, "");
}

export function sanitizeMarkdown(content: string): string {
  if (!content) return "";

  let sanitized = content;

  // 1. Remove script tags completely
  sanitized = sanitized.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");

  // 2. Remove iframe tags completely
  sanitized = sanitized.replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, "");

  // 3. Remove inline event handlers (e.g., onclick="...", onmouseover=...)
  sanitized = sanitized.replace(/\bon[a-z]+\s*=\s*(?:(['"]?)[\s\S]*?\1|[^\s>]+)/gi, "");

  // 4. Neutralize unsafe URL protocols
  sanitized = sanitized.replace(/(javascript|vbscript|data):/gi, "$1_blocked:");

  return sanitized;
}
