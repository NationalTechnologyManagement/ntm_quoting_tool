// Floating AI chat widget. Lives at the App level so it persists across
// every wizard page. Two layouts:
//   - Mobile (< sm): full-bottom drawer that slides up to ~85vh
//   - Desktop: 380px panel anchored bottom-right
// Hidden entirely when the admin has disabled the assistant.

import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Bot, X, Send, AlertTriangle, RefreshCcw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAiChat } from '@/contexts/AiChatContext';

export const AiChatWidget = () => {
  const { enabled, open, setOpen, messages, send, status, fallbackActive, reset, session } = useAiChat();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open]);

  // Hide on admin pages and on payment-result pages — those aren't part of
  // the quote-building flow the assistant is here to help with.
  const route = location.pathname;
  const hidden = route.startsWith('/admin') || route === '/payment-success' || route === '/payment-cancelled';
  if (hidden) return null;
  if (!enabled) return null;

  const submit = async () => {
    const v = input.trim();
    if (!v) return;
    setInput('');
    await send(v);
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <>
      {/* Floating launcher */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open AI assistant"
          className="fixed bottom-4 right-4 z-50 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all flex items-center justify-center"
        >
          <Bot className="w-6 h-6" />
          <span className="sr-only">Open AI assistant</span>
        </button>
      )}

      {/* Panel */}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="AI assistant"
          className="fixed inset-x-0 bottom-0 z-50 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-[380px] flex flex-col rounded-t-xl sm:rounded-xl bg-card border border-border shadow-2xl"
          style={{ maxHeight: 'min(85vh, 720px)' }}
        >
          {/* Header */}
          <div className="flex items-center gap-2 p-3 border-b border-border bg-card rounded-t-xl">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Bot className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-sm">NTM Assistant</p>
                {fallbackActive && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> backup model
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground truncate">{session?.disclaimer}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={reset} title="Start fresh">
              <RefreshCcw className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} title="Close">
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 bg-secondary/20">
            {messages.length === 0 && status !== 'streaming' && (
              <div className="text-center text-sm text-muted-foreground py-8">
                <Sparkles className="w-5 h-5 mx-auto mb-2 text-primary" />
                Ask me anything about packages, pricing, or how to fill out your quote.
              </div>
            )}
            {messages.map((m) => (
              <MessageBubble key={m.id} role={m.role} content={m.content} fallback={m.fallback} toolCalls={m.toolCalls} />
            ))}
            {status === 'streaming' && messages[messages.length - 1]?.role !== 'assistant' && (
              <div className="text-xs text-muted-foreground">…thinking</div>
            )}
            {status === 'capped' && (
              <div className="text-xs p-2 rounded bg-amber-50 text-amber-800 border border-amber-200">
                Spend cap reached for this session. Start fresh to continue.
              </div>
            )}
            {status === 'expired' && (
              <div className="text-xs p-2 rounded bg-amber-50 text-amber-800 border border-amber-200">
                Session timed out. Start fresh to continue.
              </div>
            )}
          </div>

          {/* Input */}
          <div className="p-2 border-t border-border bg-card rounded-b-xl">
            <div className="flex gap-2 items-end">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKey}
                rows={1}
                placeholder="Type your question…"
                className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={{ maxHeight: 120 }}
                disabled={status === 'capped' || status === 'expired' || status === 'disabled'}
              />
              <Button
                onClick={submit}
                size="sm"
                disabled={!input.trim() || status === 'streaming' || status === 'capped' || status === 'expired'}
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

interface BubbleProps {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  fallback?: boolean;
  toolCalls?: Array<{ id: string; name: string; arguments: string; applied: boolean; note?: string }>;
}

function MessageBubble({ role, content, toolCalls }: BubbleProps) {
  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-lg rounded-br-sm bg-primary text-primary-foreground px-3 py-2 text-sm whitespace-pre-wrap break-words">
          {content}
        </div>
      </div>
    );
  }
  if (role === 'assistant') {
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-lg rounded-bl-sm bg-card border border-border px-3 py-2 text-sm whitespace-pre-wrap break-words">
          {content || <span className="text-muted-foreground">…</span>}
          {toolCalls && toolCalls.length > 0 && (
            <div className="mt-2 space-y-1">
              {toolCalls.map((c) => (
                <div
                  key={c.id || c.name}
                  className={`text-[11px] px-2 py-1 rounded ${
                    c.applied
                      ? 'bg-primary/10 text-primary border border-primary/20'
                      : 'bg-muted text-muted-foreground border border-border'
                  }`}
                >
                  {c.applied ? '✓' : '–'} {c.name}{c.note ? ` — ${c.note}` : ''}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }
  return null;
}

export default AiChatWidget;
