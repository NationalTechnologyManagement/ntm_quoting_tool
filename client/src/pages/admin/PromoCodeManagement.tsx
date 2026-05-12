import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useQuote, PromoCode } from '@/contexts/QuoteContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { adminApi } from '@/services/api';
import AdminNav from '@/components/admin/AdminNav';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const PromoCodeManagement = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { refreshConfig } = useQuote();

  // Pull from /api/promo-codes (admin) so adminOnly rows appear here too;
  // the /api/config endpoint that QuoteContext.promoCodes hangs off filters
  // adminOnly entries out. originalIds tracks what was on the server when
  // the page loaded so handleSave can compute which rows to create/delete.
  const [editablePromoCodes, setEditablePromoCodes] = useState<PromoCode[]>([]);
  const [originalIds, setOriginalIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/admin/login');
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    adminApi
      .getPromoCodes()
      .then((rows) => {
        const list = rows as PromoCode[];
        setEditablePromoCodes(list);
        setOriginalIds(new Set(list.map((p) => p.id)));
      })
      .catch(() => toast.error('Failed to load promo codes'));
  }, []);

  const updatePromoCode = (index: number, field: keyof PromoCode, value: any) => {
    const updated = [...editablePromoCodes];
    updated[index] = { ...updated[index], [field]: value };
    setEditablePromoCodes(updated);
  };

  const addPromoCode = () => {
    if (editablePromoCodes.length >= 20) {
      toast.error('Maximum 20 promo codes allowed');
      return;
    }

    const newPromo: PromoCode = {
      id: `promo-${Date.now()}`,
      code: '',
      discount: 0,
      discountType: 'percentage',
      applyTo: 'one-time',
      active: true,
      adminOnly: false,
      cwProductId: null,
    };

    setEditablePromoCodes([...editablePromoCodes, newPromo]);
  };

  const confirmDelete = (id: string) => {
    setDeleteId(id);
  };

  const deletePromoCode = () => {
    if (deleteId) {
      const updated = editablePromoCodes.filter(promo => promo.id !== deleteId);
      setEditablePromoCodes(updated);
      setDeleteId(null);
      toast.success('Promo code deleted');
    }
  };

  const handleSave = async () => {
    // Validate promo codes
    const hasEmptyCode = editablePromoCodes.some(promo => !promo.code.trim());
    if (hasEmptyCode) {
      toast.error('All promo codes must have a code');
      return;
    }

    const hasDuplicates = editablePromoCodes.some((promo, index) => 
      editablePromoCodes.findIndex(p => p.code.toUpperCase() === promo.code.toUpperCase()) !== index
    );

    if (hasDuplicates) {
      toast.error('Duplicate promo codes found');
      return;
    }

    setLoading(true);
    try {
      const editableIds = new Set(editablePromoCodes.map((p) => p.id));

      // Create new or update existing promo codes
      for (const promo of editablePromoCodes) {
        const { id, ...payload } = promo;
        if (!originalIds.has(id)) {
          await adminApi.createPromoCode(payload);
        } else {
          await adminApi.updatePromoCode(id, payload);
        }
      }

      // Delete removed promo codes
      for (const id of originalIds) {
        if (!editableIds.has(id)) {
          await adminApi.deletePromoCode(id);
        }
      }

      await refreshConfig();
      // Re-pull from server so originalIds matches what's now persisted
      const fresh = (await adminApi.getPromoCodes()) as PromoCode[];
      setEditablePromoCodes(fresh);
      setOriginalIds(new Set(fresh.map((p) => p.id)));
      toast.success('Promo codes saved successfully!');
    } catch (error) {
      toast.error('Failed to save promo codes');
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-muted/30">
      <AdminNav />

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold text-foreground">Promo Code Management</h2>
            <p className="text-muted-foreground mt-1">Configure discount codes for customers</p>
          </div>
          <Button onClick={addPromoCode} disabled={editablePromoCodes.length >= 20}>
            <Plus className="w-4 h-4 mr-2" />
            Add Promo Code
          </Button>
        </div>

        {editablePromoCodes.length === 0 ? (
          <Card className="p-12 text-center">
            <p className="text-muted-foreground mb-4">No promo codes yet</p>
            <Button onClick={addPromoCode}>
              <Plus className="w-4 h-4 mr-2" />
              Create First Promo Code
            </Button>
          </Card>
        ) : (
          <div className="space-y-6">
            {editablePromoCodes.map((promo, index) => (
              <Card key={promo.id} className="p-6 shadow-card">
                <div className="flex items-start justify-between mb-4">
                  <h3 className="text-xl font-semibold text-foreground">
                    Promo Code {index + 1}
                  </h3>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`active-${index}`} className="text-sm">
                        {promo.active ? 'Active' : 'Inactive'}
                      </Label>
                      <Switch
                        id={`active-${index}`}
                        checked={promo.active}
                        onCheckedChange={(checked) => updatePromoCode(index, 'active', checked)}
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => confirmDelete(promo.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor={`code-${index}`}>Code</Label>
                    <Input
                      id={`code-${index}`}
                      value={promo.code}
                      onChange={(e) => updatePromoCode(index, 'code', e.target.value.toUpperCase())}
                      placeholder="SAVE10"
                      className="uppercase"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`discount-${index}`}>Discount Amount</Label>
                    <Input
                      id={`discount-${index}`}
                      type="number"
                      min="0"
                      value={promo.discount}
                      onChange={(e) => updatePromoCode(index, 'discount', parseFloat(e.target.value) || 0)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`type-${index}`}>Discount Type</Label>
                    <Select
                      value={promo.discountType}
                      onValueChange={(value) => updatePromoCode(index, 'discountType', value)}
                    >
                      <SelectTrigger id={`type-${index}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percentage">Percentage (%)</SelectItem>
                        <SelectItem value="fixed">Fixed Amount ($)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`apply-${index}`}>Apply To</Label>
                    <Select
                      value={promo.applyTo}
                      onValueChange={(value) => updatePromoCode(index, 'applyTo', value)}
                    >
                      <SelectTrigger id={`apply-${index}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="one-time">One-time Only</SelectItem>
                        <SelectItem value="monthly">Monthly Only</SelectItem>
                        <SelectItem value="onboarding">Onboarding Only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-card">
                    <div>
                      <Label htmlFor={`admin-only-${index}`} className="font-medium">
                        Admin-only
                      </Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Hidden from the customer wizard. Apply from /admin/quotes/:id.
                      </p>
                    </div>
                    <Switch
                      id={`admin-only-${index}`}
                      checked={promo.adminOnly ?? false}
                      onCheckedChange={(checked) => updatePromoCode(index, 'adminOnly', checked)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`cw-pid-${index}`}>CW Product ID (optional)</Label>
                    <Input
                      id={`cw-pid-${index}`}
                      type="number"
                      value={promo.cwProductId ?? ''}
                      onChange={(e) =>
                        updatePromoCode(
                          index,
                          'cwProductId',
                          e.target.value === '' ? null : parseInt(e.target.value, 10),
                        )
                      }
                      placeholder="e.g. PERUSER0004-MRR's id"
                    />
                    <p className="text-xs text-muted-foreground">
                      If set, postAdditions posts a negative-priced discount line on the CW
                      agreement so CW invoices match the discounted total.
                    </p>
                  </div>
                </div>

                <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    <strong className="text-foreground">{promo.code || 'CODE'}</strong>{' '}
                    {promo.adminOnly ? '(admin-only) ' : ''}will give{' '}
                    <strong className="text-foreground">
                      {promo.discountType === 'percentage' ? `${promo.discount}%` : `$${promo.discount}`}
                    </strong>{' '}
                    off {promo.applyTo === 'onboarding' ? 'onboarding costs' : `${promo.applyTo} costs`}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        )}

        <div className="mt-8 flex justify-center">
          <Button size="lg" onClick={handleSave} disabled={loading} className="px-12">
            {loading ? 'Saving...' : 'Save All Promo Codes'}
          </Button>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Promo Code?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the promo code.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deletePromoCode} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default PromoCodeManagement;
