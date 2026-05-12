import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useQuote } from '@/contexts/QuoteContext';
import { adminApi, quoteApi, usersApi } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import AdminNav from '@/components/admin/AdminNav';
import { CONTRACT_TERM_OPTIONS, formatCurrency } from '@/lib/utils';

// Admin-side quote builder. Reuses POST /api/quotes the customer wizard uses,
// so the resulting quote behaves identically downstream (CW provisioning,
// emails, etc.) — the only difference is who keyed it in. Admin gets every
// package (including customerVisible=false ones like Essentials) because we
// pull the catalog from /api/packages (admin) instead of /api/config.

const CreateQuote = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { termsContent } = useQuote();

  const [catalog, setCatalog] = useState<{ packages: any[]; addons: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Customer fields
  const [name, setName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [referrerCode, setReferrerCode] = useState('');

  // Sizing
  const [userCount, setUserCount] = useState<number>(1);
  const [webUserCount, setWebUserCount] = useState<number>(0);
  const [locationCount, setLocationCount] = useState<number>(1);

  // Selection
  const [packageId, setPackageId] = useState<string>('');
  const [agreementMonths, setAgreementMonths] = useState<number>(0);
  // Price overrides (default to catalog values when the package is picked)
  const [pricePerUser, setPricePerUser] = useState<number>(0);
  const [pricePerUserF3, setPricePerUserF3] = useState<number>(0);
  const [pricePerLocation, setPricePerLocation] = useState<number>(0);
  // addonId -> quantity (0 = not selected)
  const [addonQty, setAddonQty] = useState<Record<string, number>>({});

  const [notes, setNotes] = useState('');

  // Sales rep assignment — defaults to the current admin (if they're an
  // active rep) so quotes get attributed to whoever's typing them.
  const [salesRepId, setSalesRepId] = useState<string>('');
  const [salesReps, setSalesReps] = useState<
    Array<{ id: string; email: string; name: string | null; role: string }>
  >([]);

  useEffect(() => {
    if (!isAuthenticated) navigate('/admin/login');
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    usersApi
      .listSalesReps()
      .then((r) => setSalesReps(r.reps))
      .catch(() => {
        /* non-fatal */
      });
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [packages, addons] = await Promise.all([
          adminApi.getPackages(),
          adminApi.getAddons(),
        ]);
        setCatalog({ packages, addons });
      } catch {
        toast.error('Failed to load catalog');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const pickPackage = (id: string) => {
    setPackageId(id);
    const pkg = catalog?.packages.find((p) => p.id === id);
    if (pkg) {
      setPricePerUser(Number(pkg.pricePerUser ?? 0));
      setPricePerUserF3(Number(pkg.pricePerUserF3 ?? 0));
      setPricePerLocation(Number(pkg.pricePerLocation ?? 0));
      setAgreementMonths(Number(pkg.agreementMonths ?? 0));
    }
  };

  const pkg = catalog?.packages.find((p) => p.id === packageId);
  const activeAddons = (catalog?.addons ?? []).filter((a: any) => a.active);

  // Compute totals live. Mirrors Summary.tsx math.
  const totals = useMemo(() => {
    if (!pkg) return null;
    const desktop = userCount * pricePerUser;
    const web = webUserCount * pricePerUserF3;
    const location = locationCount * pricePerLocation;
    const packageCost = desktop + web + location;
    const addonRecurring = Object.entries(addonQty).reduce((sum, [aid, qty]) => {
      if (!qty) return sum;
      const a = activeAddons.find((x: any) => x.id === aid);
      if (!a) return sum;
      if (a.pricingType === 'one-time-only') return sum;
      return sum + (Number(a.recurringPrice) || 0) * qty;
    }, 0);
    const addonOneTime = Object.entries(addonQty).reduce((sum, [aid, qty]) => {
      if (!qty) return sum;
      const a = activeAddons.find((x: any) => x.id === aid);
      if (!a) return sum;
      if (a.pricingType === 'recurring-only') return sum;
      return sum + (Number(a.setupPrice) || 0) * qty;
    }, 0);
    const recurring = packageCost + addonRecurring;
    return {
      packageCost,
      addonRecurring,
      addonOneTime,
      recurring,
      desktop,
      web,
      location,
    };
  }, [pkg, userCount, webUserCount, locationCount, pricePerUser, pricePerUserF3, pricePerLocation, addonQty, activeAddons]);

  const canSubmit =
    name.trim() &&
    businessName.trim() &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
    phone.trim() &&
    address.trim() &&
    userCount >= 1 &&
    locationCount >= 1 &&
    pkg &&
    totals;

  const submit = async () => {
    if (!canSubmit || !pkg || !totals) return;
    setSubmitting(true);
    try {
      const selectedAddons = Object.entries(addonQty)
        .filter(([, q]) => q > 0)
        .map(([aid, q]) => {
          const a = activeAddons.find((x: any) => x.id === aid)!;
          return {
            id: a.id,
            name: a.name,
            description: a.description,
            price: a.price,
            quantity: q,
            frequency: a.frequency,
            totalPrice: (a.price ?? 0) * q,
            pricingType: a.pricingType,
            recurringPrice: a.recurringPrice ?? null,
            recurringFrequency: a.recurringFrequency ?? null,
            setupPrice: a.setupPrice ?? null,
            totalRecurringCost: (a.recurringPrice ?? 0) * q,
            totalSetupCost: (a.setupPrice ?? 0) * q,
          };
        });

      // Onboarding is waived for admin-created quotes (same policy as
      // portal customers); admin can flip individual quotes via the
      // edit panel post-create if needed.
      const onboardingBase = totals.recurring * 2; // 2x monthly per NTM policy
      const onboarding = {
        userCount,
        costPerUser: userCount > 0 ? onboardingBase / userCount : 0,
        totalCost: onboardingBase,
        discount: onboardingBase, // waived = fully discounted
        finalCost: 0,
      };

      const payload = {
        customer: {
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          businessName: businessName.trim(),
          address: address.trim(),
          userCount,
          webUserCount,
          locationCount,
          referrerCode: referrerCode.trim() || null,
        },
        selectedPackage: {
          id: pkg.id,
          name: pkg.name,
          pricePerUser,
          pricePerUserF3,
          pricePerLocation,
          frequency: pkg.frequency,
          features: pkg.features ?? [],
          // Snapshot the categorized list so the contract PDF + customer
          // review page render the full per-category feature breakdown
          // instead of falling back to the legacy flat features list.
          featureGroups: pkg.featureGroups ?? [],
          agreementMonths,
          calculatedPrice: totals.packageCost,
        },
        selectedAddons,
        onboarding,
        appliedPromoCodes: [],
        totals: {
          onboardingCost: 0,
          oneTimeCosts: totals.addonOneTime,
          recurringCosts: totals.recurring,
          discount: 0,
          grandTotal: totals.addonOneTime + totals.recurring,
          recurringFrequency: pkg.frequency,
        },
        terms: {
          version: termsContent.version,
          id: termsContent.id,
          url: `${window.location.origin}/terms`,
          content: termsContent.content,
        },
        salesRepId: salesRepId || null,
      };

      const created = await quoteApi.create(payload);

      // Stamp notes if provided. PUT /api/admin/quotes/:id supports the
      // notes field; calling it after create keeps the admin-tool payload
      // backwards-compatible with the public create endpoint.
      if (notes.trim()) {
        try {
          await adminApi.editQuote(created.id ?? created.quoteNumber, {
            notes: notes.trim(),
          });
        } catch {
          /* non-fatal; admin can add notes from QuoteDetail */
        }
      }

      toast.success(`Created ${created.quoteNumber}`);
      navigate(`/admin/quotes/${created.id ?? created.quoteNumber}`);
    } catch (e: any) {
      toast.error(e?.message || 'Create failed');
    } finally {
      setSubmitting(false);
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
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/admin/quotes')}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Quotes
        </Button>

        <div>
          <h2 className="text-3xl font-bold">Create Quote</h2>
          <p className="text-muted-foreground mt-1">
            Build a quote for a customer over the phone or in person. Saves a draft you can
            email to the customer or run through the normal sign + pay flow.
          </p>
        </div>

        {/* Customer */}
        <Card className="p-6 space-y-4">
          <h3 className="text-lg font-semibold">Customer</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="c-name">Full Name *</Label>
              <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="c-biz">Business Name *</Label>
              <Input id="c-biz" value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="c-email">Email *</Label>
              <Input id="c-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="c-phone">Phone *</Label>
              <Input id="c-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="c-addr">Address *</Label>
              <Input id="c-addr" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="c-ref">Referrer Code (optional)</Label>
              <Input
                id="c-ref"
                value={referrerCode}
                onChange={(e) => setReferrerCode(e.target.value.toUpperCase())}
                className="font-mono uppercase"
                maxLength={20}
              />
            </div>
          </div>
        </Card>

        {/* Package + sizing */}
        <Card className="p-6 space-y-4">
          <h3 className="text-lg font-semibold">Package &amp; Sizing</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="pkg">Package *</Label>
              <Select value={packageId} onValueChange={pickPackage}>
                <SelectTrigger id="pkg">
                  <SelectValue placeholder="Pick a package…" />
                </SelectTrigger>
                <SelectContent>
                  {(catalog?.packages ?? []).map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                      {p.customerVisible === false ? ' (admin-only)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="term">Contract Term</Label>
              <Select
                value={String(agreementMonths)}
                onValueChange={(v) => setAgreementMonths(parseInt(v, 10) || 0)}
              >
                <SelectTrigger id="term">
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
            </div>
            <div className="space-y-1">
              <Label htmlFor="dt">Desktop Users *</Label>
              <Input
                id="dt"
                type="number"
                min={1}
                value={userCount || ''}
                onChange={(e) => setUserCount(Math.max(1, parseInt(e.target.value) || 1))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="web">Web Users</Label>
              <Input
                id="web"
                type="number"
                min={0}
                value={webUserCount || ''}
                onChange={(e) => setWebUserCount(Math.max(0, parseInt(e.target.value) || 0))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="loc">Locations *</Label>
              <Input
                id="loc"
                type="number"
                min={1}
                value={locationCount || ''}
                onChange={(e) => setLocationCount(Math.max(1, parseInt(e.target.value) || 1))}
              />
            </div>
          </div>

          {pkg && (
            <>
              <div className="border-t border-border pt-4">
                <p className="text-sm font-semibold mb-2">Price overrides (this quote only)</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="ppu">$ / Desktop User</Label>
                    <Input
                      id="ppu"
                      type="number"
                      step="0.01"
                      min={0}
                      value={pricePerUser}
                      onChange={(e) => setPricePerUser(Math.max(0, parseFloat(e.target.value) || 0))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="ppuf3">$ / Web User</Label>
                    <Input
                      id="ppuf3"
                      type="number"
                      step="0.01"
                      min={0}
                      value={pricePerUserF3}
                      onChange={(e) => setPricePerUserF3(Math.max(0, parseFloat(e.target.value) || 0))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="ppl">$ / Location</Label>
                    <Input
                      id="ppl"
                      type="number"
                      step="0.01"
                      min={0}
                      value={pricePerLocation}
                      onChange={(e) => setPricePerLocation(Math.max(0, parseFloat(e.target.value) || 0))}
                    />
                  </div>
                </div>
              </div>
              {totals && (
                <div className="border-t border-border pt-4">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                    <div>
                      <p className="text-muted-foreground">Package recurring</p>
                      <p className="font-semibold">{formatCurrency(totals.packageCost)}/mo</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Add-ons recurring</p>
                      <p className="font-semibold">{formatCurrency(totals.addonRecurring)}/mo</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Total recurring</p>
                      <p className="font-semibold text-primary">
                        {formatCurrency(totals.recurring)}/mo
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>

        {/* Add-ons */}
        <Card className="p-6 space-y-3">
          <h3 className="text-lg font-semibold">Add-ons</h3>
          <p className="text-sm text-muted-foreground">
            Set quantity above 0 to include. Prices on the right are per-unit recurring; admin
            can adjust the snapshot from the quote detail page after create.
          </p>
          {activeAddons.length === 0 ? (
            <p className="text-sm italic text-muted-foreground">No active add-ons in the catalog.</p>
          ) : (
            <div className="space-y-2">
              {activeAddons.map((a: any) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between p-3 bg-secondary/30 border border-border rounded-md"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{a.name}</p>
                    <p className="text-xs text-muted-foreground">{a.description}</p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-sm font-mono text-muted-foreground">
                      {a.recurringPrice
                        ? `${formatCurrency(a.recurringPrice)}/${a.recurringFrequency || 'mo'}`
                        : '—'}
                    </span>
                    <Input
                      type="number"
                      min={0}
                      className="w-20"
                      value={addonQty[a.id] ?? 0}
                      onChange={(e) =>
                        setAddonQty((prev) => ({
                          ...prev,
                          [a.id]: Math.max(0, parseInt(e.target.value) || 0),
                        }))
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Sales rep assignment */}
        <Card className="p-6 space-y-2">
          <h3 className="text-lg font-semibold">Sales Rep</h3>
          <Select
            value={salesRepId || 'none'}
            onValueChange={(v) => setSalesRepId(v === 'none' ? '' : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Unassigned" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Unassigned</SelectItem>
              {salesReps.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name || r.email} ({r.role === 'admin' ? 'Admin' : 'Sales Rep'})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            The rep is auto-CCed when the quote is emailed and tracks who owns this opportunity.
          </p>
        </Card>

        {/* Notes */}
        <Card className="p-6 space-y-2">
          <h3 className="text-lg font-semibold">Notes (customer-visible)</h3>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            maxLength={5000}
            placeholder="Anything not captured above — custom scope, special discounts, hand-off instructions, etc."
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <p className="text-xs text-muted-foreground">
            Shown to the customer on their quote review page and inside the contract PDF.
          </p>
        </Card>

        <div className="flex items-center justify-end gap-3 pb-12">
          <Button variant="outline" onClick={() => navigate('/admin/quotes')}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit || submitting} size="lg">
            {submitting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Create Quote
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CreateQuote;
