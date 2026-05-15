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
    // Send the admin_session + ghl_sso_device cookies on every request. Lets
    // the GHL-embedded admin portal authenticate from cookies alone — the
    // iframe origin has no access to the localStorage that the password
    // login uses.
    credentials: 'include',
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

export type LoginResponse =
  | {
      status: 'ok';
      token: string;
      user: { id: string; email: string; role: string; name: string | null };
    }
  | { status: 'needs_setup'; setupToken: string; email: string }
  | {
      status: 'needs_2fa';
      challengeToken: string;
      method: 'totp' | 'email';
      email: string;
    };

export const authApi = {
  login: (email: string, password: string) =>
    apiRequest<LoginResponse>('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  verify2fa: (challengeToken: string, code: string) =>
    apiRequest<{
      token: string;
      user: { id: string; email: string; role: string; name: string | null };
    }>('/api/admin/login/verify', {
      method: 'POST',
      body: JSON.stringify({ challengeToken, code }),
    }),
  resendEmailCode: (challengeToken: string) =>
    apiRequest<{ success: boolean }>('/api/admin/login/resend-code', {
      method: 'POST',
      body: JSON.stringify({ challengeToken }),
    }),
  setup2faStart: (setupToken: string, method: 'totp' | 'email') =>
    apiRequest<
      | { method: 'totp'; secret: string; otpauthUri: string; qrDataUrl: string }
      | { method: 'email'; email: string }
    >('/api/admin/2fa/setup/start', {
      method: 'POST',
      body: JSON.stringify({ setupToken, method }),
    }),
  setup2faConfirm: (setupToken: string, method: 'totp' | 'email', code: string) =>
    apiRequest<{
      token: string;
      user: { id: string; email: string; role: string; name: string | null };
      recoveryCodes: string[];
    }>('/api/admin/2fa/setup/confirm', {
      method: 'POST',
      body: JSON.stringify({ setupToken, method, code }),
    }),
  me: () =>
    apiRequest<{
      user: { userId: string; email: string; role: string };
    }>('/api/admin/me'),
  getInvite: (token: string) =>
    apiRequest<{ email: string; role: string; expiresAt: string }>(
      `/api/admin/invites/${encodeURIComponent(token)}`,
    ),
  acceptInvite: (token: string, name: string, password: string) =>
    apiRequest<{
      userId: string;
      email: string;
      role: string;
      setupToken: string;
    }>(`/api/admin/invites/${encodeURIComponent(token)}/accept`, {
      method: 'POST',
      body: JSON.stringify({ name, password }),
    }),
};

// ── GHL embed SSO ──────────────────────────────────────────────────

type SsoUser = { id: string; email: string; role: string; name: string | null };

export const ssoApi = {
  check: (loc: string, k: string) =>
    apiRequest<
      | { ready: false }
      | { ready: true; token: string; user: SsoUser }
    >('/api/sso/ghl/check', {
      method: 'POST',
      body: JSON.stringify({ loc, k }),
    }),
  start: (loc: string, k: string, email: string) =>
    apiRequest<{ success: boolean }>('/api/sso/ghl/start', {
      method: 'POST',
      body: JSON.stringify({ loc, k, email }),
    }),
  verify: (loc: string, k: string, email: string, code: string) =>
    apiRequest<{ success: boolean; token: string; user: SsoUser }>(
      '/api/sso/ghl/verify',
      {
        method: 'POST',
        body: JSON.stringify({ loc, k, email, code }),
      },
    ),
  logout: () =>
    apiRequest<{ success: boolean }>('/api/sso/ghl/logout', { method: 'POST' }),
};

// ── Users / invites (admin) ─────────────────────────────────────────

export const usersApi = {
  list: () =>
    apiRequest<{
      users: Array<{
        id: string;
        email: string;
        name: string | null;
        role: string;
        active: boolean;
        twoFactorMethod: string | null;
        lastLoginAt: string | null;
        createdAt: string;
      }>;
    }>('/api/admin/users'),
  invite: (email: string, role: 'admin' | 'sales_rep') =>
    apiRequest<{ inviteId: string; expiresAt: string }>('/api/admin/users/invite', {
      method: 'POST',
      body: JSON.stringify({ email, role }),
    }),
  listInvites: () =>
    apiRequest<{
      invites: Array<{
        id: string;
        email: string;
        role: string;
        expiresAt: string;
        acceptedAt: string | null;
        createdAt: string;
        invitedBy: { id: string; email: string; name: string | null } | null;
      }>;
    }>('/api/admin/invites'),
  revokeInvite: (id: string) =>
    apiRequest<{ success: boolean }>(`/api/admin/invites/${id}`, { method: 'DELETE' }),
  setActive: (id: string, active: boolean) =>
    apiRequest<{ success: boolean }>(`/api/admin/users/${id}/active`, {
      method: 'PATCH',
      body: JSON.stringify({ active }),
    }),
  setRole: (id: string, role: 'admin' | 'sales_rep') =>
    apiRequest<{ success: boolean }>(`/api/admin/users/${id}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }),
  reset2fa: (id: string) =>
    apiRequest<{ success: boolean }>(`/api/admin/users/${id}/reset-2fa`, { method: 'POST' }),
  remove: (id: string) =>
    apiRequest<{ success: boolean }>(`/api/admin/users/${id}`, { method: 'DELETE' }),
  listSalesReps: () =>
    apiRequest<{
      reps: Array<{ id: string; email: string; name: string | null; role: string }>;
    }>('/api/admin/sales-reps'),
  assignSalesRep: (quoteId: string, salesRepId: string | null) =>
    apiRequest<any>(`/api/admin/quotes/${quoteId}/sales-rep`, {
      method: 'PATCH',
      body: JSON.stringify({ salesRepId }),
    }),
};

// ── Quotes ──────────────────────────────────────────────────────────

export const quoteApi = {
  create: (payload: any) =>
    apiRequest<any>('/api/quotes', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  get: (id: string) => apiRequest<any>(`/api/quotes/${id}`),

  email: (
    id: string,
    options?: { additionalTo?: string[]; cc?: string[] },
  ) =>
    apiRequest<{
      success: boolean;
      quoteUrl: string;
      to?: string[];
      cc?: string[];
    }>(`/api/quotes/${id}/email`, {
      method: 'POST',
      body: JSON.stringify(options ?? {}),
    }),

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
  listAdminOnlyPromos: () =>
    apiRequest<{
      promos: Array<{
        id: string;
        code: string;
        discount: number;
        discountType: 'percentage' | 'fixed';
        applyTo: 'one-time' | 'monthly' | 'onboarding';
        cwProductId: number | null;
      }>;
    }>('/api/admin/admin-only-promos'),
  applyAdminPromo: (id: string, code: string) =>
    apiRequest<{ success: true; quote: any }>(
      `/api/admin/quotes/${encodeURIComponent(id)}/admin-promo`,
      { method: 'POST', body: JSON.stringify({ code }) },
    ),
  removeAdminPromo: (id: string, code: string) =>
    apiRequest<{ success: true; quote: any }>(
      `/api/admin/quotes/${encodeURIComponent(id)}/admin-promo`,
      { method: 'DELETE', body: JSON.stringify({ code }) },
    ),
  refreshQuotePackage: (id: string) =>
    apiRequest<{
      success: true;
      quote: any;
      refreshedFrom: {
        pricePerUser: number;
        pricePerUserF3: number;
        pricePerLocation: number;
        featureGroups: Array<{ category: string; items: string[] }>;
      };
    }>(`/api/admin/quotes/${encodeURIComponent(id)}/refresh-package`, {
      method: 'POST',
    }),
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
  getProvisioningErrors: (limit = 200) =>
    apiRequest<{
      errors: Array<{
        id: string;
        quoteNumber: string;
        businessName: string | null;
        customerEmail: string | null;
        step: string;
        error: string | null;
        provisioningStatus: string | null;
        cwIds: {
          company: number | null;
          contact: number | null;
          agreement: number | null;
          project: number | null;
          opportunity: number | null;
        };
        createdAt: string;
      }>;
    }>(`/api/admin/provisioning-errors?limit=${limit}`),
  clearProvisioningErrors: () =>
    apiRequest<{ success: true; deleted: number }>(
      '/api/admin/provisioning-errors',
      { method: 'DELETE' },
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
  findCwProjectTemplate: (name?: string) =>
    apiRequest<{
      matches: Array<{ id: number; name: string }>;
      chosen: { id: number; name: string } | null;
    }>('/api/admin/cw/find-project-template', {
      method: 'POST',
      body: JSON.stringify({ name }),
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
  getAiChatSession: (id: string) =>
    apiRequest<{
      session: {
        id: string;
        status: string;
        usdSpent: number;
        tokensIn: number;
        tokensOut: number;
        usingFallback: boolean;
        ipAddress: string | null;
        userAgent: string | null;
        quoteId: string | null;
        createdAt: string;
        endedAt: string | null;
        lastActivityAt: string;
        messages: Array<{
          id: string;
          role: 'user' | 'assistant' | 'system' | 'tool';
          content: string;
          model: string | null;
          tokensIn: number | null;
          tokensOut: number | null;
          usdCost: number;
          fallback: boolean;
          toolCalls: any | null;
          createdAt: string;
        }>;
      };
    }>(`/api/admin/ai-chat/sessions/${encodeURIComponent(id)}`),
  uploadAiKb: (file: File, title?: string) => {
    // Multipart upload — apiRequest already skips the JSON Content-Type when
    // the body is FormData and lets the browser set the boundary itself.
    const fd = new FormData();
    fd.append('file', file);
    if (title) fd.append('title', title);
    return apiRequest<{ doc: any; meta: { sourceFilename: string; sourceMime: string; sourceBytes: number; extractedChars: number } }>(
      '/api/admin/ai-chat/kb/upload',
      { method: 'POST', body: fd },
    );
  },
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
