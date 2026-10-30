// Configurable retry wrapper with exponential backoff + full jitter.
export async function withRetry(fn, {
  maxAttempts = 3,
  baseDelayMs = 2000,
  maxDelayMs = 30000,
  retryableError = () => true,
  onRetry = () => {},
} = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (attempt >= maxAttempts || !retryableError(err)) throw err;
      const delay = Math.min(
        maxDelayMs,
        baseDelayMs * Math.pow(2, attempt - 1) * (0.5 + Math.random() * 0.5)
      );
      onRetry({ attempt, delay, error: err });
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
