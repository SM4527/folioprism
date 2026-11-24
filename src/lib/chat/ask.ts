export const UNREACHABLE = 'Could not reach the assistant. Check that the app is running, then try again.';
export const NO_REPLY = 'The assistant returned no answer. Please try again.';

/** POST one question to /api/chat and turn the response into exactly one of a reply or an error. */
export async function askChat(
  question: string,
  mergeShareClasses: boolean,
): Promise<{ reply?: string; provider?: string; model?: string; error?: string }> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question, mergeShareClasses }),
  }).catch(() => null);
  if (!res) return { error: UNREACHABLE };
  const body: { error?: unknown; reply?: unknown; provider?: unknown; model?: unknown } = (await res.json().catch(() => null)) ?? {};
  if (!res.ok) return { error: typeof body.error === 'string' ? body.error : UNREACHABLE };
  if (typeof body.reply !== 'string') return { error: NO_REPLY };
  const { provider, model } = body;
  return typeof provider === 'string' && typeof model === 'string' ? { reply: body.reply, provider, model } : { reply: body.reply };
}
