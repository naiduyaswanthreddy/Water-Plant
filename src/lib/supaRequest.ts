// Lightweight reliability wrapper for async requests (e.g., Supabase)
// - Adds timeout
// - Retries transient failures
// Usage:
//   await withTimeoutRetry(() => supabase.from('...').insert(...), { timeoutMs: 10000, retries: 2 })

export type RetryOptions = {
  timeoutMs?: number;
  retries?: number; // number of re-attempts after the first try
  onAttemptError?: (err: any, attempt: number) => void;
};

export async function withTimeoutRetry<T>(
  fn: () => Promise<T>,
  { timeoutMs = 10000, retries = 3, onAttemptError }: RetryOptions = {}
): Promise<T> {
  let lastErr: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const timeout = new Promise<never>((_, reject) => {
        const id = setTimeout(() => {
          clearTimeout(id);
          reject(new Error('Network timeout'));
        }, timeoutMs);
      });

      const res = await Promise.race([Promise.resolve(fn() as any), timeout]);
      // If the race resolved with fn() result
      // TypeScript: res is T | never; cast to T
      return res as T;
    } catch (err: any) {
      lastErr = err;
      if (onAttemptError) onAttemptError(err, attempt);
      const isLast = attempt === retries;
      // Stop retrying on HTTP 4xx client errors (if shaped like Supabase error)
      const code = (err?.status || err?.code || '').toString();
      const isClientErr = /^4\d\d$/.test(code);
      if (isClientErr || isLast) {
        break;
      }
      // brief backoff
      await delay(300 * (attempt + 1));
    }
  }
  throw lastErr || new Error('Request failed');
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
