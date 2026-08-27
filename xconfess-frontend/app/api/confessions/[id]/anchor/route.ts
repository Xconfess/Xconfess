import { getApiBaseUrl } from "@/app/lib/config";
import { createApiErrorResponse } from "@/lib/apiErrorHandler";


export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const BASE_API_URL = getApiBaseUrl();
  const { id } = await params;
  try {
    const body = await request.json();
    const { stellarTxHash } = body;

    if (!stellarTxHash) {
      return createApiErrorResponse("Stellar transaction hash is required", {
        status: 400,
      });
    }

    // Validate transaction hash format (64 hex characters)
    if (!/^[a-fA-F0-9]{64}$/.test(stellarTxHash)) {
      return createApiErrorResponse("Invalid Stellar transaction hash format", {
        status: 400,
      });
    }

    const backendUrl = `${BASE_API_URL}/confessions/${id}/anchor`;

    try {
      const response = await fetch(backendUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ stellarTxHash }),
      });

      if (!response.ok) {
        // Avoid exposing internal backend diagnostics to regular users
        return createApiErrorResponse(
          "Failed to anchor confession on-chain. Please check transaction status or retry.",
          {
            status: response.status,
            upstreamResponse: response,
            fallbackMessage: `Failed to anchor confession: ${response.statusText}`,
            route: "POST /api/confessions/[id]/anchor",
          },
        );
      }

      const data = await response.json();

      return new Response(JSON.stringify({ ...data, status: "confirmed" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (fetchError) {
      // Demo mode fallback
      const isDemoMode =
        process.env.NODE_ENV === "development" ||
        process.env.DEMO_MODE === "true";

      if (isDemoMode) {
        return new Response(
          JSON.stringify({
            id,
            stellarTxHash,
            isAnchored: true,
            status: "confirmed",
            anchoredAt: new Date().toISOString(),
            stellarExplorerUrl: `https://stellar.expert/explorer/testnet/tx/${stellarTxHash}`,
            _demo: true,
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "X-Demo-Mode": "true",
            },
          },
        );
      }

      return createApiErrorResponse(
        "Anchor service is temporarily unavailable. Please try again later.",
        {
          status: 503,
          fallbackMessage: "Backend service unreachable",
          route: "POST /api/confessions/[id]/anchor",
        },
      );
    }
  } catch (error) {
    return createApiErrorResponse(
      "An unexpected error occurred during anchor processing.",
      {
        status: 500,
        route: "POST /api/confessions/[id]/anchor",
      },
    );
  }
}
