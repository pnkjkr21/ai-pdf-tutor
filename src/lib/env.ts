/**
 * Shared env helpers — Step 1 stub.
 * DeepSeek and DB URLs are server-only; never NEXT_PUBLIC_*.
 */

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
