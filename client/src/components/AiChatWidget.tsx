// Floating AI chat widget. Lives at the App level so it persists across
// every wizard page. Two layouts:
//   - Mobile (< sm): full-bottom drawer that slides up to ~85vh
//   - Desktop: 380px panel anchored bottom-right
// Hidden entirely when the admin has disabled the assistant.

import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Bot, X, Send, AlertTriangle, RefreshCcw, Sparkles, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAiChat, type ContactFormValues, type SizingFormValues, type RecipientFormValues } from '@/contexts/AiChatContext';

// The assistant must reply in plain text — no markdown. Models still emit
// **bold**, ## headings, bullet markers, and en/em dashes despite the prompt,
// and the bubble renders raw text, so we strip those artifacts before display
// as a hard guarantee (prompt instructions alone are unreliable).
function toPlainText(s: string): string {
  return s
    .replace(/`+/g, '')                    // code ticks
    .replace(/^[ \t]*[*\-•][ \t]+/gm, '')  // bullet markers (*, -, •) at line start
    .replace(/\*\*([^*]+?)\*\*/g, '$1')    // **bold** -> text
    .replace(/\*{2,}/g, '')                // any leftover ** run (forbidden, never legit)
    .replace(/__([^_]+?)__/g, '$1')        // __bold__ -> text
    .replace(/^[ \t]*#+[ \t]*/gm, '')      // ATX headings (any #-count) at line start
    .replace(/#{2,}/g, '')                 // stray ## runs anywhere (mid-line too)
    .replace(/[–—]/g, '-')                 // en/em dash -> hyphen
    .replace(/[ \t]{2,}/g, ' ');           // collapse double spaces left by removals
  // Note: a lone '*' (e.g. "3 * 4") and single '#' (e.g. "C#", "#1") are kept
  // on purpose — only the forbidden markdown runs (**, ##) are stripped.
}

const INTRO_DISMISSED_KEY = 'ntm_ai_chat_intro_seen';

export const AiChatWidget = () => {
  const { enabled, open, setOpen, messages, send, status, fallbackActive, reset, session, primeGreeting, showContactForm, submitContactForm, showSizingForm, submitSizingForm, showRecipientForm, submitRecipientForm } = useAiChat();
  const [input, setInput] = useState('');
  const [showIntro, setShowIntro] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const route = location.pathname;
  const onLanding = route === '/' || route === '/quote-builder';

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open]);

  // Click-outside minimizes the panel back to the launcher so the customer can
  // see the page again. Listen on mousedown (fires before click, so a
  // click that both closes the panel and hits a page button doesn't double-
  // act). Ignore clicks inside the panel itself. Native browser popups the
  // agent opens (booking tab) are separate windows, so they don't trip this.
  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const el = panelRef.current;
      if (el && !el.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    // Defer attaching until the next tick so the same click that opened the
    // panel (e.g. the launcher button) doesn't immediately close it.
    const id = window.setTimeout(() => {
      document.addEventListener('mousedown', onDocMouseDown);
    }, 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('mousedown', onDocMouseDown);
    };
  }, [open, setOpen]);

  // When the panel opens, kick off a session so the greeting message lands
  // in the transcript before the customer types anything. No-op if a
  // session already exists.
  useEffect(() => {
    if (open && enabled && !session) {
      primeGreeting().catch(() => { /* surfaced via status state */ });
    }
  }, [open, enabled, session, primeGreeting]);

  // One-time intro toast — fires the first visit to the package picker
  // each browser-session. Auto-clears the moment the customer opens the
  // chat or dismisses, and won't re-appear if they navigate back.
  useEffect(() => {
    if (!enabled || !onLanding) return;
    let seen = false;
    try {
      seen = sessionStorage.getItem(INTRO_DISMISSED_KEY) === '1';
    } catch {
      /* sessionStorage blocked — show every time, no harm done */
    }
    if (seen || open) return;
    const t = window.setTimeout(() => setShowIntro(true), 600);
    return () => window.clearTimeout(t);
  }, [enabled, onLanding, open]);

  const dismissIntro = () => {
    setShowIntro(false);
    try {
      sessionStorage.setItem(INTRO_DISMISSED_KEY, '1');
    } catch {
      /* ignore */
    }
  };

  // Hide on admin pages and on payment-result pages — those aren't part of
  // the quote-building flow the assistant is here to help with.
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
          onClick={() => {
            dismissIntro();
            setOpen(true);
          }}
          aria-label="Open AI assistant"
          className="fixed bottom-4 right-4 z-50 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all flex items-center justify-center"
        >
          <Bot className="w-6 h-6" />
          <span className="sr-only">Open AI assistant</span>
        </button>
      )}

      {/* One-time intro tooltip floating above the launcher */}
      {!open && showIntro && (
        <div
          role="dialog"
          aria-label="AI assistant offer"
          className="fixed bottom-20 right-4 z-50 max-w-[280px] rounded-xl bg-card border border-primary/30 shadow-xl p-3 animate-fade-in"
        >
          <div className="flex items-start gap-2">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
              <MessageCircle className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">Need a hand?</p>
              <p className="text-xs mt-0.5">
                I can help you fill out the quote — answer questions, recommend a package, or
                schedule time with a rep.
              </p>
              <div className="flex gap-2 mt-2">
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    dismissIntro();
                    setOpen(true);
                  }}
                >
                  Yes, help me
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={dismissIntro}
                >
                  No thanks
                </Button>
              </div>
            </div>
            <button
              type="button"
              onClick={dismissIntro}
              aria-label="Dismiss assistant offer"
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Panel */}
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="AI assistant"
          className="fixed inset-x-0 bottom-0 z-50 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-[380px] flex flex-col rounded-t-xl sm:rounded-xl bg-card border border-border shadow-2xl"
          // Fixed height (not max-height) so the panel opens at full chat-widget
          // size even when the transcript is just the greeting.
          style={{ height: 'min(85dvh, 640px)' }}
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
            {messages.length === 0 && status === 'starting' && (
              <div className="text-center text-sm text-muted-foreground py-8">
                <Sparkles className="w-5 h-5 mx-auto mb-2 text-primary animate-pulse" />
                Connecting…
              </div>
            )}
            {messages.length === 0 && status !== 'streaming' && status !== 'starting' && (
              <div className="text-center text-sm text-muted-foreground py-8">
                <Sparkles className="w-5 h-5 mx-auto mb-2 text-primary" />
                Ask me anything about packages, pricing, or how to fill out your quote.
              </div>
            )}
            {messages.map((m) => (
              <MessageBubble key={m.id} role={m.role} content={m.content} fallback={m.fallback} />
            ))}
            {showContactForm && <ContactForm onSubmit={submitContactForm} />}
            {showSizingForm && <SizingForm onSubmit={submitSizingForm} />}
            {showRecipientForm && <RecipientForm onSubmit={submitRecipientForm} />}
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
}

// Tool calls are intentionally NOT rendered — the assistant works the form
// behind the scenes; the customer only sees its plain-text replies (and the
// inline contact form when one is requested).
function MessageBubble({ role, content }: BubbleProps) {
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
    const clean = toPlainText(content);
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-lg rounded-bl-sm bg-card border border-border px-3 py-2 text-sm whitespace-pre-wrap break-words">
          {clean || <span className="text-muted-foreground">…</span>}
        </div>
      </div>
    );
  }
  return null;
}

// Inline contact form rendered in the transcript when the agent calls
// collect_contact. On submit, the context saves the details, pushes the lead
// to GHL, and nudges the agent to continue with sizing questions.
function ContactForm({ onSubmit }: { onSubmit: (values: ContactFormValues) => void }) {
  const [values, setValues] = useState<ContactFormValues>({
    name: '',
    businessName: '',
    email: '',
    phone: '',
    address: '',
  });

  const set = (k: keyof ContactFormValues) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [k]: e.target.value }));

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email);
  const phoneOk = values.phone.replace(/\D/g, '').length >= 10;
  const valid =
    values.name.trim().length > 0 &&
    values.businessName.trim().length > 0 &&
    emailOk &&
    phoneOk &&
    values.address.trim().length > 0;

  const fields: Array<{ k: keyof ContactFormValues; label: string; type?: string; placeholder: string }> = [
    { k: 'name', label: 'Full name', placeholder: 'John Doe' },
    { k: 'businessName', label: 'Business name', placeholder: 'Acme Corp' },
    { k: 'email', label: 'Email', type: 'email', placeholder: 'john@example.com' },
    { k: 'phone', label: 'Phone', type: 'tel', placeholder: '(555) 555-5555' },
    { k: 'address', label: 'Business address', placeholder: '123 Main St, City, State ZIP' },
  ];

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2.5 shadow-sm">
      <p className="text-xs font-medium text-foreground">Your contact details</p>
      {fields.map((f) => (
        <div key={f.k} className="space-y-1">
          <Label htmlFor={`cf-${f.k}`} className="text-xs">
            {f.label}
          </Label>
          <Input
            id={`cf-${f.k}`}
            type={f.type || 'text'}
            value={values[f.k]}
            onChange={set(f.k)}
            placeholder={f.placeholder}
            className="h-9 text-sm"
          />
        </div>
      ))}
      <Button
        size="sm"
        className="w-full mt-1"
        disabled={!valid}
        onClick={() => {
          if (!valid) return;
          onSubmit(values);
        }}
      >
        Submit
      </Button>
    </div>
  );
}

// Inline sizing form rendered when the agent calls collect_sizing. Three
// counts; at least one must be above zero (matches the server's "at least one
// sizing dimension" rule).
function SizingForm({ onSubmit }: { onSubmit: (values: SizingFormValues) => void }) {
  const [values, setValues] = useState<{ desktopUsers: string; webUsers: string; locations: string }>({
    desktopUsers: '',
    webUsers: '',
    locations: '',
  });

  const set = (k: 'desktopUsers' | 'webUsers' | 'locations') => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [k]: e.target.value }));

  const n = (s: string) => Math.max(0, parseInt(s, 10) || 0);
  const valid = n(values.desktopUsers) > 0 || n(values.webUsers) > 0 || n(values.locations) > 0;

  const fields: Array<{ k: 'desktopUsers' | 'webUsers' | 'locations'; label: string; helper: string }> = [
    {
      k: 'desktopUsers',
      label: 'Desktop users',
      helper: 'People with Microsoft apps installed on their computer (Word, Excel, Outlook).',
    },
    {
      k: 'webUsers',
      label: 'Web users',
      helper: 'Frontline or kiosk staff who only use apps in a browser or on mobile, nothing installed.',
    },
    {
      k: 'locations',
      label: 'Locations',
      helper: 'Sites where we manage your firewall, switching, and network monitoring.',
    },
  ];

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2.5 shadow-sm">
      <p className="text-xs font-medium text-foreground">How many of each?</p>
      {fields.map((f) => (
        <div key={f.k} className="space-y-1">
          <Label htmlFor={`sf-${f.k}`} className="text-xs">
            {f.label}
          </Label>
          <Input
            id={`sf-${f.k}`}
            type="number"
            min="0"
            value={values[f.k]}
            onChange={set(f.k)}
            placeholder="0"
            className="h-9 text-sm"
          />
          <p className="text-[11px] text-muted-foreground">{f.helper}</p>
        </div>
      ))}
      <Button
        size="sm"
        className="w-full mt-1"
        disabled={!valid}
        onClick={() => {
          if (!valid) return;
          onSubmit({
            desktopUsers: n(values.desktopUsers),
            webUsers: n(values.webUsers),
            locations: n(values.locations),
          });
        }}
      >
        Submit
      </Button>
    </div>
  );
}

// Inline recipient form rendered when the agent calls collect_recipients —
// one extra person to email the quote to. On submit the context emails the
// already-created quote to this address and nudges the agent to continue.
function RecipientForm({ onSubmit }: { onSubmit: (values: RecipientFormValues) => void }) {
  const [values, setValues] = useState<RecipientFormValues>({ name: '', email: '' });
  const set = (k: keyof RecipientFormValues) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [k]: e.target.value }));
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email);

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2.5 shadow-sm">
      <p className="text-xs font-medium text-foreground">Send the quote to someone else</p>
      <div className="space-y-1">
        <Label htmlFor="rf-name" className="text-xs">Their name (optional)</Label>
        <Input id="rf-name" value={values.name} onChange={set('name')} placeholder="Jane Smith" className="h-9 text-sm" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="rf-email" className="text-xs">Their email</Label>
        <Input id="rf-email" type="email" value={values.email} onChange={set('email')} placeholder="jane@example.com" className="h-9 text-sm" />
      </div>
      <Button
        size="sm"
        className="w-full mt-1"
        disabled={!emailOk}
        onClick={() => { if (emailOk) onSubmit(values); }}
      >
        Send
      </Button>
    </div>
  );
}

export default AiChatWidget;
