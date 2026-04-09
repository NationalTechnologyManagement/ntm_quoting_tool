import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuote, Addon, SelectedAddon } from '@/contexts/QuoteContext';
import { leadApi } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Check, ChevronDown, ChevronUp, Star, Search } from 'lucide-react';
import { toast } from 'sonner';

const QuoteBuilder = () => {
  const navigate = useNavigate();
  const { customerInfo, setCustomerInfo, selectedPackage, setSelectedPackage, selectedAddons, setSelectedAddons, packages, addons } = useQuote();
  
  const [formData, setFormData] = useState(customerInfo);
  const [formErrors, setFormErrors] = useState<Record<string, boolean>>({});
  const [showAddons, setShowAddons] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [quoteSearch, setQuoteSearch] = useState('');

  const activeAddons = addons.filter(addon => addon.active);

  // Validate email
  const isValidEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // Format phone number
  const formatPhoneNumber = (value: string) => {
    const cleaned = value.replace(/\D/g, '');
    const match = cleaned.match(/^(\d{0,3})(\d{0,3})(\d{0,4})$/);
    if (match) {
      return !match[2] ? match[1] : `(${match[1]}) ${match[2]}${match[3] ? '-' + match[3] : ''}`;
    }
    return value;
  };

  const handleInputChange = (field: string, value: string | number) => {
    let processedValue = value;
    
    if (field === 'phone' && typeof value === 'string') {
      processedValue = formatPhoneNumber(value);
    }

    setFormData(prev => ({ ...prev, [field]: processedValue }));
    
    // Clear error when user starts typing
    if (formErrors[field]) {
      setFormErrors(prev => ({ ...prev, [field]: false }));
    }
  };

  const isFieldValid = (field: string): boolean => {
    const value = formData[field as keyof typeof formData];
    if (field === 'email') {
      return typeof value === 'string' && value.length > 0 && isValidEmail(value);
    }
    if (field === 'phone') {
      const cleaned = typeof value === 'string' ? value.replace(/\D/g, '') : '';
      return cleaned.length === 10;
    }
    if (field === 'userCount' || field === 'locationCount') {
      const numValue = Number(value);
      return numValue > 0 && Number.isInteger(numValue);
    }
    return typeof value === 'string' && value.trim().length > 0;
  };

  const isFormValid = (): boolean => {
    return (
      isFieldValid('name') &&
      isFieldValid('businessName') &&
      isFieldValid('email') &&
      isFieldValid('phone') &&
      isFieldValid('address') &&
      isFieldValid('userCount') &&
      isFieldValid('locationCount') &&
      selectedPackage !== null
    );
  };

  const handleContinue = async () => {
    if (!isFormValid()) {
      toast.error('Please fill in all required fields and select a package');
      return;
    }
    
    setIsSubmitting(true);

    // Calculate package cost for the webhook payload
    const packageCost = selectedPackage 
      ? (selectedPackage.pricePerUser * formData.userCount) + 
        (selectedPackage.pricePerLocation * formData.locationCount)
      : 0;

    // Prepare lead data payload
    const leadPayload = {
      customer: {
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        businessName: formData.businessName,
        address: formData.address,
        userCount: formData.userCount,
        locationCount: formData.locationCount,
        referrerCode: formData.referrerCode || null,
      },
      selectedPackage: selectedPackage ? {
        id: selectedPackage.id,
        name: selectedPackage.name,
        pricePerUser: selectedPackage.pricePerUser,
        pricePerLocation: selectedPackage.pricePerLocation,
        frequency: selectedPackage.frequency,
        calculatedPrice: packageCost,
      } : null,
      selectedAddons: selectedAddons.map(addon => ({
        id: addon.id,
        name: addon.name,
        description: addon.description,
        price: addon.price,
        quantity: addon.quantity,
        frequency: addon.frequency,
        totalPrice: addon.price * addon.quantity,
        pricingType: addon.pricingType,
        recurringPrice: addon.recurringPrice || null,
        recurringFrequency: addon.recurringFrequency || null,
        setupPrice: addon.setupPrice || null,
        totalRecurringCost: addon.recurringPrice ? addon.recurringPrice * addon.quantity : 0,
        totalSetupCost: addon.setupPrice ? addon.setupPrice * addon.quantity : 0,
      })),
      timestamp: new Date().toISOString(),
      source: 'quote-builder',
    };

    try {
      // Send lead to CRM (non-blocking)
      await leadApi.create(leadPayload);
    } catch (error) {
      console.error('Error sending lead to CRM:', error);
    }

    // Continue with existing flow
    setCustomerInfo(formData);
    navigate('/summary');
  };

  const toggleAddon = (addon: Addon) => {
    const isSelected = selectedAddons.some(a => a.id === addon.id);
    if (isSelected) {
      setSelectedAddons(selectedAddons.filter(a => a.id !== addon.id));
    } else {
      setSelectedAddons([...selectedAddons, { ...addon, quantity: 1 }]);
    }
  };

  const updateAddonQuantity = (addonId: string, quantity: number) => {
    setSelectedAddons(
      selectedAddons.map(addon =>
        addon.id === addonId ? { ...addon, quantity: Math.max(1, quantity) } : addon
      )
    );
  };

  return (
    <div className="min-h-screen bg-muted/30 py-12 px-4">
      <div className="max-w-5xl mx-auto space-y-12">
        {/* Header */}
        <div className="text-center space-y-2 animate-fade-in">
          <h1 className="text-4xl font-bold text-foreground">Build Your Quote</h1>
          <p className="text-muted-foreground">Fill in your details and choose your perfect package</p>
        </div>

        {/* Have a quote already? */}
        <Card className="p-4 bg-primary/5 border-primary/20 animate-fade-in">
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <div className="flex-1 text-center sm:text-left">
              <p className="font-medium text-foreground">Have a quote already?</p>
              <p className="text-sm text-muted-foreground">Enter your quote number or email to look it up</p>
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <Input
                placeholder="QT-20260408-1234 or email"
                value={quoteSearch}
                onChange={(e) => setQuoteSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && quoteSearch.trim()) {
                    if (quoteSearch.includes('@')) {
                      navigate(`/quote-lookup?email=${encodeURIComponent(quoteSearch.trim())}`);
                    } else {
                      navigate(`/quote-review?id=${quoteSearch.trim()}`);
                    }
                  }
                }}
                className="w-full sm:w-64"
              />
              <Button
                variant="secondary"
                onClick={() => {
                  if (!quoteSearch.trim()) return;
                  if (quoteSearch.includes('@')) {
                    navigate(`/quote-lookup?email=${encodeURIComponent(quoteSearch.trim())}`);
                  } else {
                    navigate(`/quote-review?id=${quoteSearch.trim()}`);
                  }
                }}
                disabled={!quoteSearch.trim()}
              >
                <Search className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </Card>

        {/* Section 1: Customer Information */}
        <Card className="p-6 md:p-8 shadow-card hover:shadow-card-hover transition-all duration-300 animate-slide-up">
          <h2 className="text-2xl font-semibold mb-6 text-foreground">Customer Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name *</Label>
              <div className="relative">
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  placeholder="John Doe"
                  className="pr-10"
                />
                {isFieldValid('name') && (
                  <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary" />
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="businessName">Business Name *</Label>
              <div className="relative">
                <Input
                  id="businessName"
                  value={formData.businessName}
                  onChange={(e) => handleInputChange('businessName', e.target.value)}
                  placeholder="Acme Corp"
                  className="pr-10"
                />
                {isFieldValid('businessName') && (
                  <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary" />
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email Address *</Label>
              <div className="relative">
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  placeholder="john@example.com"
                  className="pr-10"
                />
                {isFieldValid('email') && (
                  <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary" />
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number *</Label>
              <div className="relative">
                <Input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => handleInputChange('phone', e.target.value)}
                  placeholder="(555) 555-5555"
                  className="pr-10"
                />
                {isFieldValid('phone') && (
                  <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary" />
                )}
              </div>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="address">Business Address *</Label>
              <div className="relative">
                <Input
                  id="address"
                  value={formData.address}
                  onChange={(e) => handleInputChange('address', e.target.value)}
                  placeholder="123 Main St, City, State, ZIP"
                  className="pr-10"
                />
                {isFieldValid('address') && (
                  <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary" />
                )}
              </div>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="referrerCode">Referrer Code (Optional)</Label>
              <Input
                id="referrerCode"
                value={formData.referrerCode || ''}
                onChange={(e) => handleInputChange('referrerCode', e.target.value.toUpperCase())}
                placeholder="Enter code if you were referred"
                className="uppercase font-mono"
                maxLength={20}
              />
              <p className="text-xs text-muted-foreground">
                If someone referred you to our service, enter their code here
              </p>
            </div>
          </div>
        </Card>

        {/* Section 1.5: User & Location Counts */}
        <Card className="p-6 md:p-8 shadow-card hover:shadow-card-hover transition-all duration-300 animate-slide-up" style={{ animationDelay: '0.05s' }}>
          <h2 className="text-2xl font-semibold mb-6 text-foreground">Service Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="userCount">Number of Users *</Label>
              <div className="relative">
                <Input
                  id="userCount"
                  type="number"
                  min="1"
                  value={formData.userCount || ''}
                  onChange={(e) => handleInputChange('userCount', parseInt(e.target.value) || 0)}
                  placeholder="e.g., 10"
                  className="pr-10"
                />
                {isFieldValid('userCount') && (
                  <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary" />
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Total number of users who will use the system
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="locationCount">Number of Locations *</Label>
              <div className="relative">
                <Input
                  id="locationCount"
                  type="number"
                  min="1"
                  value={formData.locationCount || ''}
                  onChange={(e) => handleInputChange('locationCount', parseInt(e.target.value) || 0)}
                  placeholder="e.g., 3"
                  className="pr-10"
                />
                {isFieldValid('locationCount') && (
                  <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary" />
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Total number of physical locations/sites
              </p>
            </div>
          </div>
        </Card>

        {/* Section 2: Package Selection */}
        <div className="space-y-6 animate-slide-up" style={{ animationDelay: '0.1s' }}>
          <h2 className="text-2xl font-semibold text-foreground">Choose Your Package</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {packages.map((pkg, index) => (
              <Card
                key={pkg.id}
                className={`relative p-6 cursor-pointer transition-all duration-300 hover:shadow-card-hover ${
                  selectedPackage?.id === pkg.id
                    ? 'border-2 border-primary bg-primary/5 shadow-card-hover'
                    : 'border border-border shadow-card'
                }`}
                onClick={() => setSelectedPackage(pkg)}
              >
                {pkg.isBestValue && (
                  <Badge className="absolute -top-3 right-4 bg-accent text-accent-foreground">
                    <Star className="w-3 h-3 mr-1" />
                    Best Value
                  </Badge>
                )}
                
                <div className="flex flex-col h-full space-y-4">
                  <div>
                    <h3 className="text-xl font-semibold text-foreground">{pkg.name}</h3>
                    <div className="mt-2 space-y-1">
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-bold text-primary">${pkg.pricePerUser}</span>
                        <span className="text-muted-foreground text-sm">/user/{pkg.frequency}</span>
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-bold text-primary">${pkg.pricePerLocation}</span>
                        <span className="text-muted-foreground text-sm">/location/{pkg.frequency}</span>
                      </div>
                      {formData.userCount > 0 && formData.locationCount > 0 && (
                        <div className="mt-2 pt-2 border-t border-border">
                          <p className="text-xs text-muted-foreground">Your estimated cost:</p>
                          <p className="text-lg font-semibold text-foreground">
                            ${((pkg.pricePerUser * formData.userCount) + (pkg.pricePerLocation * formData.locationCount)).toFixed(2)}/{pkg.frequency}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  <ul className="space-y-2">
                    {pkg.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <Check className="w-4 h-4 text-secondary mt-0.5 flex-shrink-0" />
                        <span className="text-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="flex-grow"></div>

                  <Button
                    variant={selectedPackage?.id === pkg.id ? 'default' : 'outline'}
                    className="w-full mt-auto"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedPackage(pkg);
                    }}
                  >
                    {selectedPackage?.id === pkg.id ? 'Selected' : 'Select Package'}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* Section 3: Add-ons */}
        {activeAddons.length > 0 && (
          <div className="space-y-4 animate-slide-up" style={{ animationDelay: '0.2s' }}>
            <Button
              variant="outline"
              className="w-full justify-between"
              onClick={() => setShowAddons(!showAddons)}
            >
              <span>Want to add premium features?</span>
              {showAddons ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </Button>

            {showAddons && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                {activeAddons.map((addon) => {
                  const selectedAddon = selectedAddons.find(a => a.id === addon.id);
                  const isSelected = !!selectedAddon;
                  const quantity = selectedAddon?.quantity || 1;
                  
                  return (
                    <Card
                      key={addon.id}
                      className={`p-4 transition-all duration-300 hover:shadow-card-hover ${
                        isSelected ? 'border-2 border-primary bg-primary/5' : 'border border-border'
                      }`}
                    >
                      <div className="flex gap-3">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleAddon(addon)}
                          className="mt-1"
                        />
                        <div className="flex-1 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="font-semibold text-foreground">{addon.name}</h4>
                            <div className="text-right space-y-1">
                              {addon.pricingType === 'both' ? (
                                <>
                                  <span className="text-sm font-semibold text-primary block">
                                    ${addon.recurringPrice}/{addon.recurringFrequency}
                                  </span>
                                  <span className="text-xs text-muted-foreground block">
                                    + ${addon.setupPrice} setup
                                  </span>
                                </>
                              ) : addon.pricingType === 'recurring-only' ? (
                                <span className="text-sm font-semibold text-primary">
                                  ${addon.recurringPrice}/{addon.recurringFrequency}
                                </span>
                              ) : (
                                <span className="text-sm font-semibold text-primary">
                                  ${addon.setupPrice} one-time
                                </span>
                              )}
                            </div>
                          </div>
                          <p className="text-sm text-muted-foreground">{addon.description}</p>
                          
                          {isSelected && (
                            <div className="flex items-center gap-3 pt-2">
                              <Label htmlFor={`quantity-${addon.id}`} className="text-sm">
                                Quantity:
                              </Label>
                              <Input
                                id={`quantity-${addon.id}`}
                                type="number"
                                min="1"
                                max="999"
                                value={quantity}
                                onChange={(e) => updateAddonQuantity(addon.id, parseInt(e.target.value) || 1)}
                                className="w-20 h-8"
                                onClick={(e) => e.stopPropagation()}
                              />
                              <div className="text-sm text-muted-foreground space-y-1">
                                {(() => {
                                  // Debug logging for addon pricing
                                  if (addon.id === 'addon-5') {
                                    console.log('📱 Phone System Addon Debug:', {
                                      id: addon.id,
                                      name: addon.name,
                                      pricingType: addon.pricingType,
                                      recurringPrice: addon.recurringPrice,
                                      setupPrice: addon.setupPrice,
                                      recurringFrequency: addon.recurringFrequency,
                                      quantity: quantity,
                                      calculatedRecurring: addon.recurringPrice! * quantity,
                                      calculatedSetup: addon.setupPrice! * quantity,
                                      rawAddon: addon
                                    });
                                  }
                                  
                                  if (addon.pricingType === 'both') {
                                    return (
                                      <>
                                        <p>Recurring: ${(addon.recurringPrice! * quantity).toFixed(2)}/{addon.recurringFrequency}</p>
                                        <p>Setup: ${(addon.setupPrice! * quantity).toFixed(2)} one-time</p>
                                      </>
                                    );
                                  } else if (addon.pricingType === 'recurring-only') {
                                    return <p>Total: ${(addon.recurringPrice! * quantity).toFixed(2)}/{addon.recurringFrequency}</p>;
                                  } else {
                                    return <p>Total: ${(addon.setupPrice! * quantity).toFixed(2)} one-time</p>;
                                  }
                                })()}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Continue Button */}
        <div className="flex justify-center pt-4">
          <Button
            size="lg"
            onClick={handleContinue}
            disabled={!isFormValid() || isSubmitting}
            className="px-12 h-12 text-lg"
          >
            {isSubmitting ? 'Processing...' : 'Continue to Summary'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default QuoteBuilder;
