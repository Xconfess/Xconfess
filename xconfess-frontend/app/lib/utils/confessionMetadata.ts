import type { Metadata } from "next";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const HIDDEN_MODERATION_STATUSES = new Set(["rejected", "hidden", "removed"]);

/** True only for confessions whose content may appear in link previews. */
export function isConfessionPreviewable(data: any): boolean {
  if (!data) return false;
  if (data.isDeleted || data.is_deleted || data.deletedAt || data.deleted_at)
    return false;
  if (data.isHidden || data.is_hidden) return false;
  const status = String(
    data.moderationStatus ?? data.moderation_status ?? "",
  ).toLowerCase();
  if (HIDDEN_MODERATION_STATUSES.has(status)) return false;
  if (data.status && String(data.status).toLowerCase() !== "published")
    return false;
  return true;
}

/** Public confession links only ever carry the non-sequential UUID. */
export function confessionPublicUrl(appUrl: string, id: string): string {
  return UUID_RE.test(id)
    ? `${appUrl}/confessions/${id}`
    : `${appUrl}/confessions`;
}

export function buildConfessionMetadata(
  appUrl: string,
  id: string,
  confession: { content: string; previewable?: boolean } | null,
): Metadata {
  const showContent = !!confession && confession.previewable !== false;
  const content = showContent ? confession!.content : "";
  const title = confession
    ? "Confession — xConfess"
    : "Confession not found — xConfess";
  const description = showContent
    ? content.slice(0, 155).replace(/\n/g, " ") +
      (content.length > 155 ? "…" : "")
    : "View confession on xConfess";
  const url = confessionPublicUrl(appUrl, id);
  const ogImage = showContent
    ? `${appUrl}/api/og?text=${encodeURIComponent(content.slice(0, 150))}`
    : `${appUrl}/api/og?text=XConfess`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      type: "article",
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: "XConfess - Anonymous Confession",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
    alternates: { canonical: url },
  };
}
