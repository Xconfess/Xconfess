import { createApiErrorResponse } from "@/lib/apiErrorHandler";
import { proxyDraftRequest, readDraftPayload } from "../proxy";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!id) {
    return createApiErrorResponse("Draft ID is required", { status: 400 });
  }

  const payload = await readDraftPayload(request);
  if (!payload.ok) {
    return payload.response;
  }

  if (typeof payload.body.version !== "number") {
    return createApiErrorResponse("Draft version is required", { status: 400 });
  }

  return proxyDraftRequest(request, `/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({
      content: payload.body.content,
      version: payload.body.version,
    }),
  });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!id) {
    return createApiErrorResponse("Draft ID is required", { status: 400 });
  }

  return proxyDraftRequest(request, `/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
