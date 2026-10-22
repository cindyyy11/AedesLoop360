import createClient from "openapi-fetch";
import type { paths, components } from "../../../packages/contracts/api";
export const api = createClient<paths>({ baseUrl: "", credentials: "same-origin" });
export type Schema = components["schemas"];
export function result<T>(value: {data?: T; error?: unknown}): T {
  if (value.error || !value.data) {
    const error = value.error as {message?: string; detail?: unknown} | undefined;
    throw new Error(error?.message ?? (error?.detail ? JSON.stringify(error.detail) : "Server unavailable. Check the API and retry."));
  }
  return value.data;
}
export function key() { return { "Idempotency-Key": crypto.randomUUID() }; }
