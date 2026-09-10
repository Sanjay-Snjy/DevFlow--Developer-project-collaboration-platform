import { env } from '../config/env.js';
import { ApiError } from '../utils/errors.js';

/**
 * Gateway between the Node.js API and the Python AI service. The Node layer never talks
 * to an LLM directly and holds no AI provider credentials — it only knows the AI service
 * URL + shared key. This keeps secrets on the Python service / environment only.
 */
export async function callAi<T>(path: string, payload: Record<string, unknown>, timeoutMs = env.aiTimeoutMs): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${env.aiApiUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-service-key': env.aiServiceKey,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const aborted = (err as Error).name === 'AbortError';
    if (aborted) throw new ApiError(504, 'AI_TIMEOUT', 'The AI service took too long to respond');
    throw ApiError.serviceUnavailable('AI service is unavailable. Is the Python service running?', 'AI_SERVICE_UNAVAILABLE');
  }
  clearTimeout(timer);

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw ApiError.serviceUnavailable('AI service returned an invalid response', 'AI_INVALID_RESPONSE');
  }

  if (!res.ok) {
    const err = (body as { error?: { code?: string; message?: string; details?: unknown } })?.error;
    const code = err?.code ?? 'AI_ERROR';
    const message = err?.message ?? 'AI request failed';
    if (res.status === 503 && code === 'AI_NOT_CONFIGURED') {
      throw new ApiError(503, 'AI_NOT_CONFIGURED', 'AI features are not configured. Add an AI provider to the Python service.');
    }
    if (res.status === 400 || res.status === 422) throw ApiError.badRequest(message, err?.details);
    throw new ApiError(res.status >= 500 ? 502 : res.status, code, message, err?.details);
  }

  return body as T;
}
