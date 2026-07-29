/**
 * Theme constants shared by the server layout and the client provider.
 *
 * These live outside the provider module on purpose: importing them from a
 * `"use client"` file into a server component would hand the server a client
 * reference instead of the real value.
 */

export type AppTheme = "dark" | "light";

export const THEME_COOKIE = "ftl-app-theme";
export const THEME_STORAGE_KEY = "ftl-app-theme";
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isAppTheme(value: unknown): value is AppTheme {
  return value === "dark" || value === "light";
}
