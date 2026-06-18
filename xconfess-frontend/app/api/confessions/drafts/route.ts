import { proxyDraftRequest, readDraftPayload } from "./proxy";

export async function GET(request: Request) {
  return proxyDraftRequest(request, "", {
    method: "GET",
  });
}

export async function POST(request: Request) {
  const payload = await readDraftPayload(request);
  if (!payload.ok) {
    return payload.response;
  }

  return proxyDraftRequest(request, "", {
    method: "POST",
    body: JSON.stringify({
      content: payload.body.content,
      scheduledFor: payload.body.scheduledFor,
      timezone: payload.body.timezone,
    }),
  });
}
