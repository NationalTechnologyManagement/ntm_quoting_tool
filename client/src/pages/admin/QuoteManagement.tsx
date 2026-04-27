import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Loader2,
  Search,
  ChevronLeft,
  ChevronRight,
  FileText,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { adminApi } from '@/services/api';
import AdminNav from '@/components/admin/AdminNav';

interface QuoteSummary {
  id: string;
  quoteNumber: string;
  status: string;
  customer: {
    name: string;
    email: string;
    businessName: string;
    phone: string;
  };
  orderNumber: string | null;
  totals: {
    onboardingCost: number;
    oneTimeCosts: number;
    recurringCosts: number;
    grandTotal: number;
    recurringFrequency: string;
  };
  selectedPackage: {
    name: string;
  };
  apInvoiceId: string | null;
  cwCompanyId: number | null;
  cwOpportunityId: number | null;
  ghlContactId: string | null;
  provisioningStatus: 'pending' | 'partial' | 'provisioned' | 'failed';
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { contracts: number };
}

interface Stats {
  statusCounts: Record<string, number>;
  total: number;
  last30Days: number;
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  sent: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  accepted: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  checkout_pending: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  paid: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  expired: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

const formatCurrency = (n: number) => `$${n.toFixed(2)}`;
const formatDate = (s: string) => new Date(s).toLocaleDateString('en-US', {
  month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
});

const QuoteManagement = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const [quotes, setQuotes] = useState<QuoteSummary[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  useEffect(() => {
    if (!isAuthenticated) navigate('/admin/login');
  }, [isAuthenticated, navigate]);

  const fetchQuotes = useCallback(async () => {
    try {
      setLoading(true);
      const data = await adminApi.getQuotes({
        page,
        pageSize: 20,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        search: search || undefined,
      });
      setQuotes(data.quotes);
      setTotalPages(data.pagination.totalPages);
      setTotal(data.pagination.total);
    } catch (err) {
      toast.error('Failed to load quotes');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, search]);

  const fetchStats = useCallback(async () => {
    try {
      const data = await adminApi.getQuoteStats();
      setStats(data);
    } catch {
      // Stats are non-critical
    }
  }, []);

  useEffect(() => {
    fetchQuotes();
  }, [fetchQuotes]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleSearch = () => {
    setPage(1);
    setSearch(searchInput);
  };

  const handleStatusChange = (value: string) => {
    setPage(1);
    setStatusFilter(value);
  };

  return (
    <div className="min-h-screen bg-background">
      <AdminNav />

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-3xl font-bold">Quotes</h2>
          <Button variant="outline" size="sm" onClick={() => { fetchQuotes(); fetchStats(); }}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
            <Card className="p-3 text-center">
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </Card>
            <Card className="p-3 text-center">
              <p className="text-xs text-muted-foreground">Last 30d</p>
              <p className="text-2xl font-bold">{stats.last30Days}</p>
            </Card>
            {['draft', 'sent', 'accepted', 'checkout_pending', 'paid'].map((s) => (
              <Card key={s} className="p-3 text-center">
                <p className="text-xs text-muted-foreground capitalize">{s.replace('_', ' ')}</p>
                <p className="text-2xl font-bold">{stats.statusCounts[s] || 0}</p>
              </Card>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="flex-1 flex gap-2">
            <Input
              placeholder="Search by quote #, order #, email, business name..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="flex-1"
            />
            <Button onClick={handleSearch} variant="secondary">
              <Search className="w-4 h-4" />
            </Button>
          </div>
          <Select value={statusFilter} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="accepted">Accepted</SelectItem>
              <SelectItem value="checkout_pending">Checkout Pending</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Quote Table */}
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : quotes.length === 0 ? (
          <Card className="p-12 text-center">
            <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-lg font-medium">No quotes found</p>
            <p className="text-muted-foreground mt-1">
              {search ? 'Try a different search term' : 'Quotes will appear here once created'}
            </p>
          </Card>
        ) : (
          <>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-muted/50 border-b">
                    <th className="text-left p-3 text-sm font-medium">Quote #</th>
                    <th className="text-left p-3 text-sm font-medium">Customer</th>
                    <th className="text-left p-3 text-sm font-medium">Package</th>
                    <th className="text-left p-3 text-sm font-medium">Status</th>
                    <th className="text-right p-3 text-sm font-medium">Due Today</th>
                    <th className="text-right p-3 text-sm font-medium">Recurring</th>
                    <th className="text-left p-3 text-sm font-medium">Integrations</th>
                    <th className="text-left p-3 text-sm font-medium">Created</th>
                    <th className="text-center p-3 text-sm font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {quotes.map((q) => (
                    <tr key={q.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="p-3">
                        <span className="font-mono text-sm">{q.quoteNumber}</span>
                        {q.orderNumber && (
                          <p className="text-xs text-muted-foreground">{q.orderNumber}</p>
                        )}
                      </td>
                      <td className="p-3">
                        <p className="font-medium text-sm">{q.customer.businessName}</p>
                        <p className="text-xs text-muted-foreground">{q.customer.name}</p>
                        <p className="text-xs text-muted-foreground">{q.customer.email}</p>
                      </td>
                      <td className="p-3">
                        <span className="text-sm">{q.selectedPackage?.name || '—'}</span>
                      </td>
                      <td className="p-3">
                        <Badge className={STATUS_COLORS[q.status] || ''} variant="secondary">
                          {q.status.replace('_', ' ')}
                        </Badge>
                      </td>
                      <td className="p-3 text-right">
                        <span className="text-sm font-medium">
                          {formatCurrency((q.totals?.onboardingCost || 0) + (q.totals?.oneTimeCosts || 0))}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <span className="text-sm">
                          {formatCurrency(q.totals?.recurringCosts || 0)}
                          <span className="text-xs text-muted-foreground">/mo</span>
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex gap-1">
                          {q.apInvoiceId && (
                            <Badge variant="outline" className="text-xs">AP</Badge>
                          )}
                          {q.cwCompanyId && (
                            <Badge variant="outline" className="text-xs">CW</Badge>
                          )}
                          {q.provisioningStatus === 'partial' && (
                            <Badge
                              variant="secondary"
                              className="text-xs bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200"
                              title="Some CW provisioning steps failed — retry from the row action"
                            >
                              partial
                            </Badge>
                          )}
                          {q.provisioningStatus === 'failed' && (
                            <Badge
                              variant="secondary"
                              className="text-xs bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
                              title="CW provisioning hard-failed"
                            >
                              cw failed
                            </Badge>
                          )}
                          {q.provisioningStatus === 'provisioned' && (
                            <Badge
                              variant="secondary"
                              className="text-xs bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200"
                              title="All CW objects created"
                            >
                              cw ✓
                            </Badge>
                          )}
                          {q.ghlContactId && (
                            <Badge variant="outline" className="text-xs">GHL</Badge>
                          )}
                          {q._count.contracts > 0 && (
                            <Badge variant="outline" className="text-xs">PDF</Badge>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        <span className="text-xs text-muted-foreground">
                          {formatDate(q.createdAt)}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`/admin/quotes/${q.quoteNumber}`)}
                            title="Open admin detail (custom items, contract preview, retry)"
                          >
                            <FileText className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => window.open(`/quote-review?id=${q.quoteNumber}`, '_blank')}
                            title="Customer view (new tab)"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </Button>
                          {(q.provisioningStatus === 'partial' || q.provisioningStatus === 'failed') && (
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Retry CW provisioning"
                              onClick={async () => {
                                try {
                                  const r = await adminApi.retryProvisioning(q.quoteNumber);
                                  if (r.success) {
                                    toast.success(`Retried ${q.quoteNumber}`);
                                    fetchQuotes();
                                  } else {
                                    toast.error(r.error || 'Retry failed');
                                  }
                                } catch {
                                  toast.error('Retry request failed');
                                }
                              }}
                            >
                              <RefreshCw className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                Showing {(page - 1) * 20 + 1}–{Math.min(page * 20, total)} of {total} quotes
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="flex items-center text-sm px-2">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default QuoteManagement;
