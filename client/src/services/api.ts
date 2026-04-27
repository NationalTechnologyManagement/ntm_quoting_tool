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
};

// ── Leads ───────────────────────────────────────────────────────────

export const leadApi = {
  create: (payload: any) =>
    apiRequest<{ success: boolean }>('/api/leads', {
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
  testGHL: () => apiRequest<any>('/api/admin/settings/integrations/ghl/test', { method: 'POST' }),
  testCW: () => apiRequest<any>('/api/admin/settings/integrations/cw/test', { method: 'POST' }),
  testEmail: () => apiRequest<any>('/api/admin/settings/integrations/email/test', { method: 'POST' }),

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
};

// ── Quote Lookup (public) ──────────────────────────────────────────

export const quoteLookupApi = {
  byEmail: (email: string) =>
    apiRequest<{ quotes: any[] }>(`/api/quotes/lookup/by-email?email=${encodeURIComponent(email)}`),
};
