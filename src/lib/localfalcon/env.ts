import { LocalFalconClient } from "./client";

const KEY = "LOCALFALCON_API_KEY";

/**
 * Read API key from the environment (server-side only).
 * Set in `.env.local` for development and in Vercel project env vars for production.
 */
export function getLocalFalconApiKey(): string {
  const key = process.env[KEY]?.trim();
  if (!key) {
    throw new Error(
      `${KEY} is not set. Add it to .env.local or your host's environment.`,
    );
  }
  return key;
}

export function createLocalFalconClient(): LocalFalconClient {
  return new LocalFalconClient(getLocalFalconApiKey());
}
