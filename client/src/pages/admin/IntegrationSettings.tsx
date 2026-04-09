import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  CheckCircle,
  XCircle,
  RefreshCw,
  CreditCard,
  Building2,
  Users,
  Mail,
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
        <div className="flex items-center justify-between mb-6">
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

        <Card className="p-6 mt-6 bg-muted/50">
          <h3 className="font-semibold mb-2">How to configure integrations</h3>
          <p className="text-sm text-muted-foreground">
            Integration credentials are managed through environment variables in your Railway dashboard.
            Navigate to your service settings, add the required variables, and redeploy. The status above
            will update automatically once credentials are detected.
          </p>
        </Card>
      </div>
    </div>
  );
};

export default IntegrationSettings;
