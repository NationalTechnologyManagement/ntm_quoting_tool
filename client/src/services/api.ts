const API_BASE = import.meta.env.VITE_API_URL || '';

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = localStorage.getItem('adminToken');
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Don't set Content-Type for FormData (file uploads)
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    localStorage.removeItem('adminToken');
    // Don't redirect - let the caller handle it
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new ApiError(response.status, body.error || 'Request failed');
  }

  return response.json();
}

// ── Config ──────────────────────────────────────────────────────────

export const configApi = {
  get: () => apiRequest<{
    packages: any[];
    addons: any[];
    promoCodes: any[];
    terms: any;
  }>('/api/config'),
};

// ── Auth ────────────────────────────────────────────────────────────

export const authApi = {
  login: (email: string, password: string) =>
    apiRequest<{ token: string; user: { id: string; email: string } }>(
      '/api/admin/login',
      { method: 'POST', body: JSON.stringify({ email, password }) },
    ),
  me: () =>
    apiRequest<{ user: { userId: string; email: string } }>('/api/admin/me'),
};

// ── Quotes ──────────────────────────────────────────────────────────

export const quoteApi = {
  create: (payload: any) =>
    apiRequest<any>('/api/quotes', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  get: (id: string) => apiRequest<any>(`/api/quotes/${id}`),

  email: (id: string) =>
    apiRequest<{ success: boolean; quoteUrl: string }>(
      `/api/quotes/${id}/email`,
      { method: 'POST' },
    ),

  applyPromo: (id: string, code: string) =>
    apiRequest<any>(`/api/quotes/${id}/promo`, {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),

  removePromo: (id: string, code: string) =>
    apiRequest<any>(`/api/quotes/${id}/promo`, {
      method: 'DELETE',
      body: JSON.stringify({ code }),
    }),

  checkout: (id: string, payload: any) =>
    apiRequest<{ checkoutToken: string; invoiceId: string; paymentLink: string }>(
      `/api/quotes/${id}/checkout`,
      { method: 'POST', body: JSON.stringify(payload) },
    ),

  paymentLink: (id: string) =>
    apiRequest<{ checkoutToken: string; invoiceId: string; paymentLink: string }>(
      `/api/quotes/${id}/payment-link`,
    ),

  requestFollowup: (id: string) =>
    apiRequest<{ success: boolean; bookingUrl: string }>(
      `/api/quotes/${id}/request-followup`,
      { method: 'POST' },
    ),
};

// ── Leads ───────────────────────────────────────────────────────────

export const leadApi = {
  create: (payload: any) =>
    apiRequest<{ success: boolean }>('/api/leads', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Lite quoting tool: lazy capture from the customer info form. Server
  // upserts a GHL contact and applies the `quote-tool-lite-lead` tag.
  capture: (payload: { customer: any }) =>
    apiRequest<{ success: boolean }>('/api/leads/capture', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};

// ── Promo Codes ─────────────────────────────────────────────────────

export const promoApi = {
  validate: (code: string) =>
    apiRequest<any>('/api/promo-codes/validate', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),
};

// ── Admin CRUD ──────────────────────────────────────────────────────

export const adminApi = {
  // Packages
  getPackages: () => apiRequest<any[]>('/api/packages'),
  createPackage: (data: any) =>
    apiRequest<any>('/api/packages', { method: 'POST', body: JSON.stringify(data) }),
  updatePackage: (id: string, data: any) =>
    apiRequest<any>(`/api/packages/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePackage: (id: string) =>
    apiRequest<any>(`/api/packages/${id}`, { method: 'DELETE' }),

  // Addons
  getAddons: () => apiRequest<any[]>('/api/addons'),
  createAddon: (data: any) =>
    apiRequest<any>('/api/addons', { method: 'POST', body: JSON.stringify(data) }),
  updateAddon: (id: string, data: any) =>
    apiRequest<any>(`/api/addons/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAddon: (id: string) =>
    apiRequest<any>(`/api/addons/${id}`, { method: 'DELETE' }),

  // Promo Codes
  getPromoCodes: () => apiRequest<any[]>('/api/promo-codes'),
  createPromoCode: (data: any) =>
    apiRequest<any>('/api/promo-codes', { method: 'POST', body: JSON.stringify(data) }),
  updatePromoCode: (id: string, data: any) =>
    apiRequest<any>(`/api/promo-codes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePromoCode: (id: string) =>
    apiRequest<any>(`/api/promo-codes/${id}`, { method: 'DELETE' }),

  // Terms
  getTerms: () => apiRequest<any[]>('/api/admin/terms'),
  createTerms: (data: any) =>
    apiRequest<any>('/api/admin/terms', { method: 'POST', body: JSON.stringify(data) }),
  updateTerms: (id: string, data: any) =>
    apiRequest<any>(`/api/admin/terms/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  // Quotes
  getQuotes: (params?: { page?: number; pageSize?: number; status?: string; search?: string }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.pageSize) qs.set('pageSize', String(params.pageSize));
    if (params?.status) qs.set('status', params.status);
    if (params?.search) qs.set('search', params.search);
    return apiRequest<any>(`/api/admin/quotes?${qs.toString()}`);
  },
  getQuote: (id: string) => apiRequest<any>(`/api/admin/quotes/${id}`),
  getQuoteStats: () => apiRequest<any>('/api/admin/quotes/stats/summary'),
  deleteQuote: (id: string) =>
    apiRequest<{ success: true; deletedQuoteNumber: string }>(
      `/api/admin/quotes/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    ),
  addCustomItem: (
    id: string,
    item: {
      name: string;
      description?: string;
      quantity: number;
      recurringPrice?: number | null;
      recurringFrequency?: 'monthly' | 'annually' | null;
      oneTimePrice?: number | null;
    },
  ) =>
    apiRequest<{ success: true; item: any; totals: any }>(
      `/api/admin/quotes/${encodeURIComponent(id)}/custom-items`,
      { method: 'POST', body: JSON.stringify(item) },
    ),
  removeCustomItem: (id: string, itemId: string) =>
    apiRequest<{ success: true; totals: any }>(
      `/api/admin/quotes/${encodeURIComponent(id)}/custom-items/${encodeURIComponent(itemId)}`,
      { method: 'DELETE' },
    ),
  editQuote: (
    id: string,
    body: {
      userCount?: number;
      locationCount?: number;
      selectedPackage?: any;
      selectedAddons?: any[];
      agreementMonths?: number;
      amendIfPaid?: boolean;
    },
  ) =>
    apiRequest<
      | { mode: 'in_place'; quote: any }
      | {
          mode: 'amendment';
          amendment: any;
          delta: { recurring: number; oneTime: number };
          invoice: { invoiceId: string; paymentLink: string } | null;
          invoiceError: string | null;
        }
    >(`/api/admin/quotes/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  getQuoteProvisioning: (id: string) =>
    apiRequest<{
      quoteNumber: string;
      provisioningStatus: string;
      steps: Array<{
        step: string;
        status: string;
        cwId: number | null;
        attempts: number;
        lastError: string | null;
        updatedAt: string;
      }>;
    }>(`/api/admin/quotes/${id}/provisioning`),
  retryProvisioning: (id: string) =>
    apiRequest<{ success: boolean; error?: string }>(
      `/api/admin/quotes/${id}/retry-provisioning`,
      { method: 'POST' },
    ),

  // Integrations
  getIntegrations: () => apiRequest<any>('/api/admin/settings/integrations'),
  testAP: () => apiRequest<any>('/api/admin/settings/integrations/ap/test', { method: 'POST' }),
  apDiscoverWebhooks: () =>
    apiRequest<{ status: number; body: any }>(
      '/api/admin/integrations/ap/webhooks/discover',
      { method: 'POST' },
    ),
  apRegisterWebhook: (opts?: { url?: string; events?: string[] }) =>
    apiRequest<{
      endpoint_url: string;
      secretGenerated: boolean;
      secret: string | null;
      results: Array<{ topic: string; status: number; body: any }>;
    }>('/api/admin/integrations/ap/webhooks/register', {
      method: 'POST',
      body: JSON.stringify(opts ?? {}),
    }),
  testGHL: () => apiRequest<any>('/api/admin/settings/integrations/ghl/test', { method: 'POST' }),
  testCW: () => apiRequest<any>('/api/admin/settings/integrations/cw/test', { method: 'POST' }),
  testEmail: () => apiRequest<any>('/api/admin/settings/integrations/email/test', { method: 'POST' }),

  // Contracts — list + delete
  listContracts: (quoteId: string) =>
    apiRequest<{
      contracts: Array<{ id: string; pdfUrl: string | null; emailedAt: string | null; createdAt: string }>;
    }>(`/api/admin/quotes/${encodeURIComponent(quoteId)}/contracts`),
  deleteContract: (contractId: string) =>
    apiRequest<{ success: true }>(`/api/admin/contracts/${encodeURIComponent(contractId)}`, {
      method: 'DELETE',
    }),

  // Contract preview (HTML)
  getContractPreviewHtml: async (quoteId: string): Promise<string> => {
    const token = localStorage.getItem('adminToken');
    const res = await fetch(`/api/admin/contracts/${encodeURIComponent(quoteId)}/preview`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(`Preview failed: ${res.status}`);
    return res.text();
  },

  // Account
  changePassword: (currentPassword: string, newPassword: string) =>
    apiRequest<{ success: true }>('/api/admin/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  // Site content (customer-facing wording on the quote builder page).
  getSiteContent: () =>
    apiRequest<{
      quoteBuilderHeading: string;
      quoteBuilderSubheading: string;
      quoteBuilderExplainerTitle: string;
      quoteBuilderExplainerBody: string;
    }>('/api/admin/site-content'),
  updateSiteContent: (patch: {
    quoteBuilderHeading?: string;
    quoteBuilderSubheading?: string;
    quoteBuilderExplainerTitle?: string;
    quoteBuilderExplainerBody?: string;
  }) =>
    apiRequest<any>('/api/admin/site-content', {
      method: 'PUT',
      body: JSON.stringify(patch),
    }),

  // Integration credentials (editable)
  getCredentials: (reveal = false) =>
    apiRequest<{
      keys: string[];
      rows: Array<{
        key: string;
        value: string;
        source: 'db' | 'env' | 'unset';
        masked: boolean;
        notes: string | null;
      }>;
    }>(`/api/admin/settings/credentials${reveal ? '?reveal=1' : ''}`),
  setCredential: (key: string, value: string, notes?: string | null) =>
    apiRequest<{ success: true }>('/api/admin/settings/credentials', {
      method: 'PUT',
      body: JSON.stringify({ key, value, notes: notes ?? null }),
    }),

  // CW reference config
  getCwConfig: () =>
    apiRequest<{
      keys: string[];
      requiredForProvisioning: string[];
      rows: Array<{ key: string; value: string; notes: string | null }>;
    }>('/api/admin/settings/cw-config'),
  setCwConfig: (key: string, value: string, notes?: string | null) =>
    apiRequest<{ success: true }>('/api/admin/settings/cw-config', {
      method: 'PUT',
      body: JSON.stringify({ key, value, notes: notes ?? null }),
    }),

  // ── AI Chat ─────────────────────────────────────────────────────────
  getAiConfig: () =>
    apiRequest<{
      config: any;
      defaults: { systemPrompt: string };
      availableTools: string[];
      apiKeyConfigured: boolean;
    }>('/api/admin/ai-chat/config'),
  updateAiConfig: (patch: any) =>
    apiRequest<{ config: any }>('/api/admin/ai-chat/config', {
      method: 'PUT',
      body: JSON.stringify(patch),
    }),
  listAiKb: () =>
    apiRequest<{
      docs: Array<{
        id: string;
        title: string;
        content: string;
        active: boolean;
        sortOrder: number;
        updatedAt: string;
      }>;
    }>('/api/admin/ai-chat/kb'),
  createAiKb: (data: { title: string; content: string; active?: boolean; sortOrder?: number }) =>
    apiRequest<{ doc: any }>('/api/admin/ai-chat/kb', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateAiKb: (id: string, data: any) =>
    apiRequest<{ doc: any }>(`/api/admin/ai-chat/kb/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteAiKb: (id: string) =>
    apiRequest<{ success: true }>(`/api/admin/ai-chat/kb/${id}`, { method: 'DELETE' }),
  getAiUsage: () =>
    apiRequest<{
      today: { usdCost: number; tokensIn: number; tokensOut: number; messages: number };
      last30: { usdCost: number; tokensIn: number; tokensOut: number; messages: number };
      totalSessions: number;
      recentSessions: Array<{
        id: string;
        status: string;
        usdSpent: number;
        tokensIn: number;
        tokensOut: number;
        usingFallback: boolean;
        ipAddress: string | null;
        quoteId: string | null;
        createdAt: string;
        endedAt: string | null;
        lastActivityAt: string;
        _count: { messages: number };
      }>;
    }>('/api/admin/ai-chat/usage'),
};

// ── Quote Lookup (public) ──────────────────────────────────────────

export const quoteLookupApi = {
  byEmail: (email: string) =>
    apiRequest<{ quotes: any[] }>(`/api/quotes/lookup/by-email?email=${encodeURIComponent(email)}`),
};
