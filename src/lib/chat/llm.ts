import { z } from 'zod';
import type { ChatMessage } from './snapshot';

export const BUSY_MESSAGE = 'The assistant is busy, please try again in a minute.';

/** Every configured provider failed (D-02). */
export class AssistantBusyError extends Error {
  constructor() {
    super(BUSY_MESSAGE);
  }
}

/** Groq first, OpenRouter's free model as the fallback (D-02). */
const PROVIDERS = [
  { name: 'groq', url: 'https://api.groq.com/openai/v1/chat/completions', model: 'openai/gpt-oss-120b', key: 'GROQ_API_KEY', extra: {} },
  {
    name: 'openrouter',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'nvidia/nemotron-3.5-super-vl:free',
    key: 'OPENROUTER_API_KEY',
    extra: { provider: { require_parameters: true } },
  },
];

type Provider = (typeof PROVIDERS)[number];

const RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'chat_reply',
    strict: true,
    schema: { type: 'object', properties: { reply: { type: 'string' } }, required: ['reply'], additionalProperties: false },
  },
};

const replySchema = z.object({ reply: z.string().min(1) });

/** Providers whose key is set, read at call time. */
function configuredProviders(): Provider[] {
  return PROVIDERS.filter((p) => Boolean(process.env[p.key]));
}

/** True when at least one provider key is set (AI-04). */
export function chatEnabled(): boolean {
  return configuredProviders().length > 0;
}

/** One provider call; returns the reply, or null on any failure. */
async function ask(provider: Provider, messages: ChatMessage[]): Promise<string | null> {
  const response = await fetch(provider.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env[provider.key]}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: provider.model, messages, temperature: 0.2, response_format: RESPONSE_FORMAT, ...provider.extra }),
    signal: AbortSignal.timeout(60_000),
  }).catch(() => null);
  if (!response?.ok) {
    console.warn('chat provider failed', provider.name, response?.status ?? 'network');
    return null;
  }
  const body = await response.json().catch(() => null);
  const parsed = replySchema.safeParse(parseJson(body?.choices?.[0]?.message?.content));
  if (!parsed.success) {
    console.warn('chat provider failed', provider.name, 'invalid reply');
    return null;
  }
  console.info('chat answered', provider.name, 'prompt_tokens', body?.usage?.prompt_tokens);
  return parsed.data.reply;
}

function parseJson(text: unknown): unknown {
  if (typeof text !== 'string') return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Ask each configured provider in order; throws AssistantBusyError when all fail. */
export async function askAssistant(messages: ChatMessage[]): Promise<string> {
  for (const provider of configuredProviders()) {
    const reply = await ask(provider, messages);
    if (reply !== null) return reply;
  }
  throw new AssistantBusyError();
}
