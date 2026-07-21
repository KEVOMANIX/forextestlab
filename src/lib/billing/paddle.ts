import "server-only";

import { Environment, LogLevel, Paddle } from "@paddle/paddle-node-sdk";

export type PaddleMode = "sandbox" | "live";

export function paddleMode(): PaddleMode {
  const value = process.env.PADDLE_MODE?.trim().toLowerCase();
  if (value !== "sandbox" && value !== "live") {
    throw new Error("PADDLE_MODE must be explicitly set to sandbox or live.");
  }
  return value;
}

export type PaddleBrowserEnvironment = "sandbox" | "production";

export function paddleBrowserEnvironment(): PaddleBrowserEnvironment {
  const value = process.env.NEXT_PUBLIC_PADDLE_ENV?.trim().toLowerCase();
  if (value !== "sandbox" && value !== "production") {
    throw new Error("NEXT_PUBLIC_PADDLE_ENV must be explicitly set to sandbox or production.");
  }
  const expected = paddleMode() === "sandbox" ? "sandbox" : "production";
  if (value !== expected) {
    throw new Error(`Paddle environment mismatch: PADDLE_MODE requires NEXT_PUBLIC_PADDLE_ENV=${expected}.`);
  }
  return value;
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

export function configuredPaddleClientToken(): string | undefined {
  return (paddleMode() === "live"
    ? process.env.PADDLE_LIVE_CLIENT_TOKEN
    : process.env.PADDLE_SANDBOX_CLIENT_TOKEN
  )?.trim() || process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN?.trim();
}

export function paddleClientReady(): boolean {
  const token = configuredPaddleClientToken();
  const environment = paddleBrowserEnvironment();
  return Boolean(
    token &&
      (token.startsWith("test_") || token.startsWith("live_")) &&
      environment === (paddleMode() === "live" ? "production" : "sandbox"),
  );
}

export function requiredPaddleClientToken(): string {
  const token = configuredPaddleClientToken();
  const expectedPrefix = paddleMode() === "sandbox" ? "test_" : "live_";
  if (!token || !token.startsWith(expectedPrefix)) {
    throw new Error(`The configured Paddle client token must begin with ${expectedPrefix}.`);
  }
  return token;
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
