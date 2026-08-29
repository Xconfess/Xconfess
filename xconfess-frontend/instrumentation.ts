export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    validateEnv({
      strict: process.env.STRICT_ENV_VALIDATION === "true",
    });
  }
}

function validateEnv({ strict }: { strict: boolean }) {
  const required: Array<{ name: string; description: string }> = [
    {
      name: "BACKEND_API_URL",
      description: "Server-side base URL for the NestJS API (e.g. http://localhost:5000/api)",
    },
  ];

  const optional: Array<{ name: string; description: string }> = [
    {
      name: "NEXT_PUBLIC_API_URL",
      description: "Client-side base URL for the NestJS API (same host, public)",
    },
    {
      name: "NEXT_PUBLIC_WS_URL",
      description: "WebSocket URL for real-time updates (e.g. ws://localhost:5000)",
    },
    {
      name: "NEXT_PUBLIC_APP_URL",
      description: "Public URL of this frontend app (used for share links)",
    },
    {
      name: "NEXT_PUBLIC_STELLAR_NETWORK",
      description: "Stellar network: 'testnet' or 'mainnet' (default: testnet)",
    },
  ];

  const missing = required.filter(({ name }) => !process.env[name]);

  if (missing.length > 0) {
    const lines = missing
      .map(({ name, description }) => `  • ${name} — ${description}`)
      .join("\n");
    const message = `Missing required environment variable(s):\n${lines}\n\nSee xconfess-frontend/.env.example for the full list.`;

    if (strict) {
      throw new Error(message);
    }

    console.error(`[xconfess] ${message}`);
  }

  const missingOptional = optional.filter(({ name }) => !process.env[name]);
  if (missingOptional.length > 0) {
    const lines = missingOptional
      .map(({ name, description }) => `  • ${name} — ${description}`)
      .join("\n");
    console.warn(
      `[xconfess] Optional environment variable(s) not set:\n${lines}\n` +
        `Some features may not work. See xconfess-frontend/.env.example for details.`
    );
  }
}
