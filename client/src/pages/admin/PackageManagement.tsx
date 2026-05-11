import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useQuote, Package } from '@/contexts/QuoteContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { X, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { adminApi } from '@/services/api';
import AdminNav from '@/components/admin/AdminNav';
import { CONTRACT_TERM_OPTIONS } from '@/lib/utils';

const PackageManagement = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { packages, refreshConfig } = useQuote();
  
  const [editablePackages, setEditablePackages] = useState<Package[]>(packages);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/admin/login');
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    setEditablePackages(packages);
  }, [packages]);

  const updatePackage = (index: number, field: keyof Package, value: any) => {
    const updated = [...editablePackages];
    updated[index] = { ...updated[index], [field]: value };
    setEditablePackages(updated);
  };

  const addFeature = (packageIndex: number) => {
    const updated = [...editablePackages];
    updated[packageIndex].features.push('');
    setEditablePackages(updated);
  };

  const updateFeature = (packageIndex: number, featureIndex: number, value: string) => {
    const updated = [...editablePackages];
    updated[packageIndex].features[featureIndex] = value;
    setEditablePackages(updated);
  };

  const removeFeature = (packageIndex: number, featureIndex: number) => {
    const updated = [...editablePackages];
    updated[packageIndex].features.splice(featureIndex, 1);
    setEditablePackages(updated);
  };

  const addPackage = () => {
    if (editablePackages.length >= 3) {
      toast.error('Maximum of 3 packages allowed');
      return;
    }
    const newPackage: Package = {
      id: `package-${Date.now()}`,
      name: 'New Package',
      pricePerUser: 0,
      pricePerLocation: 0,
      frequency: 'monthly',
      features: ['Feature 1'],
      agreementMonths: 0,
    };
    setEditablePackages([...editablePackages, newPackage]);
    toast.success('New package added');
  };

  const removePackage = (packageIndex: number) => {
    if (editablePackages.length <= 1) {
      toast.error('You must have at least one package');
      return;
    }
    const updated = editablePackages.filter((_, index) => index !== packageIndex);
    setEditablePackages(updated);
    toast.success('Package removed');
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const originalIds = new Set(packages.map(p => p.id));
      const editableIds = new Set(editablePackages.map(p => p.id));

      // Create new or update existing packages
      for (const pkg of editablePackages) {
        if (!originalIds.has(pkg.id)) {
          await adminApi.createPackage(pkg);
        } else {
          await adminApi.updatePackage(pkg.id, pkg);
        }
      }

      // Delete removed packages
      for (const pkg of packages) {
        if (!editableIds.has(pkg.id)) {
          await adminApi.deletePackage(pkg.id);
        }
      }

      await refreshConfig();
      toast.success('Packages saved successfully!');
    } catch (error) {
      toast.error('Failed to save packages');
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
            <h2 className="text-3xl font-bold text-foreground">Package Management</h2>
            <p className="text-muted-foreground mt-1">Configure your pricing packages</p>
          </div>
          {editablePackages.length < 3 && (
            <Button onClick={addPackage} className="gap-2">
              <Plus className="w-4 h-4" />
              Add Package
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {editablePackages.map((pkg, packageIndex) => (
            <Card key={pkg.id} className="p-6 shadow-card relative">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removePackage(packageIndex)}
                className="absolute top-4 right-4 text-destructive hover:text-destructive hover:bg-destructive/10"
                title="Delete Package"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
              <h3 className="text-xl font-semibold mb-4 text-foreground pr-10">
                Package {packageIndex + 1}
              </h3>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor={`name-${packageIndex}`}>Package Name</Label>
                  <Input
                    id={`name-${packageIndex}`}
                    value={pkg.name}
                    onChange={(e) => updatePackage(packageIndex, 'name', e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor={`price-per-user-${packageIndex}`}>Price Per User ($)</Label>
                    <Input
                      id={`price-per-user-${packageIndex}`}
                      type="number"
                      value={pkg.pricePerUser}
                      onChange={(e) => updatePackage(packageIndex, 'pricePerUser', parseFloat(e.target.value))}
                      min="0"
                      step="0.01"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`price-per-location-${packageIndex}`}>Price Per Location ($)</Label>
                    <Input
                      id={`price-per-location-${packageIndex}`}
                      type="number"
                      value={pkg.pricePerLocation}
                      onChange={(e) => updatePackage(packageIndex, 'pricePerLocation', parseFloat(e.target.value))}
                      min="0"
                      step="0.01"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`frequency-${packageIndex}`}>Billing Frequency</Label>
                  <Select
                    value={pkg.frequency}
                    onValueChange={(value) => updatePackage(packageIndex, 'frequency', value)}
                  >
                    <SelectTrigger id={`frequency-${packageIndex}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="annually">Annually</SelectItem>
                      <SelectItem value="one-time">One-time</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`term-${packageIndex}`}>Contract Term</Label>
                  <Select
                    value={String(pkg.agreementMonths ?? 0)}
                    onValueChange={(value) =>
                      updatePackage(packageIndex, 'agreementMonths', parseInt(value, 10) || 0)
                    }
                  >
                    <SelectTrigger id={`term-${packageIndex}`}>
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
                    Customers see this label on the package card. Changing it here updates new
                    quotes immediately; quotes already in flight keep the term they were signed under.
                  </p>
                </div>

                <div className="flex items-center justify-between py-3">
                  <Label htmlFor={`best-value-${packageIndex}`} className="cursor-pointer">
                    Show as Best Value
                  </Label>
                  <Switch
                    id={`best-value-${packageIndex}`}
                    checked={pkg.isBestValue || false}
                    onCheckedChange={(checked) => updatePackage(packageIndex, 'isBestValue', checked)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`cw-agreement-type-${packageIndex}`}>
                    CW Agreement Type ID
                  </Label>
                  <Input
                    id={`cw-agreement-type-${packageIndex}`}
                    type="number"
                    value={pkg.cwAgreementTypeId ?? ''}
                    onChange={(e) =>
                      updatePackage(
                        packageIndex,
                        'cwAgreementTypeId',
                        e.target.value === '' ? null : parseInt(e.target.value, 10),
                      )
                    }
                    placeholder="e.g. 36"
                  />
                  <p className="text-xs text-muted-foreground">
                    Maps this package to a CW agreement type. NTM defaults: Essentials=36, SafeSecure=37, SafeSecure Plus=38.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor={`cw-user-pid-${packageIndex}`}>Per-User Product ID</Label>
                    <Input
                      id={`cw-user-pid-${packageIndex}`}
                      type="number"
                      value={pkg.cwPerUserProductId ?? ''}
                      onChange={(e) =>
                        updatePackage(
                          packageIndex,
                          'cwPerUserProductId',
                          e.target.value === '' ? null : parseInt(e.target.value, 10),
                        )
                      }
                      placeholder="e.g. 1096"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`cw-user-f3-pid-${packageIndex}`}>F3 Per-User Product ID</Label>
                    <Input
                      id={`cw-user-f3-pid-${packageIndex}`}
                      type="number"
                      value={pkg.cwPerUserF3ProductId ?? ''}
                      onChange={(e) =>
                        updatePackage(
                          packageIndex,
                          'cwPerUserF3ProductId',
                          e.target.value === '' ? null : parseInt(e.target.value, 10),
                        )
                      }
                      placeholder="e.g. 1118"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`cw-loc-pid-${packageIndex}`}>Per-Location Product ID</Label>
                    <Input
                      id={`cw-loc-pid-${packageIndex}`}
                      type="number"
                      value={pkg.cwPerLocationProductId ?? ''}
                      onChange={(e) =>
                        updatePackage(
                          packageIndex,
                          'cwPerLocationProductId',
                          e.target.value === '' ? null : parseInt(e.target.value, 10),
                        )
                      }
                      placeholder="e.g. 1099"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground -mt-1">
                  CW catalog product IDs. These are posted as Agreement Additions on every paid
                  quote so CW invoices month 2+ from the same SKUs. F3 (Web & Email Only) is
                  optional — leave blank if you don't use a separate F3 tier.
                </p>

                <div className="space-y-2">
                  <Label>Features</Label>
                  <div className="space-y-2">
                    {pkg.features.map((feature, featureIndex) => (
                      <div key={featureIndex} className="flex gap-2">
                        <Input
                          value={feature}
                          onChange={(e) => updateFeature(packageIndex, featureIndex, e.target.value)}
                          placeholder="Feature description"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeFeature(packageIndex, featureIndex)}
                          className="flex-shrink-0"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                    {pkg.features.length < 15 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => addFeature(packageIndex)}
                        className="w-full"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Add Feature
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>

        <div className="mt-8 flex justify-center">
          <Button size="lg" onClick={handleSave} disabled={loading} className="px-12">
            {loading ? 'Saving...' : 'Save All Packages'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PackageManagement;
