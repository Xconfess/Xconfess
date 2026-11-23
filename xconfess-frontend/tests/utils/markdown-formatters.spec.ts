import {
  insertBold,
  insertItalic,
  insertLink,
  insertEmoji,
} from '@/lib/utils/markdown';

describe('Markdown Formatters', () => {
  let textarea: HTMLTextAreaElement;

  beforeEach(() => {
    textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
  });

  afterEach(() => {
    document.body.removeChild(textarea);
  });

  describe('insertBold', () => {
    it('should wrap selected text with bold markers', () => {
      textarea.value = 'Hello World';
      textarea.selectionStart = 0;
      textarea.selectionEnd = 5;

      insertBold(textarea);

      expect(textarea.value).toBe('**Hello** World');
    });

    it('should insert empty bold markers when nothing selected', () => {
      textarea.value = 'Hello World';
      textarea.selectionStart = 5;
      textarea.selectionEnd = 5;

      insertBold(textarea);

      expect(textarea.value).toBe('Hello ****World');
    });

    it('should position cursor correctly after bold insertion', () => {
      textarea.value = 'Hello World';
      textarea.selectionStart = 5;
      textarea.selectionEnd = 5;

      insertBold(textarea);

      expect(textarea.selectionStart).toBe(7);
      expect(textarea.selectionEnd).toBe(7);
    });

    it('should handle bold at beginning of text', () => {
      textarea.value = 'World';
      textarea.selectionStart = 0;
      textarea.selectionEnd = 5;

      insertBold(textarea);

      expect(textarea.value).toBe('**World**');
    });

    it('should handle bold in middle of text', () => {
      textarea.value = 'Hello Beautiful World';
      textarea.selectionStart = 6;
      textarea.selectionEnd = 15;

      insertBold(textarea);

      expect(textarea.value).toBe('Hello **Beautiful** World');
    });

    it('should handle bold at end of text', () => {
      textarea.value = 'Hello World';
      textarea.selectionStart = 6;
      textarea.selectionEnd = 11;

      insertBold(textarea);

      expect(textarea.value).toBe('Hello **World**');
    });

    it('should handle empty text', () => {
      textarea.value = '';
      textarea.selectionStart = 0;
      textarea.selectionEnd = 0;

      insertBold(textarea);

      expect(textarea.value).toBe('****');
    });

    it('should handle single character selection', () => {
      textarea.value = 'a';
      textarea.selectionStart = 0;
      textarea.selectionEnd = 1;

      insertBold(textarea);

      expect(textarea.value).toBe('**a**');
    });
  });

  describe('insertItalic', () => {
    it('should wrap selected text with italic markers', () => {
      textarea.value = 'Hello World';
      textarea.selectionStart = 0;
      textarea.selectionEnd = 5;

      insertItalic(textarea);

      expect(textarea.value).toBe('*Hello* World');
    });

    it('should wrap at empty selection', () => {
      textarea.value = 'Hello World';
      textarea.selectionStart = 5;
      textarea.selectionEnd = 5;

      insertItalic(textarea);

      expect(textarea.value).toBe('Hello **World');
    });

    it('should handle italic at beginning', () => {
      textarea.value = 'World';
      textarea.selectionStart = 0;
      textarea.selectionEnd = 5;

      insertItalic(textarea);

      expect(textarea.value).toBe('*World*');
    });

    it('should handle italic at end', () => {
      textarea.value = 'Hello World';
      textarea.selectionStart = 6;
      textarea.selectionEnd = 11;

      insertItalic(textarea);

      expect(textarea.value).toBe('Hello *World*');
    });

    it('should handle empty text', () => {
      textarea.value = '';
      textarea.selectionStart = 0;
      textarea.selectionEnd = 0;

      insertItalic(textarea);

      expect(textarea.value).toBe('**');
    });

    it('should handle multiple words', () => {
      textarea.value = 'Hello beautiful world';
      textarea.selectionStart = 6;
      textarea.selectionEnd = 15;

      insertItalic(textarea);

      expect(textarea.value).toBe('Hello *beautiful* world');
    });
  });

  describe('insertLink', () => {
    it('should wrap selected text as link text', () => {
      textarea.value = 'Click here';
      textarea.selectionStart = 6;
      textarea.selectionEnd = 10;

      insertLink(textarea);

      expect(textarea.value).toBe('Click [here](https://)');
    });

    it('should use default link text when nothing selected', () => {
      textarea.value = 'Hello World';
      textarea.selectionStart = 5;
      textarea.selectionEnd = 5;

      insertLink(textarea);

      expect(textarea.value).toBe('Hello [link text](https://)World');
    });

    it('should handle link at beginning', () => {
      textarea.value = 'World';
      textarea.selectionStart = 0;
      textarea.selectionEnd = 5;

      insertLink(textarea);

      expect(textarea.value).toBe('[World](https://)');
    });

    it('should handle link at end', () => {
      textarea.value = 'Check this';
      textarea.selectionStart = 6;
      textarea.selectionEnd = 10;

      insertLink(textarea);

      expect(textarea.value).toBe('Check [this](https://)');
    });

    it('should handle empty text', () => {
      textarea.value = '';
      textarea.selectionStart = 0;
      textarea.selectionEnd = 0;

      insertLink(textarea);

      expect(textarea.value).toBe('[link text](https://)');
    });

    it('should preserve text before and after', () => {
      textarea.value = 'Start middle end';
      textarea.selectionStart = 6;
      textarea.selectionEnd = 12;

      insertLink(textarea);

      expect(textarea.value).toBe('Start [middle](https://) end');
    });

    it('should handle null selection', () => {
      textarea.value = 'Hello World';
      textarea.selectionStart = 0;
      textarea.selectionEnd = 0;

      insertLink(textarea);

      expect(textarea.value).toContain('[link text](https://)');
    });
  });

  describe('insertEmoji', () => {
    it('should insert emoji at cursor position', () => {
      textarea.value = 'Hello World';
      textarea.selectionStart = 5;
      textarea.selectionEnd = 5;

      insertEmoji(textarea, '👋');

      expect(textarea.value).toBe('Hello 👋World');
    });

    it('should replace selected text with emoji', () => {
      textarea.value = 'Hello World';
      textarea.selectionStart = 6;
      textarea.selectionEnd = 11;

      insertEmoji(textarea, '😀');

      expect(textarea.value).toBe('Hello 😀');
    });

    it('should insert emoji at beginning', () => {
      textarea.value = 'World';
      textarea.selectionStart = 0;
      textarea.selectionEnd = 0;

      insertEmoji(textarea, '🚀');

      expect(textarea.value).toBe('🚀World');
    });

    it('should insert emoji at end', () => {
      textarea.value = 'Hello';
      textarea.selectionStart = 5;
      textarea.selectionEnd = 5;

      insertEmoji(textarea, '✨');

      expect(textarea.value).toBe('Hello✨');
    });

    it('should handle empty text', () => {
      textarea.value = '';
      textarea.selectionStart = 0;
      textarea.selectionEnd = 0;

      insertEmoji(textarea, '😊');

      expect(textarea.value).toBe('😊');
    });

    it('should handle multiple emoji insertions', () => {
      textarea.value = '';
      textarea.selectionStart = 0;
      textarea.selectionEnd = 0;

      insertEmoji(textarea, '❤️');
      const firstLen = textarea.value.length;

      textarea.selectionStart = firstLen;
      textarea.selectionEnd = firstLen;
      insertEmoji(textarea, '💔');

      expect(textarea.value).toContain('❤️');
      expect(textarea.value).toContain('💔');
    });

    it('should handle wide emoji', () => {
      textarea.value = 'Hello';
      textarea.selectionStart = 5;
      textarea.selectionEnd = 5;

      insertEmoji(textarea, '👨‍👩‍👧‍👦');

      expect(textarea.value).toContain('👨‍👩‍👧‍👦');
    });

    it('should not modify selection when replacing text', () => {
      textarea.value = 'Hello World';
      textarea.selectionStart = 0;
      textarea.selectionEnd = 5;

      insertEmoji(textarea, '👋');

      expect(textarea.value).toBe('👋 World');
    });
  });

  describe('Formatter Edge Cases', () => {
    it('should handle consecutive formatter calls', () => {
      textarea.value = 'word';
      textarea.selectionStart = 0;
      textarea.selectionEnd = 4;

      insertBold(textarea);
      const afterBold = textarea.value;

      textarea.selectionStart = 1;
      textarea.selectionEnd = 5;
      insertItalic(textarea);

      expect(textarea.value).toContain('**');
      expect(textarea.value).toContain('*');
    });

    it('should handle very long text', () => {
      const longText = 'a'.repeat(1000);
      textarea.value = longText;
      textarea.selectionStart = 0;
      textarea.selectionEnd = 100;

      insertBold(textarea);

      expect(textarea.value).toContain('**');
      expect(textarea.value.length).toBeGreaterThan(longText.length);
    });

    it('should handle null/undefined gracefully', () => {
      textarea.value = 'test';
      textarea.selectionStart = 0;
      textarea.selectionEnd = 4;

      expect(() => insertBold(textarea)).not.toThrow();
      expect(() => insertItalic(textarea)).not.toThrow();
      expect(() => insertLink(textarea)).not.toThrow();
      expect(() => insertEmoji(textarea, '')).not.toThrow();
    });

    it('should maintain cursor position consistency', () => {
      textarea.value = 'Hello';
      const positions = [0, 2, 5];

      for (const pos of positions) {
        textarea.selectionStart = pos;
        textarea.selectionEnd = pos;

        const valueBefore = textarea.value;
        insertBold(textarea);
        expect(textarea.selectionStart).toBe(textarea.selectionEnd);
      }
    });
  });
});
