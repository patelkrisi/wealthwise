import Anthropic from '@anthropic-ai/sdk';
import { q } from '../db';
import { todayIST } from '../dates';

// Model choice per PRD §5: a fast model for every-entry jobs, a stronger one for reasoning/chat.
export const FAST_MODEL = process.env.CLAUDE_FAST_MODEL || 'claude-haiku-5-5';
export const SMART_MODEL = process.env.CLAUDE_SMART_MODEL || 'claude-sonnet-5-5';

let client: Anthropic | null = null;

export function hasClaude() {
  return !!process.env.ANTHROPIC_API_KEY;
}

/** Server-only Claude client. The key never reaches the browser. */
export function claude(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 20000, maxRetries: 1 });
  return client;
}

/**
 * Spend guard: counts Claude calls per IST day and refuses once AI_DAILY_LIMIT (default 1500) is reached,
 * so a bill can never run away. Callers fall back to the free built-in engine when this throws.
 */
export async function useAiBudget(kind: string) {
  const limit = Number(process.env.AI_DAILY_LIMIT || 1500);
  const [r] = await q<{ total: number }>(
    `with up as (insert into ai_usage(day,kind,calls) values($1,$2,1) on conflict(day,kind) do update set calls=ai_usage.calls+1 returning calls)
     select (select coalesce(sum(calls),0) from ai_usage where day=$1)::int + 1 as total from up`,
    [todayIST(), kind],
  );
  if (r.total > limit) throw new Error('Daily AI limit reached — using the built-in engine');
}

/** Call a model and force a single tool call; returns the tool input (structured JSON). */
export async function callTool<T>(opts: {
  model: string;
  system: string;
  user: string;
  tool: { name: string; description: string; input_schema: Record<string, unknown> };
  maxTokens?: number;
}): Promise<T> {
  await useAiBudget(opts.model === FAST_MODEL ? 'fast' : 'smart');
  const res = await claude().messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens ?? 1024,
    system: opts.system,
    tools: [opts.tool as any],
    tool_choice: { type: 'tool', name: opts.tool.name },
    messages: [{ role: 'user', content: opts.user }],
  });
  const block = res.content.find((b: any) => b.type === 'tool_use') as any;
  if (!block) throw new Error('Claude returned no tool call');
  return block.input as T;
}
