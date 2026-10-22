# Frontend responsive and private flows

## Wallet identity on narrow screens

The receive-wallet page displays the complete public wallet address and allows it to wrap at any character boundary. Copy and share actions wrap onto additional lines when needed and remain available at narrow viewport sizes. The responsive browser test covers 320, 375, and 414 CSS-pixel widths with root text size enlarged to 200%. No application setting is required.

## Received tip history

The authenticated profile requests tip history for the current user and displays received tips only. While data loads, an accessible status region uses rows shaped like the final content. Empty history has a separate message; failed requests show a generic error and a retry action. Backend error text and confession previews are not displayed. There is no additional configuration.

## Private message draft recovery

Unsent drafts are stored per conversation in `sessionStorage` for the current browser tab under `xconfess_message_drafts`. If the session expires while composing, the `/messages` expiry screen explains that the user can log in and reopen the conversation. Re-authentication does not send the draft; sending still requires an explicit action. A draft is removed after successful send or explicit discard. If browser storage is unavailable, drafts remain in memory only.
