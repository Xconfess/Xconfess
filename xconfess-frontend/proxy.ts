import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE_NAME = "xconfess_session";
const ADMIN_ROUTES = ["/admin", "/admin/templates", "/admin/notifications"];

export async function proxy(request: NextRequest) {
	if (
		process.env.NODE_ENV === "development" &&
		process.env.DEV_BYPASS_AUTH === "true"
	) {
		return NextResponse.next();
	}

	const { pathname } = request.nextUrl;
	const isAdminRoute = ADMIN_ROUTES.some((route) => pathname.startsWith(route));

	if (isAdminRoute) {
		const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;

		if (!token) {
			return NextResponse.redirect(new URL("/login", request.url));
		}

		try {
			const payloadBase64 = token.split(".")[1];
			if (!payloadBase64) {
				console.error("Proxy auth error:", {
					reason: "session_cookie_missing_payload",
				});
				return NextResponse.redirect(new URL("/login", request.url));
			}

			const decoded = atob(payloadBase64.replace(/-/g, "+").replace(/_/g, "/"));
			const payload = JSON.parse(decoded);

			if (payload.role !== "admin") {
				return NextResponse.redirect(new URL("/dashboard", request.url));
			}
		} catch (error) {
			console.error("Proxy auth error:", {
				reason: "session_decode_failed",
				name: error instanceof Error ? error.name : "unknown",
			});
			return NextResponse.redirect(new URL("/login", request.url));
		}
	}

	return NextResponse.next();
}

export const config = {
	matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
