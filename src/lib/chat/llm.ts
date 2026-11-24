import { z } from 'zod';
import type { ChatMessage } from './snapshot';

export const BUSY_MESSAGE = 'The assistant is busy, please try again in a minute.';

export const BUSY_FALLBACK_OFF = 'The assistant is busy. Fallback to another provider is off (CHAT_FALLBACK).';

/** Every provider we were allowed to try failed (D-02); the hint says a second provider is configured but unused. */
export class AssistantBusyError extends Error {
  constructor(fallbackHint = false) {
    super(fallbackHint ? BUSY_FALLBACK_OFF : BUSY_MESSAGE);
  }
}

/** Groq first; OpenRouter's free model is used as the fallback only when CHAT_FALLBACK=on (D-02). */
const PROVIDERS = [
  { name: 'groq', label: 'Groq', url: 'https://api.groq.com/openai/v1/chat/completions', model: 'openai/gpt-oss-120b', key: 'GROQ_API_KEY', extra: {} },
  {
    name: 'openrouter',
    label: 'OpenRouter',
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

const warnedValues = new Set<string>();

/** CHAT_FALLBACK is off unless exactly "on"; an unknown value warns once and counts as off. */
export function fallbackEnabled(): boolean {
  const value = process.env.CHAT_FALLBACK || 'off';
  if (value !== 'on' && value !== 'off' && !warnedValues.has(value)) {
    warnedValues.add(value);
    console.warn('CHAT_FALLBACK must be off or on; treating it as off');
  }
  return value === 'on';
}

export interface Answer {
  reply: string;
  provider: string;
  model: string;
}

/** Ask the first configured provider, then the rest only when fallback is on; throws AssistantBusyError when all fail. */
export async function askAssistant(messages: ChatMessage[]): Promise<Answer> {
  const configured = configuredProviders();
  const allowed = fallbackEnabled() ? configured : configured.slice(0, 1);
  for (const provider of allowed) {
    const reply = await ask(provider, messages);
    if (reply === null) continue;
    if (provider !== configured[0]) console.info('chat fell back from', configured[0].name, 'to', provider.name);
    return { reply, provider: provider.label, model: provider.model };
  }
  throw new AssistantBusyError(allowed.length < configured.length);
}
