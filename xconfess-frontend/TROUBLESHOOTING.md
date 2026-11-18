# Frontend development troubleshooting

## Frontend cannot reach the backend

- Start the backend and check `http://localhost:5000/api/health/live`.
- In `xconfess-frontend/.env.local`, set `BACKEND_API_URL=http://localhost:5000/api` for server-side proxy routes and `NEXT_PUBLIC_API_URL=http://localhost:5000/api` for browser requests. Set `NEXT_PUBLIC_WS_URL=ws://localhost:5000` for real-time updates.
- Restart the frontend after changing environment values. `NEXT_PUBLIC_*` values are embedded when Next.js starts or builds.
- In browser DevTools → Network, inspect the failing `/api/` request and confirm its URL/status. Check backend and frontend terminal output; redact cookies, tokens, and other secrets before sharing logs.

## Changes do not appear or the app looks stale

Production registers `/sw.js`, which can serve cached offline content. In browser DevTools → Application → Service Workers, select **Unregister**, then reload the page. If stale content remains, clear the site's Cache Storage entries beginning with `xconfess-` in Application → Storage and reload.

Clearing all site data also removes local offline data and pending writes. Do this only if needed, and first reconnect and allow queued changes to sync.

## Environment changes have no effect

- Check spelling and values in `xconfess-frontend/.env.local`; use the variable names in the frontend README's Environment section.
- Keep server-only settings such as `BACKEND_API_URL` distinct from browser-exposed `NEXT_PUBLIC_*` settings. Never put secrets in a `NEXT_PUBLIC_*` variable.
- Stop and restart the frontend after editing `.env.local`. For production builds, rebuild after changing build-time `NEXT_PUBLIC_*` values.

## Windows: npm is blocked in PowerShell

If PowerShell reports that script execution is disabled when running `npm`, use the Windows command shim, for example:

```powershell
npm.cmd install
npm.cmd run dev --workspace=xconfess-frontend
```

This avoids changing the machine's PowerShell execution policy.
