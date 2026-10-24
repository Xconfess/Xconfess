"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/app/lib/utils/cn";
import { sanitizeMarkdown } from "@/app/lib/utils/markdown";

interface PreviewPanelProps {
  title?: string;
  body: string;
  className?: string;
}

export const PreviewPanel: React.FC<PreviewPanelProps> = ({
  title,
  body,
  className,
}) => {
  return (
    <div
      className={cn(
        "rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 min-h-[200px]",
        className
      )}
    >
      {title && (
        <h3 className="text-xl font-semibold text-[var(--foreground)] mb-4 pb-4 border-b border-[var(--border)]">
          {title}
        </h3>
      )}
      <div className="prose prose-invert prose-zinc max-w-none">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            p: ({ children }) => (
              <p className="text-[var(--foreground)] mb-4 leading-relaxed">{children}</p>
            ),
            h1: ({ children }) => (
              <h1 className="text-2xl font-semibold text-[var(--foreground)] mb-4">{children}</h1>
            ),
            h2: ({ children }) => (
              <h2 className="text-xl font-semibold text-[var(--foreground)] mb-3">{children}</h2>
            ),
            h3: ({ children }) => (
              <h3 className="text-lg font-semibold text-[var(--foreground)] mb-2">{children}</h3>
            ),
            strong: ({ children }) => (
              <strong className="font-semibold text-[var(--foreground)]">{children}</strong>
            ),
            em: ({ children }) => (
              <em className="italic text-[var(--foreground)]">{children}</em>
            ),
            a: ({ href, children }) => (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--primary-deep)] hover:text-[var(--primary-deep)] underline"
              >
                {children}
              </a>
            ),
            ul: ({ children }) => (
              <ul className="list-disc list-inside mb-4 text-[var(--foreground)] space-y-1">
                {children}
              </ul>
            ),
            ol: ({ children }) => (
              <ol className="list-decimal list-inside mb-4 text-[var(--foreground)] space-y-1">
                {children}
              </ol>
            ),
            li: ({ children }) => (
              <li className="text-[var(--foreground)]">{children}</li>
            ),
            code: ({ children, className }) => {
              const isInline = !className;
              return isInline ? (
                <code className="bg-[var(--surface-muted)] text-[var(--foreground)] px-1.5 py-0.5 rounded text-sm">
                  {children}
                </code>
              ) : (
                <code className={className}>{children}</code>
              );
            },
            pre: ({ children }) => (
              <pre className="bg-[var(--surface-muted)] rounded-lg p-4 mb-4 overflow-x-auto">
                {children}
              </pre>
            ),
            blockquote: ({ children }) => (
              <blockquote className="border-l-4 border-[var(--border)] pl-4 italic text-[var(--secondary)] mb-4">
                {children}
              </blockquote>
            ),
          }}
        >
          {sanitizeMarkdown(body) || "*No content to preview*"}
        </ReactMarkdown>
      </div>
    </div>
  );
};
