// Client-side wrapper for the AI chat endpoints. Handles:
//   - session lifecycle (relies on the HttpOnly cookie set by the server)
//   - SSE consumption for streaming turns
//
// The OpenRouter API key is NEVER sent here — that's a server-only concern.
// Everything goes through our /api/ai-chat/* proxy.

const API_BASE = import.meta.env.VITE_API_URL || '';

async function jsonFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, {
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
    ...init,
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({ error: 'Request failed' }));
    const err = new Error(body.error || `HTTP ${r.status}`);
    (err as any).status = r.status;
    throw err;
  }
  return r.json() as Promise<T>;
}

export interface SessionInfo {
  sessionId: string;
  greeting: string;
  disclaimer: string;
  perSessionUsdCap: number;
  idleTimeoutMs: number;
  absoluteTimeoutMs: number;
  usdSpent?: number;
  usingFallback?: boolean;
}

export const aiChatApi = {
  startSession: (quoteId?: string | null) =>
    jsonFetch<SessionInfo>('/api/ai-chat/session', {
      method: 'POST',
      body: JSON.stringify({ quoteId: quoteId ?? null }),
    }),

  getSession: () => jsonFetch<SessionInfo>('/api/ai-chat/session'),

  endSession: () => jsonFetch<{ success: true }>('/api/ai-chat/end', { method: 'POST' }),

  loadHistory: () =>
    jsonFetch<{
      messages: Array<{
        id: string;
        role: 'user' | 'assistant' | 'system' | 'tool';
        content: string;
        toolCalls: any;
        fallback: boolean;
        createdAt: string;
      }>;
    }>('/api/ai-chat/messages'),
};

export interface StreamHandlers {
  onToken: (text: string) => void;
  onTool: (call: { id: string; name: string; arguments: string }) => void;
  onDone: (info: { model: string; fallback: boolean; usdCost: number; finishReason: string }) => void;
  onError: (msg: string) => void;
}

export async function streamMessage(
  body: { message: string; pageSnapshot: unknown },
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/ai-chat/message`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    handlers.onError(errBody.error || `HTTP ${res.status}`);
    return;
  }
  if (!res.body) {
    handlers.onError('No stream body');
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let eventName = 'message';

  // Parse the SSE wire format: blank-line-separated frames, each frame having
  // "event: x" and one-or-more "data: ..." lines.
  const flushFrame = (data: string) => {
    if (!data) return;
    let parsed: any;
    try { parsed = JSON.parse(data); } catch { return; }
    switch (eventName) {
      case 'token':
        handlers.onToken(parsed.text ?? '');
        break;
      case 'tool':
        handlers.onTool(parsed);
        break;
      case 'done':
        handlers.onDone(parsed);
        break;
      case 'error':
        handlers.onError(parsed.message || 'Unknown error');
        break;
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let frameEnd = buffer.indexOf('\n\n');
    while (frameEnd >= 0) {
      const frame = buffer.slice(0, frameEnd);
      buffer = buffer.slice(frameEnd + 2);
      frameEnd = buffer.indexOf('\n\n');

      let dataAcc = '';
      eventName = 'message';
      for (const line of frame.split('\n')) {
        if (line.startsWith('event:')) eventName = line.slice(6).trim();
        else if (line.startsWith('data:')) dataAcc += line.slice(5).trimStart();
      }
      flushFrame(dataAcc);
    }
  }
}
