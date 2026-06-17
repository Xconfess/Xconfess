import { getApiBaseUrl } from "@/app/lib/config";
import { createApiErrorResponse } from "@/lib/apiErrorHandler";

const BASE_API_URL = getApiBaseUrl();

type DemoConfessionSeed = {
  content: string;
  commentCount: number;
  createdAt?: string;
  viewCount?: number;
  reactions?: { like: number; love: number };
  isAnchored?: boolean;
  stellarTxHash?: string | null;
};

const DEMO_CONFESSIONS: Record<string, DemoConfessionSeed> = {
  "1": {
    content:
      "I love coding at midnight when everyone else is asleep. There's something magical about the quiet and the glow of the screen. I feel most creative during these hours, and my best ideas come when the world is quiet.",
    commentCount: 8,
  },
  "2": {
    content:
      "I secretly watch cartoons even though I'm an adult. They bring me joy and comfort, and I don't care what anyone thinks. Some of my favorite shows have amazing storytelling.",
    commentCount: 15,
  },
  "3": {
    content:
      "I talk to my plants every morning. It helps me start the day positively and makes me feel connected to nature. I swear they grow better when I do this.",
    commentCount: 5,
  },
  "4": {
    content:
      "I go for midnight walks alone and find them incredibly peaceful. The streets are quiet, the air is fresh, and I can think clearly without distractions.",
    commentCount: 12,
  },
  "5": {
    content:
      "I write poems that no one will ever read. But that's okay because writing them helps me process my emotions and understand myself better.",
    commentCount: 3,
  },
  "wave-1": {
    content:
      "Wave demo confession: I finally told my team I was overloaded, and they helped me untangle the week.",
    commentCount: 1,
    createdAt: "2026-05-20T10:00:00.000Z",
    viewCount: 42,
    reactions: { like: 7, love: 3 },
    isAnchored: true,
    stellarTxHash: "demo-wave-stellar-tx",
  },
};

const DEFAULT_DEMO_CONFESSION: DemoConfessionSeed = {
  content:
    "This is a demo confession. Visit the feed to see more confessions when the backend is running.",
  commentCount: 2,
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    if (!id) {
      return createApiErrorResponse("Confession ID is required", { status: 400 });
    }

    const url = `${BASE_API_URL}/confessions/${id}`;
    const response = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      next: { revalidate: 30 },
    });

    if (!response.ok) {
      const isDemoMode =
        process.env.NODE_ENV === "development" ||
        process.env.DEMO_MODE === "true";

      if (response.status === 404) {
        // In demo mode, return demo data instead of 404
        if (isDemoMode) {
          console.warn(
            "Confession not found in backend, returning demo data for testing",
          );
          const normalized = buildDemoConfession(id);

          return new Response(JSON.stringify(normalized), {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "X-Demo-Mode": "true",
            },
          });
        }

        return new Response(
          JSON.stringify({ message: "Confession not found" }),
          { status: 404, headers: { "Content-Type": "application/json" } },
        );
      }
      const err = await response.json().catch(() => ({}));
      return createApiErrorResponse(err, {
        status: response.status,
        fallbackMessage: "Failed to fetch confession",
        route: "GET /api/confessions/[id]"
      });
    }

    const data = await response.json();

    // Normalize to frontend shape: message -> content, created_at -> createdAt, view_count -> viewCount
    const normalized = {
      id: data.id,
      content: data.message ?? data.body ?? data.content,
      message: data.message,
      createdAt: data.created_at ?? data.createdAt,
      created_at: data.created_at,
      viewCount: data.view_count ?? data.viewCount ?? 0,
      view_count: data.view_count,
      reactions: aggregateReactions(data.reactions),
      commentCount: Array.isArray(data.comments)
        ? data.comments.length
        : (data.commentCount ?? 0),
      isAnchored: data.isAnchored ?? data.is_anchored ?? false,
      stellarTxHash: data.stellarTxHash ?? data.stellar_tx_hash ?? null,
      author: data.anonymousUser
        ? { id: data.anonymousUser.id, username: "Anonymous", avatar: null }
        : undefined,
    };

    return new Response(JSON.stringify(normalized), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const isDemoMode =
      process.env.NODE_ENV === "development" ||
      process.env.DEMO_MODE === "true";

    if (isDemoMode) {
      console.warn("Backend unreachable, returning demo data for testing");

      const { id } = await context.params;
      const normalized = buildDemoConfession(id);

      return new Response(JSON.stringify(normalized), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "X-Demo-Mode": "true",
        },
      });
    }

    return createApiErrorResponse(error, {
      status: 500,
      route: "GET /api/confessions/[id]"
    });
  }
}

function buildDemoConfession(id: string) {
  const demoData = DEMO_CONFESSIONS[id] || DEFAULT_DEMO_CONFESSION;
  const createdAt =
    demoData.createdAt ??
    new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString();
  const viewCount = demoData.viewCount ?? Math.floor(Math.random() * 200) + 10;
  const reactions = demoData.reactions ?? {
    like: Math.floor(Math.random() * 20) + 1,
    love: Math.floor(Math.random() * 15) + 1,
  };
  const isAnchored = demoData.isAnchored ?? Math.random() > 0.7;
  const stellarTxHash =
    "stellarTxHash" in demoData
      ? demoData.stellarTxHash
      : isAnchored
        ? `demo-tx-${Date.now()}`
        : null;

  return {
    id,
    content: demoData.content,
    message: demoData.content,
    createdAt,
    created_at: createdAt,
    viewCount,
    view_count: viewCount,
    reactions,
    commentCount: demoData.commentCount,
    isAnchored,
    stellarTxHash,
    author: {
      id: "anonymous",
      username: "Anonymous",
      avatar: null,
    },
    _demo: true,
  };
}

function aggregateReactions(reactions: Array<{ emoji?: string }> | undefined): {
  like: number;
  love: number;
} {
  if (!Array.isArray(reactions)) return { like: 0, love: 0 };
  let like = 0;
  let love = 0;
  for (const r of reactions) {
    const e = (r.emoji ?? "").toLowerCase();
    if (e === "👍" || e === "like") like++;
    else if (e === "❤️" || e === "love") love++;
  }
  return { like, love };
}
