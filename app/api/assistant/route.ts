import { api, currentUser, errorResponse } from '@/lib/auth';
import { chat, chatHistory, checkChatCap, clearChat } from '@/lib/services/assistant';
import { NextResponse } from 'next/server';

export const GET = api(async (_req, u) => chatHistory(u.id));
export const DELETE = api(async (_req, u) => clearChat(u.id));

/** Ask Wealthwise — streams newline-delimited JSON events: text deltas, chart, follow-up chips. */
export async function POST(req: Request) {
  try {
    const u = await currentUser();
    if (!u) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    const { message } = await req.json();
    const cap = await checkChatCap(u.id);
    const enc = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        if (cap) controller.enqueue(enc.encode(JSON.stringify({ t: 'cap', v: cap }) + '\n'));
        try {
          for await (const ev of chat(u.id, String(message || ''))) controller.enqueue(enc.encode(JSON.stringify(ev) + '\n'));
        } catch (e: any) {
          controller.enqueue(enc.encode(JSON.stringify({ t: 'error', v: 'Sorry, something went wrong. Please try again.' }) + '\n'));
          console.error(e);
        }
        controller.close();
      },
    });
    return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache' } });
  } catch (e) {
    return errorResponse(e);
  }
}
