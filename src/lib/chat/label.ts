/** Muted caption under a reply, for example "via Groq · openai/gpt-oss-120b". */
export function providerLabel(provider: string, model: string): string {
  return `via ${provider} · ${model}`;
}
