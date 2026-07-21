import "server-only";

import { Environment, LogLevel, Paddle } from "@paddle/paddle-node-sdk";

export type PaddleMode = "sandbox" | "live";

export function paddleMode(): PaddleMode {
  return process.env.PADDLE_MODE?.trim().toLowerCase() === "live" ? "live" : "sandbox";
}

export function configuredPaddleApiKey(): string | undefined {
  return (paddleMode() === "live"
    ? process.env.PADDLE_LIVE_API_KEY
    : process.env.PADDLE_SANDBOX_API_KEY
  )?.trim() || process.env.PADDLE_API_KEY?.trim();
}

export function configuredPaddleWebhookSecret(): string | undefined {
  return (paddleMode() === "live"
    ? process.env.PADDLE_LIVE_WEBHOOK_SECRET
    : process.env.PADDLE_SANDBOX_WEBHOOK_SECRET
  )?.trim() || process.env.PADDLE_NOTIFICATION_WEBHOOK_SECRET?.trim();
}

export function configuredPaddlePriceId(interval: "month" | "year"): string | undefined {
  const prefix = paddleMode() === "live" ? "PADDLE_LIVE" : "PADDLE_SANDBOX";
  return process.env[`${prefix}_${interval === "month" ? "MONTHLY" : "ANNUAL"}_PRICE_ID`]?.trim();
}

export function configuredPaddleClientToken(): string | undefined {
  return (paddleMode() === "live"
    ? process.env.PADDLE_LIVE_CLIENT_TOKEN
    : process.env.PADDLE_SANDBOX_CLIENT_TOKEN
  )?.trim() || process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN?.trim();
}

export function paddleClientReady(): boolean {
  const token = configuredPaddleClientToken();
  const environment = process.env.NEXT_PUBLIC_PADDLE_ENV?.trim() || (paddleMode() === "live" ? "production" : "sandbox");
  return Boolean(
    token &&
      (token.startsWith("test_") || token.startsWith("live_")) &&
      environment === (paddleMode() === "live" ? "production" : "sandbox"),
  );
}

let instance: Paddle | null = null;

export function getPaddleInstance(): Paddle {
  if (instance) return instance;
  const apiKey = configuredPaddleApiKey();
  if (!apiKey) throw new Error("Paddle API credentials are not configured.");
  instance = new Paddle(apiKey, {
    environment: paddleMode() === "live" ? Environment.production : Environment.sandbox,
    logLevel: LogLevel.error,
  });
  return instance;
}
