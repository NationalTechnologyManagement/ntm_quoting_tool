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
  AlertTriangle,
  Pencil,
  Save,
  Mail,
} from 'lucide-react';
import { toast } from 'sonner';
import { adminApi, quoteApi } from '@/services/api';
import AdminNav from '@/components/admin/AdminNav';
import { CONTRACT_TERM_OPTIONS, formatContractTerm } from '@/lib/utils';

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

interface ContractRow {
  id: string;
  pdfUrl: string | null;
  emailedAt: string | null;
  createdAt: string;
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

const QuoteDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const [quote, setQuote] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [contracts, setContracts] = useState<ContractRow[]>([]);

  // Edit panel state — catalog is fetched lazily the first time admin opens it.
  // Catalog comes from /api/packages (admin endpoint) so it includes packages
  // hidden from customers (e.g. Essentials with customerVisible=false).
  const [editOpen, setEditOpen] = useState(false);
  const [catalog, setCatalog] = useState<{ packages: any[]; addons: any[] } | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editPackageId, setEditPackageId] = useState<string>('');
  const [editAgreementMonths, setEditAgreementMonths] = useState<number>(0);
  const [editUserCount, setEditUserCount] = useState<number>(1);
  const [editWebUserCount, setEditWebUserCount] = useState<number>(0);
  const [editLocationCount, setEditLocationCount] = useState<number>(1);
  // Per-quote price overrides. Default to whatever the catalog says when a
  // package is picked, but admin can stamp arbitrary values onto the snapshot.
  const [editPricePerUser, setEditPricePerUser] = useState<number>(0);
  const [editPricePerUserF3, setEditPricePerUserF3] = useState<number>(0);
  const [editPricePerLocation, setEditPricePerLocation] = useState<number>(0);
  const [editNotes, setEditNotes] = useState<string>('');
  // addonId -> quantity (0 = not selected)
  const [editAddonQty, setEditAddonQty] = useState<Record<string, number>>({});

  // Admin-only promo codes (e.g. 5-year discount). Loaded lazily.
  const [adminPromos, setAdminPromos] = useState<Awaited<ReturnType<typeof adminApi.listAdminOnlyPromos>>['promos']>([]);
  const [applyingPromo, setApplyingPromo] = useState<string | null>(null);
  const [sendingEmail, setSendingEmail] = useState(false);

  const emailQuote = async () => {
    if (!quote) return;
    setSendingEmail(true);
    try {
      await quoteApi.email(quote.quoteNumber);
      toast.success(`Quote emailed to ${quote.customer?.email}`);
      await fetchQuote();
    } catch (e: any) {
      toast.error(e?.message || 'Email send failed');
    } finally {
      setSendingEmail(false);
    }
  };

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
      const [data, contractList] = await Promise.all([
        adminApi.getQuote(id),
        adminApi.listContracts(id).catch(() => ({ contracts: [] })),
      ]);
      setQuote(data);
      setContracts(contractList.contracts ?? []);
    } catch {
      toast.error('Failed to load quote');
    } finally {
      setLoading(false);
    }
  };

  // Seed the edit-panel form from the current quote snapshot when admin opens it.
  // Pulls the catalog from /api/packages + /api/addons (admin endpoints) so
  // hidden packages (e.g. Essentials, customerVisible=false) still appear.
  const openEditPanel = async () => {
    if (!quote) return;
    if (!catalog) {
      try {
        const [packages, addons] = await Promise.all([
          adminApi.getPackages(),
          adminApi.getAddons(),
        ]);
        setCatalog({ packages, addons });
      } catch {
        toast.error('Failed to load package catalog');
        return;
      }
    }
    setEditPackageId(quote.selectedPackage?.id ?? '');
    setEditAgreementMonths(Number(quote.selectedPackage?.agreementMonths ?? 0));
    setEditUserCount(Number(quote.customer?.userCount ?? 1));
    setEditWebUserCount(Number(quote.customer?.webUserCount ?? 0));
    setEditLocationCount(Number(quote.customer?.locationCount ?? 1));
    setEditPricePerUser(Number(quote.selectedPackage?.pricePerUser ?? 0));
    setEditPricePerUserF3(Number(quote.selectedPackage?.pricePerUserF3 ?? 0));
    setEditPricePerLocation(Number(quote.selectedPackage?.pricePerLocation ?? 0));
    setEditNotes(typeof quote.notes === 'string' ? quote.notes : '');
    const qty: Record<string, number> = {};
    for (const a of (quote.selectedAddons as any[]) ?? []) {
      qty[a.id] = Number(a.quantity) || 0;
    }
    setEditAddonQty(qty);
    setEditOpen(true);
  };

  // When the admin switches packages mid-edit, snap the price-override fields
  // to that package's catalog defaults so they have something sensible to
  // tweak instead of carrying over the old package's numbers.
  const pickPackage = (id: string) => {
    setEditPackageId(id);
    const pkg = catalog?.packages.find((p) => p.id === id);
    if (pkg) {
      setEditPricePerUser(Number(pkg.pricePerUser ?? 0));
      setEditPricePerUserF3(Number(pkg.pricePerUserF3 ?? 0));
      setEditPricePerLocation(Number(pkg.pricePerLocation ?? 0));
      setEditAgreementMonths(Number(pkg.agreementMonths ?? 0));
    }
  };

  const saveEdit = async () => {
    if (!quote || !catalog) return;
    const pkg = catalog.packages.find((p) => p.id === editPackageId);
    if (!pkg) {
      toast.error('Pick a package');
      return;
    }
    const selectedAddons = Object.entries(editAddonQty)
      .filter(([, q]) => q > 0)
      .map(([addonId, q]) => {
        const a = catalog.addons.find((x) => x.id === addonId);
        if (!a) return null;
        return {
          id: a.id,
          name: a.name,
          description: a.description,
          price: a.price,
          quantity: q,
          frequency: a.frequency,
          pricingType: a.pricingType,
          recurringPrice: a.recurringPrice ?? null,
          recurringFrequency: a.recurringFrequency ?? null,
          setupPrice: a.setupPrice ?? null,
        };
      })
      .filter(Boolean);

    setSavingEdit(true);
    try {
      const result = await adminApi.editQuote(quote.id, {
        userCount: editUserCount,
        webUserCount: editWebUserCount,
        locationCount: editLocationCount,
        selectedPackage: {
          id: pkg.id,
          name: pkg.name,
          // Snapshot the admin's price overrides — these can diverge from
          // the catalog defaults so a single quote can carry custom pricing
          // without changing the canonical package row.
          pricePerUser: editPricePerUser,
          pricePerUserF3: editPricePerUserF3,
          pricePerLocation: editPricePerLocation,
          frequency: pkg.frequency,
          features: pkg.features,
          agreementMonths: editAgreementMonths,
        },
        selectedAddons: selectedAddons as any[],
        notes: editNotes.trim() ? editNotes.trim() : null,
      });
      if (result.mode === 'amendment') {
        if (result.invoice) {
          toast.success(
            `Amendment ${result.amendment.quoteNumber} created. New invoice ready.`,
          );
        } else if (result.invoiceError) {
          toast.warning(
            `Amendment ${result.amendment.quoteNumber} saved, but invoice failed: ${result.invoiceError}`,
          );
        } else {
          toast.success(
            `Amendment ${result.amendment.quoteNumber} created (no new charge).`,
          );
        }
        // Pivot the admin to the amendment so they can keep working with it.
        navigate(`/admin/quotes/${result.amendment.id}`);
      } else {
        toast.success('Quote updated');
        setEditOpen(false);
        await fetchQuote();
      }
    } catch (e: any) {
      toast.error(e?.message || 'Save failed');
    } finally {
      setSavingEdit(false);
    }
  };

  const removeContract = async (contractId: string) => {
    if (!confirm('Delete this generated contract? The Quote remains; only the PDF record is removed.')) return;
    try {
      await adminApi.deleteContract(contractId);
      toast.success('Contract deleted');
      await fetchQuote();
    } catch (e: any) {
      toast.error(e?.message || 'Delete failed');
    }
  };

  useEffect(() => {
    fetchQuote();
    // Load admin-only promos in parallel so the apply UI is ready when
    // admin opens the quote.
    adminApi
      .listAdminOnlyPromos()
      .then((r) => setAdminPromos(r.promos))
      .catch(() => { /* non-critical */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const isPromoApplied = (code: string) =>
    ((quote?.appliedPromoCodes as any[]) ?? []).some(
      (p) => p.code?.toUpperCase() === code.toUpperCase(),
    );

  const applyAdminPromo = async (code: string) => {
    if (!quote) return;
    setApplyingPromo(code);
    try {
      await adminApi.applyAdminPromo(quote.id, code);
      toast.success(`Applied ${code}`);
      await fetchQuote();
    } catch (e: any) {
      toast.error(e?.message || 'Apply failed');
    } finally {
      setApplyingPromo(null);
    }
  };

  const removeAdminPromo = async (code: string) => {
    if (!quote) return;
    setApplyingPromo(code);
    try {
      await adminApi.removeAdminPromo(quote.id, code);
      toast.success(`Removed ${code}`);
      await fetchQuote();
    } catch (e: any) {
      toast.error(e?.message || 'Remove failed');
    } finally {
      setApplyingPromo(null);
    }
  };

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
            <Button variant="outline" size="sm" onClick={openEditPanel}>
              <Pencil className="w-4 h-4 mr-2" /> Edit Quote
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={emailQuote}
              disabled={sendingEmail || !quote.customer?.email}
              title={
                quote.customer?.email
                  ? `Send the quote review link to ${quote.customer.email}`
                  : 'Customer email missing — set it on the quote before sending'
              }
            >
              {sendingEmail ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Mail className="w-4 h-4 mr-2" />
              )}
              Send Quote via Email
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
            <Button
              variant="outline"
              size="sm"
              className="ml-auto text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
              onClick={async () => {
                if (
                  !confirm(
                    `Delete quote ${quote.quoteNumber}?\n\n` +
                      'This removes the quote row, its generated contracts, and any CW provisioning ' +
                      'state from this DB. Companies / agreements / projects already created in CW ' +
                      'will NOT be touched — clean those up in CW separately if needed.\n\n' +
                      'This cannot be undone.',
                  )
                )
                  return;
                try {
                  await adminApi.deleteQuote(quote.quoteNumber);
                  toast.success(`Deleted ${quote.quoteNumber}`);
                  navigate('/admin/quotes');
                } catch (err: any) {
                  toast.error(err?.message || 'Delete failed');
                }
              }}
            >
              <AlertTriangle className="w-4 h-4 mr-2" /> Delete Quote
            </Button>
          </div>
        </Card>

        {/* Edit panel — package, term, sizing, addons. For paid quotes the
            server creates an amendment quote + delta invoice; for any other
            state the snapshot is rewritten in place. */}
        {editOpen && catalog && (
          <Card className="p-6 border-primary/40">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold">Edit Quote</h3>
                <p className="text-sm text-muted-foreground">
                  {quote.status === 'paid' ? (
                    <>
                      This quote is already paid — saving will create an{' '}
                      <strong>amendment quote</strong> linked to {quote.quoteNumber} and a fresh AP
                      invoice for any delta.
                    </>
                  ) : (
                    'Changes are applied in place. Totals recalculate on save.'
                  )}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-package">Package</Label>
                <Select value={editPackageId} onValueChange={pickPackage}>
                  <SelectTrigger id="edit-package">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {catalog.packages.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                        {p.customerVisible === false ? ' (admin-only)' : ''} — $
                        {p.pricePerUser}/user · ${p.pricePerLocation}/location
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Admin-only packages aren't shown on the customer picker but are still usable
                  from here.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-term">Contract Term</Label>
                <Select
                  value={String(editAgreementMonths)}
                  onValueChange={(v) => setEditAgreementMonths(parseInt(v, 10) || 0)}
                >
                  <SelectTrigger id="edit-term">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTRACT_TERM_OPTIONS.map((opt) => (
                      <SelectItem key={opt.months} value={String(opt.months)}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Currently: {formatContractTerm(quote.selectedPackage?.agreementMonths)}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-users">Desktop Users</Label>
                <Input
                  id="edit-users"
                  type="number"
                  min={1}
                  value={editUserCount}
                  onChange={(e) => setEditUserCount(Math.max(1, parseInt(e.target.value) || 1))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-web-users">Web Users</Label>
                <Input
                  id="edit-web-users"
                  type="number"
                  min={0}
                  value={editWebUserCount}
                  onChange={(e) =>
                    setEditWebUserCount(Math.max(0, parseInt(e.target.value) || 0))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-locations">Location count</Label>
                <Input
                  id="edit-locations"
                  type="number"
                  min={1}
                  value={editLocationCount}
                  onChange={(e) => setEditLocationCount(Math.max(1, parseInt(e.target.value) || 1))}
                />
              </div>
            </div>

            {/* Per-quote price overrides. Whatever's here gets snapshotted
                onto the quote — the canonical Package row stays untouched. */}
            <div className="mt-6">
              <h4 className="font-semibold mb-2">Price overrides for this quote</h4>
              <p className="text-xs text-muted-foreground mb-3">
                Override the package's catalog prices for just this quote — useful for one-off
                discounts or custom scoping. Leave at the catalog defaults if there's no change.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-price-user">$ / Desktop User</Label>
                  <Input
                    id="edit-price-user"
                    type="number"
                    min={0}
                    step="0.01"
                    value={editPricePerUser}
                    onChange={(e) =>
                      setEditPricePerUser(Math.max(0, parseFloat(e.target.value) || 0))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-price-user-f3">$ / Web User</Label>
                  <Input
                    id="edit-price-user-f3"
                    type="number"
                    min={0}
                    step="0.01"
                    value={editPricePerUserF3}
                    onChange={(e) =>
                      setEditPricePerUserF3(Math.max(0, parseFloat(e.target.value) || 0))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-price-location">$ / Location</Label>
                  <Input
                    id="edit-price-location"
                    type="number"
                    min={0}
                    step="0.01"
                    value={editPricePerLocation}
                    onChange={(e) =>
                      setEditPricePerLocation(Math.max(0, parseFloat(e.target.value) || 0))
                    }
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 space-y-2">
              <Label htmlFor="edit-notes">Notes (customer-visible)</Label>
              <textarea
                id="edit-notes"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                rows={4}
                maxLength={5000}
                placeholder="Anything not captured by the structured pricing — custom scope, special discounts, handoff instructions, etc."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <p className="text-xs text-muted-foreground">
                Shown to the customer on the quote review page and copied into the signed contract
                PDF.
              </p>
            </div>

            <div className="mt-6">
              <h4 className="font-semibold mb-2">Add-ons</h4>
              <div className="space-y-2">
                {catalog.addons.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between p-3 bg-secondary/30 border border-border rounded-md"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-sm">{a.name}</p>
                      <p className="text-xs text-muted-foreground">{a.description}</p>
                    </div>
                    <Input
                      type="number"
                      min={0}
                      className="w-24"
                      value={editAddonQty[a.id] ?? 0}
                      onChange={(e) =>
                        setEditAddonQty((prev) => ({
                          ...prev,
                          [a.id]: Math.max(0, parseInt(e.target.value) || 0),
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end mt-6">
              <Button onClick={saveEdit} disabled={savingEdit}>
                {savingEdit ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                {quote.status === 'paid' ? 'Create Amendment' : 'Save Changes'}
              </Button>
            </div>
          </Card>
        )}

        {/* Parent / amendment linkage. Shown only when this quote is part of
            an amendment chain — surfaces the relationship so admins don't lose
            track of which quote is the "live" one. */}
        {(quote.parentQuoteId || (quote as any).amendments?.length) && (
          <Card className="p-6 bg-amber-50/40 dark:bg-amber-950/10 border-amber-200/60 dark:border-amber-900/40">
            <h3 className="text-lg font-semibold mb-2">Amendment Chain</h3>
            {quote.parentQuoteId && (
              <p className="text-sm">
                Amendment of{' '}
                <Button
                  variant="link"
                  size="sm"
                  className="p-0 h-auto"
                  onClick={() => navigate(`/admin/quotes/${quote.parentQuoteId}`)}
                >
                  parent quote
                </Button>
                .
              </p>
            )}
            {(quote as any).amendments?.length > 0 && (
              <div className="text-sm space-y-1 mt-2">
                <p className="text-muted-foreground">Amendments:</p>
                {(quote as any).amendments.map((a: any) => (
                  <Button
                    key={a.id}
                    variant="link"
                    size="sm"
                    className="p-0 h-auto block"
                    onClick={() => navigate(`/admin/quotes/${a.id}`)}
                  >
                    {a.quoteNumber}
                  </Button>
                ))}
              </div>
            )}
          </Card>
        )}

        {/* Admin-only promo codes (e.g. 5-year discount). Applied here
            never appear on the customer wizard. Discount snapshots onto
            appliedPromoCodes and (if cwProductId is set) gets posted as a
            negative-priced Addition on the CW agreement at provisioning. */}
        {adminPromos.length > 0 && (
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-2">Admin-only discounts</h3>
            <p className="text-sm text-muted-foreground mb-4">
              These promos are hidden from the customer wizard. Apply here to discount the
              quote and (when CW Product ID is set on the promo) the CW agreement invoices.
            </p>
            <div className="space-y-2">
              {adminPromos.map((p) => {
                const applied = isPromoApplied(p.code);
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between p-3 bg-secondary/40 border border-border rounded-md"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <code className="font-mono text-sm">{p.code}</code>
                        <Badge variant="secondary" className="text-xs">
                          {p.discountType === 'percentage'
                            ? `${p.discount}% off`
                            : `$${p.discount.toFixed(2)} off`}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {p.applyTo}
                        </Badge>
                        {p.cwProductId ? (
                          <Badge variant="outline" className="text-xs">
                            CW product {p.cwProductId}
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-xs text-amber-600 dark:text-amber-400"
                            title="No CW Product ID set on this promo — quote totals + AP first-month invoice will reflect the discount but CW agreement invoices will charge the full amount. Set the id on /admin/promo-codes."
                          >
                            ⚠ no CW SKU
                          </Badge>
                        )}
                      </div>
                    </div>
                    {applied ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => removeAdminPromo(p.code)}
                        disabled={applyingPromo === p.code}
                      >
                        {applyingPromo === p.code ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : null}
                        Remove
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => applyAdminPromo(p.code)}
                        disabled={applyingPromo === p.code}
                      >
                        {applyingPromo === p.code ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : null}
                        Apply
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Generated contracts */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-3">Generated Contracts</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Contract PDFs are generated automatically when payment is captured. Delete is permanent —
            removes the stored PDF record. The signed PDF in the customer's email inbox is unaffected.
          </p>
          {contracts.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No contracts generated yet.</p>
          ) : (
            <div className="space-y-2">
              {contracts.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between p-3 bg-secondary/40 border border-border rounded-md"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-xs text-muted-foreground">{c.id}</p>
                    <p className="text-sm">
                      Generated {new Date(c.createdAt).toLocaleString()}
                      {c.emailedAt ? ` · emailed ${new Date(c.emailedAt).toLocaleString()}` : ' · not emailed'}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:bg-destructive/10"
                    onClick={() => removeContract(c.id)}
                    title="Delete contract"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
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
