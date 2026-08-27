import { http, HttpResponse } from "msw";

export const handlers = [
  // Mock GET failures list
  http.get("/api/admin/notifications/failures", () => {
    return HttpResponse.json({
      data: [
        {
          id: "1",
          email: "admin@test.com",
          status: "failed",
          error: "SMTP timeout",
        },
      ],
      total: 1,
    });
  }),

  // Mock retry endpoint
  http.post("/api/admin/notifications/retry/:id", () => {
    return HttpResponse.json({ success: true });
  }),
];
