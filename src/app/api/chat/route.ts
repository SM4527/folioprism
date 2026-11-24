import { z } from 'zod';
import { AssistantBusyError, askAssistant, chatEnabled } from '@/lib/chat/llm';
import { chatMessages, chatSnapshot } from '@/lib/chat/snapshot';
import { rejectCrossSite } from '@/lib/guard';
import { loadAnalysis } from '@/lib/load-analysis';

const bodySchema = z.object({
  question: z.string().trim().min(1).max(500),
  mergeShareClasses: z.boolean().default(false),
});

/** Answer one question from the current analysis (AI-02, AI-03); 404 without keys, 503 when busy (AI-04). */
export async function POST(request: Request) {
  if (!chatEnabled()) return Response.json({ error: 'Chat is not configured' }, { status: 404 });
  const rejected = rejectCrossSite(request, 'application/json');
  if (rejected) return rejected;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const snapshot = chatSnapshot(await loadAnalysis(parsed.data.mergeShareClasses));
  try {
    return Response.json(await askAssistant(chatMessages(parsed.data.question, snapshot)));
  } catch (error) {
    if (error instanceof AssistantBusyError) return Response.json({ error: error.message }, { status: 503 });
    throw error;
  }
}
