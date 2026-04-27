import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useQuote, Addon } from '@/contexts/QuoteContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { adminApi } from '@/services/api';
import AdminNav from '@/components/admin/AdminNav';

const AddonManagement = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { addons, refreshConfig } = useQuote();
  
  const [editableAddons, setEditableAddons] = useState<Addon[]>(addons);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/admin/login');
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    setEditableAddons(addons);
  }, [addons]);

  const updateAddon = (index: number, field: keyof Addon, value: any) => {
    const updated = [...editableAddons];
    updated[index] = { ...updated[index], [field]: value };
    setEditableAddons(updated);
  };

  const handleSave = async () => {
    // Validate all addons have at least one price configured
    const invalidAddons = editableAddons.filter(addon => {
      if (addon.pricingType === 'recurring-only') {
        return !addon.recurringPrice || addon.recurringPrice <= 0;
      }
      if (addon.pricingType === 'one-time-only') {
        return !addon.setupPrice || addon.setupPrice <= 0;
      }
      if (addon.pricingType === 'both') {
        return (!addon.recurringPrice || addon.recurringPrice <= 0) && 
               (!addon.setupPrice || addon.setupPrice <= 0);
      }
      return false;
    });

    if (invalidAddons.length > 0) {
      toast.error('Please configure valid prices for all active add-ons');
      return;
    }

    setLoading(true);
    try {
      const originalIds = new Set(addons.map(a => a.id));

      // Update existing addons
      for (const addon of editableAddons) {
        if (originalIds.has(addon.id)) {
          await adminApi.updateAddon(addon.id, addon);
        }
      }

      await refreshConfig();
      toast.success('Add-ons saved successfully!');
    } catch (error) {
      toast.error('Failed to save add-ons');
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
        <div className="mb-6">
          <h2 className="text-3xl font-bold text-foreground">Add-On Management</h2>
          <p className="text-muted-foreground mt-1">Configure optional add-on services</p>
        </div>

        <div className="space-y-6">
          {editableAddons.map((addon, index) => (
            <Card key={addon.id} className="p-6 shadow-card">
              <div className="flex items-start justify-between mb-4">
                <h3 className="text-xl font-semibold text-foreground">
                  Add-On {index + 1}
                </h3>
                <div className="flex items-center gap-2">
                  <Label htmlFor={`active-${index}`} className="text-sm">
                    {addon.active ? 'Active' : 'Inactive'}
                  </Label>
                  <Switch
                    id={`active-${index}`}
                    checked={addon.active}
                    onCheckedChange={(checked) => updateAddon(index, 'active', checked)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor={`name-${index}`}>Add-On Name</Label>
                  <Input
                    id={`name-${index}`}
                    value={addon.name}
                    onChange={(e) => updateAddon(index, 'name', e.target.value)}
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor={`description-${index}`}>Description</Label>
                  <Textarea
                    id={`description-${index}`}
                    value={addon.description}
                    onChange={(e) => updateAddon(index, 'description', e.target.value)}
                    rows={2}
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor={`pricing-type-${index}`}>Pricing Type</Label>
                  <Select
                    value={addon.pricingType}
                    onValueChange={(value) => updateAddon(index, 'pricingType', value)}
                  >
                    <SelectTrigger id={`pricing-type-${index}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="recurring-only">Recurring Only (Monthly/Annually)</SelectItem>
                      <SelectItem value="one-time-only">One-Time Only (Setup/Installation)</SelectItem>
                      <SelectItem value="both">Both (Recurring + Setup Fee)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {(addon.pricingType === 'recurring-only' || addon.pricingType === 'both') && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor={`recurring-price-${index}`}>Recurring Price ($)</Label>
                      <Input
                        id={`recurring-price-${index}`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={addon.recurringPrice || ''}
                        onChange={(e) => updateAddon(index, 'recurringPrice', parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor={`recurring-frequency-${index}`}>Recurring Frequency</Label>
                      <Select
                        value={addon.recurringFrequency || 'monthly'}
                        onValueChange={(value) => updateAddon(index, 'recurringFrequency', value)}
                      >
                        <SelectTrigger id={`recurring-frequency-${index}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="monthly">Monthly</SelectItem>
                          <SelectItem value="annually">Annually</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}

                {(addon.pricingType === 'one-time-only' || addon.pricingType === 'both') && (
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor={`setup-price-${index}`}>Setup/Installation Fee ($)</Label>
                    <Input
                      id={`setup-price-${index}`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={addon.setupPrice || ''}
                      onChange={(e) => updateAddon(index, 'setupPrice', parseFloat(e.target.value) || 0)}
                    />
                    <p className="text-xs text-muted-foreground">
                      One-time fee charged at purchase/installation
                    </p>
                  </div>
                )}

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor={`cw-product-${index}`}>CW Catalog Product ID</Label>
                  <Input
                    id={`cw-product-${index}`}
                    type="number"
                    value={addon.cwProductId ?? ''}
                    onChange={(e) =>
                      updateAddon(
                        index,
                        'cwProductId',
                        e.target.value === '' ? null : parseInt(e.target.value, 10),
                      )
                    }
                    placeholder="e.g. 12345"
                  />
                  <p className="text-xs text-muted-foreground">
                    Required by CW. Look up the product in CW's procurement catalog and paste its ID. Without this, recurring agreements won't include this addon as a line item.
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>

        <div className="mt-8 flex justify-center">
          <Button size="lg" onClick={handleSave} disabled={loading} className="px-12">
            {loading ? 'Saving...' : 'Save All Add-Ons'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AddonManagement;
