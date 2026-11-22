export const UNREACHABLE = 'Could not reach the assistant. Check that the app is running, then try again.';
export const NO_REPLY = 'The assistant returned no answer. Please try again.';

/** POST one question to /api/chat and turn the response into exactly one of a reply or an error. */
export async function askChat(question: string, mergeShareClasses: boolean): Promise<{ reply?: string; error?: string }> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question, mergeShareClasses }),
  }).catch(() => null);
  if (!res) return { error: UNREACHABLE };
  const body: { error?: unknown; reply?: unknown } = (await res.json().catch(() => null)) ?? {};
  if (!res.ok) return { error: typeof body.error === 'string' ? body.error : UNREACHABLE };
  return typeof body.reply === 'string' ? { reply: body.reply } : { error: NO_REPLY };
}
