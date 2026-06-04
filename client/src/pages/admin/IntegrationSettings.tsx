import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Loader2,
  CheckCircle,
  XCircle,
  RefreshCw,
  CreditCard,
  Building2,
  Users,
  Mail,
  Eye,
  EyeOff,
  Save,
} from 'lucide-react';
import { toast } from 'sonner';
import { adminApi } from '@/services/api';
import AdminNav from '@/components/admin/AdminNav';

interface IntegrationStatus {
  ap: { configured: boolean; hasWebhookSecret: boolean };
  cw: { configured: boolean; companyId: string | null; baseUrl: string };
  ghl: { configured: boolean; locationId: string | null };
  email: { configured: boolean; fromEmail: string };
}

interface TestResult {
  loading: boolean;
  result: { success: boolean; message?: string; error?: string; domains?: string[] } | null;
}

const INTEGRATION_INFO = {
  ap: {
    name: 'Alternative Payments',
    icon: CreditCard,
    description: 'Handles one-time setup payments. Creates customer accounts and invoices for onboarding and setup fees. Customers pay via hosted checkout page.',
    color: 'bg-violet-50 border-violet-200 dark:bg-violet-950/20 dark:border-violet-800',
    iconColor: 'text-violet-600 dark:text-violet-400',
  },
  cw: {
    name: 'ConnectWise Manage',
    icon: Building2,
    description: 'Creates company, contact, and sales opportunity when a quote is generated. On payment: marks opportunity as won, upgrades company to Customer, creates onboarding project and service agreement mapped to the selected package.',
    color: 'bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800',
    iconColor: 'text-blue-600 dark:text-blue-400',
  },
  ghl: {
    name: 'GoHighLevel',
    icon: Users,
    description: 'Creates or updates CRM contact (looked up by email first) and opportunity when a quote is generated. Tracks quote lifecycle with contact notes (created, emailed, paid). Marks opportunity as won on payment.',
    color: 'bg-orange-50 border-orange-200 dark:bg-orange-950/20 dark:border-orange-800',
    iconColor: 'text-orange-600 dark:text-orange-400',
  },
  email: {
    name: 'Resend Email',
    icon: Mail,
    description: 'Sends quote emails, contract PDFs, and payment confirmations to customers. Requires a verified sending domain in the Resend dashboard (resend.com/domains).',
    color: 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800',
    iconColor: 'text-green-600 dark:text-green-400',
  },
};

const IntegrationSettings = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const [integrations, setIntegrations] = useState<IntegrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [tests, setTests] = useState<Record<string, TestResult>>({});

  useEffect(() => {
    if (!isAuthenticated) navigate('/admin/login');
  }, [isAuthenticated, navigate]);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const data = await adminApi.getIntegrations();
      setIntegrations(data);
    } catch {
      toast.error('Failed to load integration status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const runTest = async (key: 'ap' | 'ghl' | 'cw' | 'email') => {
    setTests((prev) => ({ ...prev, [key]: { loading: true, result: null } }));
    try {
      const testFns: Record<string, () => Promise<any>> = {
        ap: adminApi.testAP,
        ghl: adminApi.testGHL,
        cw: adminApi.testCW,
        email: adminApi.testEmail,
      };
      const fn = testFns[key];
      const result = await fn();
      setTests((prev) => ({ ...prev, [key]: { loading: false, result } }));
      if (result.success) {
        toast.success(result.message || 'Connection successful');
      } else {
        toast.error(result.error || 'Connection failed');
      }
    } catch {
      setTests((prev) => ({
        ...prev,
        [key]: { loading: false, result: { success: false, error: 'Request failed' } },
      }));
      toast.error('Test request failed');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <AdminNav />
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AdminNav />

      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <div>
            <h2 className="text-3xl font-bold">Integrations</h2>
            <p className="text-muted-foreground mt-1">
              Service connections and their current status. Configure credentials via environment variables.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchStatus}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
        </div>

        <div className="space-y-4">
          {(Object.entries(INTEGRATION_INFO) as Array<[keyof typeof INTEGRATION_INFO, typeof INTEGRATION_INFO[keyof typeof INTEGRATION_INFO]]>).map(
            ([key, info]) => {
              const status = integrations?.[key as keyof IntegrationStatus];
              const configured = (status as any)?.configured ?? false;
              const Icon = info.icon;
              const test = tests[key];
              const canTest = configured;

              return (
                <Card key={key} className={`p-6 ${info.color}`}>
                  <div className="flex items-start gap-4">
                    <div className={`p-3 rounded-lg bg-white dark:bg-card shadow-sm`}>
                      <Icon className={`w-6 h-6 ${info.iconColor}`} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="text-lg font-semibold">{info.name}</h3>
                        <Badge
                          variant="secondary"
                          className={
                            configured
                              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                              : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                          }
                        >
                          {configured ? 'Configured' : 'Not Configured'}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">{info.description}</p>

                      {/* Integration-specific details */}
                      <div className="text-xs text-muted-foreground space-y-1">
                        {key === 'ap' && (
                          <>
                            <p>Webhook Secret: {(status as any)?.hasWebhookSecret ? 'Set' : 'Not set'}</p>
                          </>
                        )}
                        {key === 'cw' && (
                          <>
                            <p>Company ID: {(status as any)?.companyId || 'Not set'}</p>
                            <p>Base URL: {(status as any)?.baseUrl}</p>
                          </>
                        )}
                        {key === 'ghl' && (
                          <p>Location ID: {(status as any)?.locationId || 'Not set'}</p>
                        )}
                        {key === 'email' && (
                          <p>From: {(status as any)?.fromEmail}</p>
                        )}
                      </div>

                      {/* Test result */}
                      {test?.result && (
                        <div
                          className={`mt-3 p-2 rounded text-sm flex items-center gap-2 ${
                            test.result.success
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                              : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                          }`}
                        >
                          {test.result.success ? (
                            <CheckCircle className="w-4 h-4 flex-shrink-0" />
                          ) : (
                            <XCircle className="w-4 h-4 flex-shrink-0" />
                          )}
                          <span>{test.result.message || test.result.error}</span>
                        </div>
                      )}
                      {test?.result?.domains && test.result.domains.length > 0 && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          Domains: {test.result.domains.join(', ')}
                        </div>
                      )}
                    </div>

                    {/* Test button */}
                    {canTest && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => runTest(key as 'ap' | 'ghl' | 'cw' | 'email')}
                        disabled={test?.loading}
                      >
                        {test?.loading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          'Test'
                        )}
                      </Button>
                    )}
                  </div>
                </Card>
              );
            },
          )}
        </div>

        <ApWebhookTools />

        <CredentialsEditor />

        <Card className="p-6 mt-6 bg-muted/50">
          <h3 className="font-semibold mb-2">How credentials work</h3>
          <p className="text-sm text-muted-foreground">
            Each credential can come from either Railway environment variables (set on the service)
            or the form below. Values entered here override the env var at runtime — no redeploy
            needed. Clearing a field deletes the override and falls back to the env var. Secret
            values (private keys, API secrets) are masked until you click the eye icon to reveal.
          </p>
        </Card>
      </div>
    </div>
  );
};

// ── AP webhook tools ─────────────────────────────────────────────────

function ApWebhookTools() {
  const [working, setWorking] = useState(false);
  const [output, setOutput] = useState<any>(null);
  const [mode, setMode] = useState<'discover' | 'register' | null>(null);

  const discover = async () => {
    setWorking(true);
    setMode('discover');
    setOutput(null);
    try {
      const r = await adminApi.apDiscoverWebhooks();
      setOutput(r);
      if (r.status >= 200 && r.status < 300) {
        const count = Array.isArray(r.body?.data) ? r.body.data.length : 'unknown';
        toast.success(`AP returned ${count} webhook(s)`);
      } else {
        toast.error(`AP returned ${r.status}`);
      }
    } catch (e: any) {
      toast.error(e?.message || 'Discover failed');
    } finally {
      setWorking(false);
    }
  };

  const register = async () => {
    setWorking(true);
    setMode('register');
    setOutput(null);
    try {
      const r = await adminApi.apRegisterWebhook();
      setOutput(r);
      const allOk = r.results.every((x) => x.status >= 200 && x.status < 300);
      if (allOk && r.secretGenerated) {
        toast.success('Generated a fresh AP_WEBHOOK_SECRET and registered every topic');
      } else if (allOk) {
        toast.success('Registered webhooks with the existing AP_WEBHOOK_SECRET');
      } else {
        toast.error('At least one topic failed — see the output');
      }
    } catch (e: any) {
      toast.error(e?.message || 'Register failed');
    } finally {
      setWorking(false);
    }
  };

  return (
    <Card className="p-6 mt-6">
      <h3 className="text-lg font-semibold mb-2">Alternative Payments — webhook tools</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Uses your AP_CLIENT_ID / AP_CLIENT_SECRET to talk to AP. Per their docs,{' '}
        <strong>NTM supplies the webhook secret</strong> — AP just signs each delivery's
        Authorization header with whatever you give it. <strong>Register</strong>{' '}
        below will reuse <code className="font-mono">AP_WEBHOOK_SECRET</code> if it's
        already set, or mint a fresh strong one and save it for you, then subscribe
        AP to <code className="font-mono">invoice_paid</code> +{' '}
        <code className="font-mono">payment_failed</code> against{' '}
        <code className="font-mono">/api/webhooks/ap</code>.
      </p>
      <div className="flex gap-2 mb-4">
        <Button onClick={discover} disabled={working} variant="outline" size="sm">
          {working && mode === 'discover' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          List existing webhooks
        </Button>
        <Button onClick={register} disabled={working} size="sm">
          {working && mode === 'register' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          Register webhooks on AP
        </Button>
      </div>
      {output?.secret && (
        <div className="mb-3 p-3 rounded bg-orange-100 dark:bg-orange-950/30 border border-orange-300 dark:border-orange-800">
          <p className="text-sm font-semibold text-orange-900 dark:text-orange-200 mb-1">
            New AP_WEBHOOK_SECRET generated and saved
          </p>
          <p className="text-xs text-orange-800 dark:text-orange-300">
            Already in the credentials editor below. The value is also embedded in
            this response in case you need it for AP-side tooling — but it's
            unrecoverable later (AP only stores the last 4 digits).
          </p>
        </div>
      )}
      {output && (
        <pre className="text-xs bg-secondary/40 border border-border rounded p-3 overflow-x-auto max-h-96">
          {JSON.stringify(output, null, 2)}
        </pre>
      )}
    </Card>
  );
}

// ── Credentials editor ───────────────────────────────────────────────

interface CredRow {
  key: string;
  value: string;
  source: 'db' | 'env' | 'unset';
  masked: boolean;
  notes: string | null;
}

const SECTION_BY_PREFIX: Record<string, string> = {
  CW_: 'ConnectWise Manage',
  AP_: 'Alternative Payments',
  GHL_: 'GoHighLevel',
  RESEND_: 'Email (Resend)',
  FROM_: 'Email (Resend)',
  NOTIFY_: 'Notifications',
  OPENROUTER_: 'AI Chat (OpenRouter)',
};

function sectionFor(key: string): string {
  for (const prefix of Object.keys(SECTION_BY_PREFIX)) {
    if (key.startsWith(prefix)) return SECTION_BY_PREFIX[prefix];
  }
  return 'Other';
}

function CredentialsEditor() {
  const [rows, setRows] = useState<CredRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [reveal, setReveal] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const fetchRows = async (revealValues = reveal) => {
    setLoading(true);
    try {
      const data = await adminApi.getCredentials(revealValues);
      setRows(data.rows);
      const next: Record<string, string> = {};
      for (const r of data.rows) next[r.key] = r.masked ? '' : r.value;
      setDraft(next);
    } catch {
      toast.error('Failed to load credentials');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRows(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleReveal = async () => {
    const next = !reveal;
    setReveal(next);
    await fetchRows(next);
  };

  const save = async (key: string) => {
    setSaving((s) => ({ ...s, [key]: true }));
    try {
      await adminApi.setCredential(key, draft[key] || '');
      toast.success(`Saved ${key}${(draft[key] || '') === '' ? ' (cleared)' : ''}`);
      await fetchRows(reveal);
    } catch {
      toast.error(`Failed to save ${key}`);
    } finally {
      setSaving((s) => ({ ...s, [key]: false }));
    }
  };

  if (loading && rows.length === 0) {
    return (
      <Card className="p-6 mt-6">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </Card>
    );
  }

  // Group rows by section
  const grouped = new Map<string, CredRow[]>();
  for (const r of rows) {
    const s = sectionFor(r.key);
    if (!grouped.has(s)) grouped.set(s, []);
    grouped.get(s)!.push(r);
  }

  return (
    <div className="mt-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold">Credentials</h3>
          <p className="text-sm text-muted-foreground">
            Edit any credential below to override its env-var value at runtime.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={toggleReveal}>
          {reveal ? <EyeOff className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
          {reveal ? 'Hide secrets' : 'Reveal secrets'}
        </Button>
      </div>

      {[...grouped.entries()].map(([section, items]) => (
        <Card key={section} className="p-6">
          <h4 className="text-lg font-semibold mb-4">{section}</h4>
          <div className="space-y-3">
            {items.map((r) => {
              const dirty = (draft[r.key] ?? '') !== (r.masked ? '' : r.value);
              return (
                <div key={r.key} className="grid grid-cols-1 sm:grid-cols-12 gap-3 sm:items-center">
                  <div className="sm:col-span-4">
                    <code className="text-sm font-mono text-foreground break-all">{r.key}</code>
                    <Badge
                      variant="secondary"
                      className={`ml-2 text-xs ${
                        r.source === 'db'
                          ? 'bg-primary/20 text-primary'
                          : r.source === 'env'
                            ? 'bg-muted text-muted-foreground'
                            : 'bg-destructive/20 text-destructive'
                      }`}
                    >
                      {r.source === 'db' ? 'overridden' : r.source === 'env' ? 'from env' : 'unset'}
                    </Badge>
                  </div>
                  <div className="sm:col-span-7">
                    <Input
                      value={draft[r.key] ?? ''}
                      onChange={(e) => setDraft((d) => ({ ...d, [r.key]: e.target.value }))}
                      placeholder={r.masked && !reveal ? r.value : 'Not set'}
                      type={r.masked && !reveal ? 'password' : 'text'}
                      className="font-mono"
                    />
                  </div>
                  <div className="sm:col-span-1">
                    <Button
                      size="sm"
                      variant={dirty ? 'default' : 'outline'}
                      disabled={!dirty || saving[r.key]}
                      onClick={() => save(r.key)}
                      title={
                        (draft[r.key] || '') === ''
                          ? 'Clearing this will fall back to the env var (or leave it unset)'
                          : 'Save override'
                      }
                    >
                      {saving[r.key] ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Tip: leave a field blank and click save to clear an override and fall back to the env var.
          </p>
        </Card>
      ))}
    </div>
  );
}

export default IntegrationSettings;
