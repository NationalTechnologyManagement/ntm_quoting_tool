import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Loader2,
  ArrowLeft,
  Plus,
  Trash2,
  ExternalLink,
  FileText,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { adminApi } from '@/services/api';
import AdminNav from '@/components/admin/AdminNav';

interface CustomItem {
  id: string;
  name: string;
  description?: string;
  quantity: number;
  recurringPrice?: number | null;
  recurringFrequency?: 'monthly' | 'annually' | null;
  oneTimePrice?: number | null;
  addedBy?: string;
  addedAt?: string;
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

const QuoteDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const [quote, setQuote] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  // New-item form
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [recurringPrice, setRecurringPrice] = useState<string>('');
  const [recurringFrequency, setRecurringFrequency] = useState<'monthly' | 'annually'>('monthly');
  const [oneTimePrice, setOneTimePrice] = useState<string>('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) navigate('/admin/login');
  }, [isAuthenticated, navigate]);

  const fetchQuote = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await adminApi.getQuote(id);
      setQuote(data);
    } catch {
      toast.error('Failed to load quote');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const addItem = async () => {
    if (!quote) return;
    if (!name.trim()) {
      toast.error('Name required');
      return;
    }
    const r = recurringPrice === '' ? null : Number(recurringPrice);
    const o = oneTimePrice === '' ? null : Number(oneTimePrice);
    if ((r ?? 0) <= 0 && (o ?? 0) <= 0) {
      toast.error('Set at least one of recurring or one-time price');
      return;
    }
    setAdding(true);
    try {
      await adminApi.addCustomItem(quote.id, {
        name: name.trim(),
        description: description.trim() || undefined,
        quantity,
        recurringPrice: r,
        recurringFrequency: r ? recurringFrequency : null,
        oneTimePrice: o,
      });
      toast.success(`Added "${name}"`);
      setName('');
      setDescription('');
      setQuantity(1);
      setRecurringPrice('');
      setOneTimePrice('');
      await fetchQuote();
    } catch (e: any) {
      toast.error(e?.message || 'Add failed');
    } finally {
      setAdding(false);
    }
  };

  const removeItem = async (itemId: string) => {
    if (!quote) return;
    if (!confirm('Remove this custom item from the quote?')) return;
    try {
      await adminApi.removeCustomItem(quote.id, itemId);
      toast.success('Removed');
      await fetchQuote();
    } catch (e: any) {
      toast.error(e?.message || 'Remove failed');
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
  if (!quote) return null;

  const customItems: CustomItem[] = quote.customItems ?? [];
  const customer = quote.customer;
  const pkg = quote.selectedPackage;

  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/admin/quotes')}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Quotes
        </Button>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-2xl font-bold">{quote.quoteNumber}</h2>
              <p className="text-sm text-muted-foreground">
                {customer?.businessName} — {customer?.name} &lt;{customer?.email}&gt;
              </p>
            </div>
            <div className="flex gap-2">
              <Badge variant="secondary">{quote.status}</Badge>
              {quote.provisioningStatus && quote.provisioningStatus !== 'pending' && (
                <Badge
                  variant="secondary"
                  className={
                    quote.provisioningStatus === 'provisioned'
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200'
                      : quote.provisioningStatus === 'partial'
                        ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200'
                        : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200'
                  }
                >
                  CW: {quote.provisioningStatus}
                </Badge>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Package</p>
              <p className="font-semibold">{pkg?.name}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Recurring</p>
              <p className="font-semibold">{fmt(quote.totals?.recurringCosts ?? 0)}/{quote.totals?.recurringFrequency || 'mo'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">One-time</p>
              <p className="font-semibold">
                {fmt((quote.totals?.onboardingCost ?? 0) + (quote.totals?.oneTimeCosts ?? 0))}
              </p>
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(`/quote-review?id=${quote.quoteNumber}`, '_blank')}
            >
              <ExternalLink className="w-4 h-4 mr-2" /> Customer View
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/admin/contracts/preview/${quote.quoteNumber}`)}
            >
              <FileText className="w-4 h-4 mr-2" /> Contract Preview
            </Button>
            {(quote.provisioningStatus === 'partial' || quote.provisioningStatus === 'failed') && (
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    await adminApi.retryProvisioning(quote.quoteNumber);
                    toast.success('Retry triggered');
                    fetchQuote();
                  } catch {
                    toast.error('Retry failed');
                  }
                }}
              >
                <RefreshCw className="w-4 h-4 mr-2" /> Retry CW
              </Button>
            )}
          </div>
        </Card>

        {/* Custom items */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-3">Custom Line Items</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Items added here are billed alongside the standard quote. Recurring items roll into the
            CW agreement; one-time items appear on the next AP invoice.
          </p>

          {customItems.length === 0 ? (
            <p className="text-sm text-muted-foreground italic mb-4">No custom items yet.</p>
          ) : (
            <div className="space-y-2 mb-4">
              {customItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3 bg-secondary/40 border border-border rounded-md"
                >
                  <div className="flex-1">
                    <p className="font-medium">{item.name} × {item.quantity}</p>
                    {item.description && (
                      <p className="text-xs text-muted-foreground">{item.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {item.recurringPrice ? `${fmt(item.recurringPrice)}/${item.recurringFrequency || 'mo'}` : null}
                      {item.recurringPrice && item.oneTimePrice ? ' · ' : null}
                      {item.oneTimePrice ? `${fmt(item.oneTimePrice)} one-time` : null}
                      {item.addedBy ? ` · added by ${item.addedBy}` : null}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:bg-destructive/10"
                    onClick={() => removeItem(item.id)}
                    title="Remove"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="border-t border-border pt-4 space-y-3">
            <h4 className="font-semibold flex items-center gap-2">
              <Plus className="w-4 h-4" /> Add Custom Item
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1 md:col-span-2">
                <Label htmlFor="ci-name">Name</Label>
                <Input
                  id="ci-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Custom integration setup"
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label htmlFor="ci-description">Description (optional)</Label>
                <Input
                  id="ci-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Short description of the work"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ci-qty">Quantity</Label>
                <Input
                  id="ci-qty"
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ci-recurring">Recurring price (per unit)</Label>
                <Input
                  id="ci-recurring"
                  type="number"
                  step="0.01"
                  min={0}
                  value={recurringPrice}
                  onChange={(e) => setRecurringPrice(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ci-frequency">Recurring frequency</Label>
                <Select
                  value={recurringFrequency}
                  onValueChange={(v) => setRecurringFrequency(v as 'monthly' | 'annually')}
                >
                  <SelectTrigger id="ci-frequency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="annually">Annually</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="ci-onetime">One-time price (per unit)</Label>
                <Input
                  id="ci-onetime"
                  type="number"
                  step="0.01"
                  min={0}
                  value={oneTimePrice}
                  onChange={(e) => setOneTimePrice(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={addItem} disabled={adding || !name.trim()}>
                {adding ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                Add Item
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default QuoteDetail;
