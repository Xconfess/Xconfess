export function insertBold(textarea: HTMLTextAreaElement) {
  const { selectionStart, selectionEnd, value } = textarea;

  const before = value.slice(0, selectionStart);
  const selected = value.slice(selectionStart, selectionEnd);
  const after = value.slice(selectionEnd);

  if (selectionStart === selectionEnd) {
    textarea.value = `${before}****${after}`;
    textarea.selectionStart = textarea.selectionEnd = selectionStart + 2;
  } else {
    textarea.value = `${before}**${selected}**${after}`;
  }
}

export function insertItalic(textarea: HTMLTextAreaElement) {
  const { selectionStart, selectionEnd, value } = textarea;

  const before = value.slice(0, selectionStart);
  const selected = value.slice(selectionStart, selectionEnd);
  const after = value.slice(selectionEnd);

  textarea.value = `${before}*${selected}*${after}`;
}

export function insertLink(textarea: HTMLTextAreaElement) {
  const { selectionStart, selectionEnd, value } = textarea;

  const before = value.slice(0, selectionStart);
  const selected = value.slice(selectionStart, selectionEnd);
  const after = value.slice(selectionEnd);

  const text = selected || "link text";

  textarea.value = `${before}[${text}](https://)${after}`;
}

export function insertEmoji(textarea: HTMLTextAreaElement, emoji: string) {
  const { selectionStart, selectionEnd, value } = textarea;

  const before = value.slice(0, selectionStart);
  const after = value.slice(selectionEnd);

  textarea.value = `${before}${emoji}${after}`;
}
