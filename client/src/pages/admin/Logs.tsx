import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, Trash2, AlertTriangle, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { adminApi } from '@/services/api';
import AdminNav from '@/components/admin/AdminNav';

type ErrorRow = Awaited<ReturnType<typeof adminApi.getProvisioningErrors>>['errors'][number];

const Logs = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [errors, setErrors] = useState<ErrorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) navigate('/admin/login');
  }, [isAuthenticated, navigate]);

  const fetchErrors = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminApi.getProvisioningErrors(200);
      setErrors(r.errors);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load logs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchErrors();
  }, [fetchErrors]);

  const clearAll = async () => {
    if (
      !confirm(
        `Clear all ${errors.length} provisioning error log${errors.length === 1 ? '' : 's'}? This deletes the rows from AuditLog. The affected quotes themselves and any CW state are untouched.`,
      )
    ) {
      return;
    }
    setClearing(true);
    try {
      const r = await adminApi.clearProvisioningErrors();
      toast.success(`Cleared ${r.deleted} log${r.deleted === 1 ? '' : 's'}.`);
      await fetchErrors();
    } catch (e: any) {
      toast.error(e?.message || 'Clear failed');
    } finally {
      setClearing(false);
    }
  };

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-2">
          <div>
            <h2 className="text-3xl font-bold flex items-center gap-2">
              <AlertTriangle className="w-7 h-7 text-destructive" /> Provisioning Logs
            </h2>
            <p className="text-muted-foreground mt-1">
              Every CW provisioning-step failure across all quotes. Each failure is also emailed
              to support@trustntm.com from logs@trustntm.com automatically.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchErrors} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={clearAll}
              disabled={clearing || errors.length === 0}
              className="text-destructive border-destructive/40 hover:bg-destructive/10"
            >
              {clearing ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              Clear all
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : errors.length === 0 ? (
          <Card className="p-12 text-center">
            <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
            <p className="font-semibold">No provisioning errors</p>
            <p className="text-sm text-muted-foreground mt-1">
              Everything's clean. Failed steps would show up here with a click-through to the
              affected quote.
            </p>
          </Card>
        ) : (
          <Card className="divide-y divide-border">
            {errors.map((e) => {
              const isExpanded = expanded === e.id;
              return (
                <div
                  key={e.id}
                  className="p-4 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <code className="font-mono text-sm font-semibold">{e.quoteNumber}</code>
                        {e.businessName && (
                          <span className="text-sm truncate">{e.businessName}</span>
                        )}
                        <Badge variant="secondary" className="text-xs">step: {e.step}</Badge>
                        {e.provisioningStatus && (
                          <Badge variant="outline" className="text-xs">
                            {e.provisioningStatus}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs font-mono text-muted-foreground mb-2">
                        {new Date(e.createdAt).toLocaleString()}
                        {e.customerEmail ? ` · ${e.customerEmail}` : ''}
                      </p>
                      {e.error && (
                        <p className="text-sm text-destructive/90 line-clamp-2">{e.error}</p>
                      )}
                      {isExpanded && (
                        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs bg-muted/40 p-3 rounded-md">
                          <div>
                            <span className="text-muted-foreground">CW Company:</span>{' '}
                            <code className="font-mono">{e.cwIds.company ?? '—'}</code>
                          </div>
                          <div>
                            <span className="text-muted-foreground">CW Contact:</span>{' '}
                            <code className="font-mono">{e.cwIds.contact ?? '—'}</code>
                          </div>
                          <div>
                            <span className="text-muted-foreground">CW Opportunity:</span>{' '}
                            <code className="font-mono">{e.cwIds.opportunity ?? '—'}</code>
                          </div>
                          <div>
                            <span className="text-muted-foreground">CW Agreement:</span>{' '}
                            <code className="font-mono">{e.cwIds.agreement ?? '—'}</code>
                          </div>
                          <div>
                            <span className="text-muted-foreground">CW Project:</span>{' '}
                            <code className="font-mono">{e.cwIds.project ?? '—'}</code>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 items-end flex-shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setExpanded(isExpanded ? null : e.id)}
                      >
                        {isExpanded ? 'Hide' : 'Details'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate(`/admin/quotes/${e.quoteNumber}`)}
                      >
                        <ExternalLink className="w-3 h-3 mr-1" /> Open quote
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </Card>
        )}
      </div>
    </div>
  );
};

export default Logs;
