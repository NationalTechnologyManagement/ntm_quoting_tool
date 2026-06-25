// AI chat session + tool registry. Mounts inside QuoteProvider so the chat
// can see (and prefill into) live quote state. The agent NEVER calls quote
// APIs directly — it only emits UI tool calls that we apply locally; quote
// creation/payment still goes through the existing user-driven flow.
//
// Tool execution rules (enforced on the client too, even though the server
// enforces an allowlist):
//   - Final-action tools (terms checkbox, e-sign, pay) are NOT registered
//     and never can be. Those remain user clicks.
//   - prefill_field only writes into known field handlers; unknown fields
//     are silently dropped — the agent cannot reach into arbitrary state.
//   - navigate confirms with the user before changing route.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { aiChatApi, streamMessage, type SessionInfo } from '@/services/ai-chat.client';
import { leadApi } from '@/services/api';
import { useQuote, type CustomerInfo } from './QuoteContext';

// Fields collected by the in-chat contact form (collect_contact tool).
export interface ContactFormValues {
  name: string;
  businessName: string;
  email: string;
  phone: string;
  address: string;
}

// ── Types ─────────────────────────────────────────────────────────────

export type ChatRole = 'user' | 'assistant' | 'system' | 'tool';
export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  fallback?: boolean;
  // Resolved tool calls (after the agent decided + we applied them).
  toolCalls?: Array<{ id: string; name: string; arguments: string; applied: boolean; note?: string }>;
}

export type FieldHandler = (value: string) => void;
export interface FieldRegistration {
  fieldId: string;
  label: string;
  handler: FieldHandler;
}

interface AiChatContextValue {
  // session
  enabled: boolean;
  session: SessionInfo | null;
  status: 'idle' | 'starting' | 'ready' | 'streaming' | 'error' | 'capped' | 'expired' | 'disabled';
  open: boolean;
  setOpen: (v: boolean) => void;
  // messages
  messages: ChatMessage[];
  send: (text: string) => Promise<void>;
  reset: () => Promise<void>;
  // Eagerly create a session + seed the greeting message. Called by the
  // widget when the panel opens so the customer sees the agent's first
  // line without having to type anything first.
  primeGreeting: () => Promise<void>;
  // banner
  fallbackActive: boolean;
  // field registry — pages call registerField on mount, unregister on unmount
  registerField: (reg: FieldRegistration) => () => void;
  highlightedFieldId: string | null;
  // in-chat contact form (driven by the collect_contact tool)
  showContactForm: boolean;
  submitContactForm: (values: ContactFormValues) => void;
}

const AiChatContext = createContext<AiChatContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────

const DISMISSED_KEY = 'ntm_ai_chat_dismissed';

export const AiChatProvider = ({ children }: { children: ReactNode }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const quote = useQuote();

  const [enabled, setEnabled] = useState(false);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [status, setStatus] = useState<AiChatContextValue['status']>('idle');
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [fallbackActive, setFallbackActive] = useState(false);
  const [highlightedFieldId, setHighlightedFieldId] = useState<string | null>(null);
  const [showContactForm, setShowContactForm] = useState(false);

  const fieldRegistry = useRef<Map<string, FieldRegistration>>(new Map());
  const abortRef = useRef<AbortController | null>(null);

  // Live mirrors of quote state. Tool calls within a single agentic turn run
  // synchronously off one captured closure, so reading quote.* directly would
  // see render-time (stale) values and chained tools (set_sizing →
  // go_to_checkout, or the contact-form submit → continuation send) would
  // miss each other's writes. The writing tools update these refs
  // synchronously; an effect keeps them in sync with external (page) edits.
  const customerInfoRef = useRef(quote.customerInfo);
  const selectedPackageRef = useRef(quote.selectedPackage);
  const contactCapturedRef = useRef(false);
  useEffect(() => {
    customerInfoRef.current = quote.customerInfo;
  }, [quote.customerInfo]);
  useEffect(() => {
    selectedPackageRef.current = quote.selectedPackage;
  }, [quote.selectedPackage]);

  // ── Field registry ──────────────────────────────────────────────────
  const registerField = useCallback((reg: FieldRegistration) => {
    fieldRegistry.current.set(reg.fieldId, reg);
    return () => {
      // Only remove if this exact registration still owns the slot.
      if (fieldRegistry.current.get(reg.fieldId) === reg) {
        fieldRegistry.current.delete(reg.fieldId);
      }
    };
  }, []);

  // ── Bootstrap: try to find an existing session, else stay closed ────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const existing = await aiChatApi.getSession();
        if (cancelled) return;
        setSession(existing);
        setEnabled(true);
        setStatus('ready');
        setFallbackActive(!!existing.usingFallback);
        // Try to load prior messages so the panel rehydrates after a reload.
        try {
          const { messages: hist } = await aiChatApi.loadHistory();
          if (!cancelled) {
            setMessages(
              hist
                .filter((m) => m.role === 'user' || m.role === 'assistant')
                .map((m) => ({
                  id: m.id,
                  role: m.role as ChatRole,
                  content: m.content,
                  fallback: m.fallback,
                })),
            );
          }
        } catch { /* no history yet */ }
      } catch (err: any) {
        if (cancelled) return;
        // 503 = disabled by admin; 401/410/440 = no session yet (normal). The
        // widget probes once on mount and sits quietly otherwise.
        if (err?.status === 503) {
          setEnabled(false);
          setStatus('disabled');
        } else {
          setEnabled(true);
          setStatus('idle');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Session start ───────────────────────────────────────────────────
  const ensureSession = useCallback(async (): Promise<SessionInfo | null> => {
    if (session) return session;
    setStatus('starting');
    try {
      const s = await aiChatApi.startSession();
      setSession(s);
      setStatus('ready');
      // Seed greeting
      setMessages([{ id: 'greeting', role: 'assistant', content: s.greeting }]);
      return s;
    } catch (err: any) {
      if (err?.status === 503) {
        setEnabled(false);
        setStatus('disabled');
      } else {
        setStatus('error');
      }
      return null;
    }
  }, [session]);

  // ── Auto-open the launcher (not the panel) once enabled ─────────────
  // We never auto-pop the chat panel — the customer opens it themselves.

  // ── Page snapshot collector ─────────────────────────────────────────
  // Builds the JSON payload sent with every turn. It mixes (a) what's
  // visible in QuoteContext and (b) the current route. The agent uses this
  // as its source-of-truth for prices/packages/addons; it must not invent
  // anything outside this snapshot.
  const buildPageSnapshot = useCallback(() => {
    const route = location.pathname;
    const stepName =
      route === '/' || route === '/quote-builder'
        ? 'choose_package'
        : route === '/quote-info'
          ? 'size_quote_and_addons'
          : route === '/quote-contact'
            ? 'customer_contact_info'
            : route === '/summary'
              ? 'summary_and_promo'
              : route === '/terms'
                ? 'review_terms'
                : route === '/quote-review'
                  ? 'review_and_pay'
                  : 'unknown';

    return {
      route,
      step: stepName,
      registeredFields: Array.from(fieldRegistry.current.values()).map((r) => ({
        id: r.fieldId,
        label: r.label,
      })),
      packages: quote.packages.map((p) => ({
        id: p.id,
        name: p.name,
        pricePerUser: p.pricePerUser,
        pricePerUserF3: p.pricePerUserF3,
        pricePerLocation: p.pricePerLocation,
        frequency: p.frequency,
        agreementMonths: p.agreementMonths,
        features: p.features,
        isBestValue: p.isBestValue,
      })),
      addons: quote.addons
        .filter((a) => a.active)
        .map((a) => ({
          id: a.id,
          name: a.name,
          description: a.description,
          recurringPrice: a.recurringPrice,
          recurringFrequency: a.recurringFrequency,
          setupPrice: a.setupPrice,
          pricingType: a.pricingType,
        })),
      selection: {
        // Read from the live mirrors so a package/sizing just set by a tool
        // earlier in this same turn (or the contact-form submit) is reflected
        // here, not the stale render-time value.
        selectedPackageId: selectedPackageRef.current?.id ?? null,
        selectedPackageName: selectedPackageRef.current?.name ?? null,
        selectedAddonIds: quote.selectedAddons.map((a) => a.id),
      },
      customer: customerInfoRef.current,
      appliedPromoCodes: quote.appliedPromoCodes.map((p) => p.code),
    };
  }, [location.pathname, quote]);

  // ── Tool dispatch ───────────────────────────────────────────────────
  // Applied client-side after the model emits a tool call. We log every
  // attempt as a chat-message annotation so the user sees what the agent did.

  const applyTool = useCallback(
    (call: { id: string; name: string; arguments: string }): { applied: boolean; note?: string } => {
      let parsed: any;
      try { parsed = JSON.parse(call.arguments || '{}'); } catch { return { applied: false, note: 'invalid args' }; }

      switch (call.name) {
        case 'highlight_field': {
          const fid = String(parsed.fieldId || '');
          if (!fieldRegistry.current.has(fid)) return { applied: false, note: `no field "${fid}" on this page` };
          setHighlightedFieldId(fid);
          // Try to scroll the actual DOM element into view too
          const el = document.getElementById(fid);
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Auto-clear highlight after a few seconds so it doesn't stick
          window.setTimeout(() => setHighlightedFieldId((cur) => (cur === fid ? null : cur)), 4000);
          return { applied: true, note: `highlighted ${fid}` };
        }
        case 'prefill_field': {
          const fid = String(parsed.fieldId || '');
          const val = String(parsed.value ?? '');
          const reg = fieldRegistry.current.get(fid);
          if (!reg) return { applied: false, note: `no field "${fid}" on this page` };
          reg.handler(val);
          setHighlightedFieldId(fid);
          window.setTimeout(() => setHighlightedFieldId((cur) => (cur === fid ? null : cur)), 4000);
          return { applied: true, note: `prefilled ${reg.label}` };
        }
        case 'navigate': {
          const dir = parsed.direction === 'back' ? 'back' : 'next';
          const route = location.pathname;
          const order = ['/', '/quote-builder', '/quote-info', '/quote-contact', '/summary', '/terms', '/quote-review'];
          const i = order.indexOf(route);
          if (i < 0) return { applied: false, note: 'unknown current step' };
          const target = dir === 'next' ? order[i + 1] : order[i - 1];
          if (!target) return { applied: false, note: 'no further step' };
          // No confirm prompt — the agent is required (per system prompt) to
          // narrate intent in text BEFORE calling navigate. Trust that.
          navigate(target);
          return { applied: true, note: `navigated ${dir}` };
        }
        case 'suggest_package': {
          // Commits the selection AND advances to the sizing page if the
          // customer is still on the picker. The agent uses this AFTER the
          // user has chosen a package in chat — it's the click the agent
          // does for them, not a soft "preview" of a recommendation.
          const pkgId = String(parsed.packageId || '');
          const pkg = quote.packages.find((p) => p.id === pkgId);
          if (!pkg) return { applied: false, note: `unknown package "${pkgId}"` };
          selectedPackageRef.current = pkg; // sync so a same-turn go_to_checkout sees it
          quote.setSelectedPackage(pkg);
          const here = location.pathname;
          if (here === '/' || here === '/quote-builder') {
            navigate('/quote-info');
          }
          return { applied: true, note: `selected ${pkg.name}` };
        }
        case 'suggest_addon': {
          // Mirrors suggest_package — adds the addon to the customer's
          // selection (quantity 1) instead of just narrating it. Agent
          // increments quantity by calling again or by tool-prefilling
          // the addon's quantity input on QuoteInfo.
          const addonId = String(parsed.addonId || '');
          const addon = quote.addons.find((a) => a.id === addonId);
          if (!addon) return { applied: false, note: `unknown addon "${addonId}"` };
          const already = quote.selectedAddons.find((a) => a.id === addonId);
          if (already) {
            return { applied: true, note: `${addon.name} already selected` };
          }
          quote.setSelectedAddons([
            ...quote.selectedAddons,
            { ...addon, quantity: 1 },
          ]);
          return { applied: true, note: `added ${addon.name}` };
        }
        case 'collect_contact': {
          // Render the inline contact form in the transcript. The customer
          // fills it out and submits on their own time (submitContactForm).
          // Guard against a second call re-showing a blank form (and inviting
          // a duplicate GHL capture) once contact is already captured.
          if (contactCapturedRef.current) {
            return { applied: false, note: 'contact already captured — do not ask again, continue the flow' };
          }
          setShowContactForm(true);
          return { applied: true, note: 'showed contact form' };
        }
        case 'set_sizing': {
          // Write the sizing straight into shared quote state so it survives
          // regardless of which page is mounted — the chat flow never visits
          // the sizing page. Only the provided counts are touched. Merge off
          // the live ref so repeated set_sizing calls in one turn accumulate.
          const patch: Partial<CustomerInfo> = {};
          const num = (v: unknown) => {
            const n = Number(v);
            return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined;
          };
          const d = num(parsed.desktopUsers);
          const w = num(parsed.webUsers);
          const l = num(parsed.locations);
          if (d !== undefined) patch.userCount = d;
          if (w !== undefined) patch.webUserCount = w;
          if (l !== undefined) patch.locationCount = l;
          if (Object.keys(patch).length === 0) {
            return { applied: false, note: 'no sizing values provided' };
          }
          const merged = { ...customerInfoRef.current, ...patch };
          customerInfoRef.current = merged; // sync so a same-turn go_to_checkout / 2nd set_sizing sees it
          quote.setCustomerInfo(merged);
          const bits = [
            patch.userCount !== undefined ? `${patch.userCount} desktop` : null,
            patch.webUserCount !== undefined ? `${patch.webUserCount} web` : null,
            patch.locationCount !== undefined ? `${patch.locationCount} location(s)` : null,
          ].filter(Boolean);
          return { applied: true, note: `set ${bits.join(', ')}` };
        }
        case 'go_to_checkout': {
          // Final hop to the sign-and-pay page. Read the live mirrors (not the
          // stale render-time quote) so a package/sizing set earlier in this
          // same turn counts. Guard so we never land on a summary that would
          // just bounce back for a missing package/sizing.
          if (!selectedPackageRef.current) {
            return { applied: false, note: 'no package selected yet — recommend one and call suggest_package first' };
          }
          const c = customerInfoRef.current;
          const hasSizing = (c.userCount ?? 0) > 0 || (c.webUserCount ?? 0) > 0 || (c.locationCount ?? 0) > 0;
          if (!hasSizing) {
            return { applied: false, note: 'no sizing set yet — ask for users/locations first' };
          }
          navigate('/summary');
          return { applied: true, note: 'sent to sign-and-pay' };
        }
        case 'request_followup': {
          // The agent has offered to set the customer up with a sales rep.
          // We open the GHL booking widget in a new tab so the customer can
          // pick a slot without losing their place in the wizard. The agent's
          // text reply explains what's happening.
          const reason = String(parsed.reason || 'Quote follow-up');
          const url =
            (import.meta.env.VITE_GHL_BOOKING_URL as string | undefined) ||
            'https://api.leadconnectorhq.com/widget/booking/snhTg4zQQSVrJ9R3jisc';
          try {
            window.open(url, '_blank', 'noopener,noreferrer');
          } catch {
            return { applied: false, note: 'could not open booking page' };
          }
          return { applied: true, note: `opened booking — ${reason}` };
        }
        default:
          return { applied: false, note: 'unknown tool' };
      }
    },
    [location.pathname, navigate, quote],
  );

  // ── Send a message (streams) ────────────────────────────────────────
  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const s = await ensureSession();
      if (!s) return;

      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        role: 'user',
        content: trimmed,
      };
      const assistantId = `a-${Date.now() + 1}`;
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        toolCalls: [],
      };
      setMessages((m) => [...m, userMsg, assistantMsg]);
      setStatus('streaming');

      const ctrl = new AbortController();
      abortRef.current?.abort();
      abortRef.current = ctrl;

      const snapshot = buildPageSnapshot();

      const updateAssistant = (patch: (m: ChatMessage) => ChatMessage) => {
        setMessages((arr) => arr.map((m) => (m.id === assistantId ? patch(m) : m)));
      };

      try {
        await streamMessage(
          { message: trimmed, pageSnapshot: snapshot },
          {
            onToken: (delta) => {
              updateAssistant((m) => ({ ...m, content: m.content + delta }));
            },
            onTool: (call) => {
              const result = applyTool(call);
              updateAssistant((m) => ({
                ...m,
                toolCalls: [...(m.toolCalls || []), { ...call, ...result }],
              }));
            },
            onDone: (info) => {
              setFallbackActive(info.fallback);
              updateAssistant((m) => ({ ...m, fallback: info.fallback }));
              setStatus('ready');
            },
            onError: (msg) => {
              updateAssistant((m) => ({
                ...m,
                content: m.content || `(${msg})`,
              }));
              setStatus('ready');
              if (/cap reached/i.test(msg)) setStatus('capped');
              if (/idle|absolute/i.test(msg)) setStatus('expired');
            },
          },
          ctrl.signal,
        );
      } catch (err: any) {
        updateAssistant((m) => ({ ...m, content: m.content || `(${err.message})` }));
        setStatus('ready');
      }
    },
    [applyTool, buildPageSnapshot, ensureSession],
  );

  // ── In-chat contact form submit ─────────────────────────────────────
  // Persist the contact details into shared quote state, push the lead to
  // GHL immediately (fire-and-forget — we don't block on it), then nudge the
  // agent to continue. The agent reads the saved details from the next
  // turn's page snapshot, so the continuation message stays generic.
  const submitContactForm = useCallback(
    (values: ContactFormValues) => {
      const merged = { ...customerInfoRef.current, ...values };
      customerInfoRef.current = merged; // sync so the continuation send()'s snapshot carries it
      contactCapturedRef.current = true;
      quote.setCustomerInfo(merged);
      setShowContactForm(false);

      leadApi
        .capture({
          customer: {
            name: merged.name || merged.email,
            email: merged.email,
            phone: merged.phone || '',
            businessName: merged.businessName || '',
            address: merged.address || '',
            userCount: merged.userCount || 0,
            webUserCount: merged.webUserCount ?? 0,
            locationCount: merged.locationCount || 0,
            referrerCode: merged.referrerCode || null,
          },
        })
        .catch((err) => console.error('Chat contact capture failed:', err));

      void send("I've filled out my contact details.");
    },
    [quote, send],
  );

  const reset = useCallback(async () => {
    abortRef.current?.abort();
    try { await aiChatApi.endSession(); } catch { /* ignore */ }
    setSession(null);
    setMessages([]);
    setFallbackActive(false);
    setShowContactForm(false);
    contactCapturedRef.current = false;
    setStatus('idle');
  }, []);

  // Used by the widget on first open so the greeting message renders
  // immediately. Idempotent — re-calling once a session exists is a no-op.
  const primeGreeting = useCallback(async () => {
    if (session) return;
    await ensureSession();
  }, [session, ensureSession]);

  const value = useMemo<AiChatContextValue>(
    () => ({
      enabled,
      session,
      status,
      open,
      setOpen: (v) => {
        setOpen(v);
        if (v && !session) ensureSession();
      },
      messages,
      send,
      reset,
      primeGreeting,
      fallbackActive,
      registerField,
      highlightedFieldId,
      showContactForm,
      submitContactForm,
    }),
    [enabled, session, status, open, messages, send, reset, primeGreeting, fallbackActive, registerField, highlightedFieldId, showContactForm, submitContactForm],
  );

  return <AiChatContext.Provider value={value}>{children}</AiChatContext.Provider>;
};

export const useAiChat = () => {
  const ctx = useContext(AiChatContext);
  if (!ctx) throw new Error('useAiChat must be used within AiChatProvider');
  return ctx;
};

// Helper hook for pages: registers a field on mount, unregisters on unmount,
// and returns whether the agent is currently highlighting it.
export function useChatField(fieldId: string, label: string, handler: FieldHandler) {
  const { registerField, highlightedFieldId } = useAiChat();
  useEffect(() => {
    return registerField({ fieldId, label, handler });
    // handler is intentionally NOT a dep; pages should pass a stable callback
    // (or wrap with useCallback) to avoid churning the registry every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldId, label, registerField]);
  return highlightedFieldId === fieldId;
}
