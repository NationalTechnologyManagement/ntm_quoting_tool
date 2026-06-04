import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuote, Addon, CustomerInfo } from '@/contexts/QuoteContext';
import { useChatField } from '@/contexts/AiChatContext';
import { leadApi } from '@/services/api';
import { IS_LEAD_GEN_MODE } from '@/lib/lead-gen';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Check, ChevronDown, ChevronUp, ArrowLeft, Info, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SiteHeader } from '@/components/SiteHeader';

const QuoteInfo = () => {
  const navigate = useNavigate();
  const { customerInfo, setCustomerInfo, selectedPackage, selectedAddons, setSelectedAddons, addons, siteContent } = useQuote();

  const [formData, setFormData] = useState(customerInfo);
  const [formErrors, setFormErrors] = useState<Record<string, boolean>>({});
  const [showAddons, setShowAddons] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Surfaced as a red error only after the customer tries to advance without
  // at least one Desktop User. Stays red until they fix it.
  const [attemptedAdvance, setAttemptedAdvance] = useState(false);
  const explainerParagraphs = siteContent.quoteBuilderExplainerBody.split(/\n\n+/);
  const needsDesktop = (formData.userCount ?? 0) < 1;

  const activeAddons = addons.filter((addon) => addon.active);

  // If they navigated here without picking a package, send them back.
  useEffect(() => {
    if (!selectedPackage) navigate('/quote-builder');
  }, [selectedPackage, navigate]);

  // Lite quoting tool: lazy lead capture. As soon as the form has a valid
  // email, fire-and-forget to GHL — don't make the user click submit. We
  // debounce so we send one request per pause, not per keystroke. The
  // server-side upsert dedupes by email, so re-firing is cheap.
  const lastCapturedRef = useRef<string>('');
  useEffect(() => {
    if (!IS_LEAD_GEN_MODE) return;
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email);
    if (!validEmail) return;

    const handle = setTimeout(() => {
      const snapshot = JSON.stringify({
        email: formData.email,
        name: formData.name,
        phone: formData.phone,
        businessName: formData.businessName,
        address: formData.address,
        userCount: formData.userCount,
        locationCount: formData.locationCount,
        referrerCode: formData.referrerCode || '',
      });
      if (snapshot === lastCapturedRef.current) return;
      lastCapturedRef.current = snapshot;

      leadApi
        .capture({
          customer: {
            name: formData.name || formData.email,
            email: formData.email,
            phone: formData.phone || '',
            businessName: formData.businessName || '',
            address: formData.address || '',
            userCount: formData.userCount || 0,
            webUserCount: formData.webUserCount ?? 0,
            locationCount: formData.locationCount || 0,
            referrerCode: formData.referrerCode || null,
          },
        })
        .catch((err) => console.error('Lazy capture failed:', err));
    }, 700);

    return () => clearTimeout(handle);
  }, [
    formData.email,
    formData.name,
    formData.phone,
    formData.businessName,
    formData.address,
    formData.userCount,
    formData.locationCount,
    formData.referrerCode,
  ]);

  const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

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
    if (field === 'phone' && typeof value === 'string') processedValue = formatPhoneNumber(value);
    setFormData((prev) => ({ ...prev, [field]: processedValue }));
    if (formErrors[field]) setFormErrors((prev) => ({ ...prev, [field]: false }));
  };

  // Stable setters for the AI chat field registry. The agent can call
  // prefill_field("email", "...") and we route it to setFormData here. We
  // intentionally only register safe, customer-typed inputs — never the
  // continue button or the addon checkboxes (those stay user-driven).
  const setStringField = useCallback((field: keyof CustomerInfo) => (v: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: field === 'phone' ? formatPhoneNumber(v) : v,
    }));
  }, []);
  const setNumericField = useCallback((field: 'userCount' | 'locationCount') => (v: string) => {
    const n = parseInt(v, 10);
    setFormData((prev) => ({ ...prev, [field]: Number.isFinite(n) && n > 0 ? n : prev[field] }));
  }, []);

  const nameHighlighted = useChatField('name', 'Full name', setStringField('name'));
  const businessHighlighted = useChatField('businessName', 'Business name', setStringField('businessName'));
  const emailHighlighted = useChatField('email', 'Email', setStringField('email'));
  const phoneHighlighted = useChatField('phone', 'Phone', setStringField('phone'));
  const addressHighlighted = useChatField('address', 'Address', setStringField('address'));
  const userCountHighlighted = useChatField('userCount', 'Number of users', setNumericField('userCount'));
  const locationCountHighlighted = useChatField('locationCount', 'Number of locations', setNumericField('locationCount'));
  const referrerHighlighted = useChatField('referrerCode', 'Referrer code', setStringField('referrerCode'));

  const isFieldValid = (field: string): boolean => {
    const value = formData[field as keyof typeof formData];
    if (field === 'email') return typeof value === 'string' && value.length > 0 && isValidEmail(value);
    if (field === 'phone') {
      const cleaned = typeof value === 'string' ? value.replace(/\D/g, '') : '';
      return cleaned.length === 10;
    }
    if (field === 'userCount' || field === 'locationCount') {
      const n = Number(value);
      return n > 0 && Number.isInteger(n);
    }
    return typeof value === 'string' && value.trim().length > 0;
  };

  const isFormValid = () =>
    isFieldValid('name') &&
    isFieldValid('businessName') &&
    isFieldValid('email') &&
    isFieldValid('phone') &&
    isFieldValid('address') &&
    isFieldValid('userCount') &&
    isFieldValid('locationCount') &&
    selectedPackage !== null;

  const handleContinue = async () => {
    if (!isFormValid()) {
      setAttemptedAdvance(true);
      toast.error('Please fill in all required fields');
      return;
    }
    setIsSubmitting(true);

    const packageCost = selectedPackage
      ? selectedPackage.pricePerUser * formData.userCount + selectedPackage.pricePerLocation * formData.locationCount
      : 0;

    try {
      await leadApi.create({
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
        selectedPackage: selectedPackage
          ? {
              id: selectedPackage.id,
              name: selectedPackage.name,
              pricePerUser: selectedPackage.pricePerUser,
              pricePerLocation: selectedPackage.pricePerLocation,
              frequency: selectedPackage.frequency,
              calculatedPrice: packageCost,
            }
          : null,
        selectedAddons: selectedAddons.map((addon) => ({
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
        source: 'quote-info',
      });
    } catch (err) {
      console.error('Lead create failed:', err);
    }

    setCustomerInfo(formData);
    navigate('/summary');
  };

  const toggleAddon = (addon: Addon) => {
    const isSelected = selectedAddons.some((a) => a.id === addon.id);
    if (isSelected) setSelectedAddons(selectedAddons.filter((a) => a.id !== addon.id));
    else setSelectedAddons([...selectedAddons, { ...addon, quantity: 1 }]);
  };

  const updateAddonQuantity = (addonId: string, quantity: number) => {
    setSelectedAddons(
      selectedAddons.map((addon) => (addon.id === addonId ? { ...addon, quantity: Math.max(1, quantity) } : addon)),
    );
  };

  if (!selectedPackage) return null;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="max-w-5xl mx-auto space-y-8 py-12 px-4">
        {/* Header with back button + selected package summary */}
        <div className="space-y-4 animate-fade-in">
          <Button
            variant="ghost"
            onClick={() => navigate('/quote-builder')}
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Packages
          </Button>

          <div className="text-center space-y-3">
            <div className="flex justify-center">
              <img
                src="/ntm-logo.png"
                alt="NTM"
                className="w-16 h-16 md:w-20 md:h-20 drop-shadow-[0_0_20px_rgba(232,127,55,0.2)]"
              />
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-foreground">Tell us about your business</h1>
            <p className="text-muted-foreground">
              You picked <span className="text-primary font-semibold">{selectedPackage.name}</span>. A few details and we'll generate your quote.
            </p>
          </div>
        </div>

        {/* Customer Information */}
        <Card className="p-6 md:p-8 bg-card border-border shadow-card hover:shadow-card-hover transition-all duration-300 animate-slide-up">
          <h2 className="text-2xl font-semibold mb-6 text-foreground">Customer Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField
              id="name"
              label="Full Name *"
              value={formData.name}
              valid={isFieldValid('name')}
              onChange={(v) => handleInputChange('name', v)}
              placeholder="John Doe"
              highlighted={nameHighlighted}
            />
            <FormField
              id="businessName"
              label="Business Name *"
              value={formData.businessName}
              valid={isFieldValid('businessName')}
              onChange={(v) => handleInputChange('businessName', v)}
              placeholder="Acme Corp"
              highlighted={businessHighlighted}
            />
            <FormField
              id="email"
              label="Email Address *"
              type="email"
              value={formData.email}
              valid={isFieldValid('email')}
              onChange={(v) => handleInputChange('email', v)}
              placeholder="john@example.com"
              highlighted={emailHighlighted}
            />
            <FormField
              id="phone"
              label="Phone Number *"
              type="tel"
              value={formData.phone}
              valid={isFieldValid('phone')}
              onChange={(v) => handleInputChange('phone', v)}
              placeholder="(555) 555-5555"
              highlighted={phoneHighlighted}
            />
            <div className="md:col-span-2">
              <FormField
                id="address"
                label="Business Address *"
                value={formData.address}
                valid={isFieldValid('address')}
                onChange={(v) => handleInputChange('address', v)}
                placeholder="123 Main St, City, State, ZIP"
                highlighted={addressHighlighted}
              />
            </div>
            <div
              className={`space-y-2 md:col-span-2 ${
                referrerHighlighted ? 'rounded-md ring-2 ring-primary ring-offset-2 ring-offset-background transition-shadow' : ''
              }`}
            >
              <Label htmlFor="referrerCode">Referrer Code (Optional)</Label>
              <Input
                id="referrerCode"
                value={formData.referrerCode || ''}
                onChange={(e) => handleInputChange('referrerCode', e.target.value.toUpperCase())}
                placeholder="Enter code if you were referred"
                className="uppercase font-mono"
                maxLength={20}
              />
            </div>
          </div>
        </Card>

        {/* Service Details */}
        <Card
          className="p-6 md:p-8 bg-card border-border shadow-card hover:shadow-card-hover transition-all duration-300 animate-slide-up"
          style={{ animationDelay: '0.05s' }}
        >
          <h2 className="text-2xl font-semibold mb-2 text-foreground">Service Details</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Tell us how many of each user type and how many sites we'll cover. At least one
            Desktop User is required.
          </p>
          {/* Three matching columns. Label row, input row, and helper row each
              get a fixed min-height so the (i) icon on Desktop, the missing
              checkmark on Web, and the longer helper text on Web don't push
              their column out of alignment with the others. */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div
              className={`space-y-2 ${
                userCountHighlighted ? 'rounded-md ring-2 ring-primary ring-offset-2 ring-offset-background transition-shadow' : ''
              }`}
            >
              <div className="flex items-center gap-2 h-6">
                <Label htmlFor="userCount">Desktop Users *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground"
                      aria-label="What's the difference between Desktop and Web Users?"
                    >
                      <Info className="w-4 h-4" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[calc(100vw-2rem)] max-w-md text-sm space-y-2">
                    <p className="font-semibold">
                      {siteContent.quoteBuilderExplainerTitle}
                    </p>
                    {explainerParagraphs.map((para, i) => (
                      <p key={i} className="text-muted-foreground whitespace-pre-line">
                        {para}
                      </p>
                    ))}
                  </PopoverContent>
                </Popover>
              </div>
              <div className="relative">
                <Input
                  id="userCount"
                  type="number"
                  min="1"
                  value={formData.userCount || ''}
                  onChange={(e) => handleInputChange('userCount', parseInt(e.target.value) || 0)}
                  placeholder="e.g., 10"
                  className={[
                    'pr-10',
                    attemptedAdvance && needsDesktop
                      ? 'border-destructive focus-visible:ring-destructive'
                      : '',
                  ].join(' ')}
                />
                {isFieldValid('userCount') && <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-primary" />}
              </div>
              <p className="text-xs text-muted-foreground min-h-[2rem]">
                Full Microsoft 365 — primary staff. <strong>At least 1 required.</strong>
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 h-6">
                <Label htmlFor="webUserCount">Web Users</Label>
              </div>
              <div className="relative">
                <Input
                  id="webUserCount"
                  type="number"
                  min="0"
                  // Render empty when 0 so the field doesn't pre-fill a leading
                  // "0" that the customer ends up typing past (e.g. "018").
                  value={formData.webUserCount || ''}
                  onChange={(e) =>
                    handleInputChange('webUserCount', parseInt(e.target.value) || 0)
                  }
                  placeholder="e.g., 5"
                  className="pr-10"
                />
              </div>
              <p className="text-xs text-muted-foreground min-h-[2rem]">
                Web &amp; email only — frontline or kiosk users.
              </p>
            </div>
            <div
              className={`space-y-2 ${
                locationCountHighlighted ? 'rounded-md ring-2 ring-primary ring-offset-2 ring-offset-background transition-shadow' : ''
              }`}
            >
              <div className="flex items-center gap-2 h-6">
                <Label htmlFor="locationCount">Number of Locations *</Label>
              </div>
              <div className="relative">
                <Input
                  id="locationCount"
                  type="number"
                  min="1"
                  value={formData.locationCount || ''}
                  onChange={(e) => handleInputChange('locationCount', parseInt(e.target.value) || 0)}
                  placeholder="e.g., 1"
                  className="pr-10"
                />
                {isFieldValid('locationCount') && <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-primary" />}
              </div>
              <p className="text-xs text-muted-foreground min-h-[2rem]">
                Total number of physical locations.
              </p>
            </div>
          </div>

          {attemptedAdvance && needsDesktop && (
            <div className="mt-4 flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>
                At least one Desktop User is required to continue. Web Users alone aren't
                supported.
              </span>
            </div>
          )}
        </Card>

        {/* Add-ons */}
        {activeAddons.length > 0 && (
          <div className="space-y-4 animate-slide-up" style={{ animationDelay: '0.1s' }}>
            <Button
              variant="outline"
              className="w-full justify-between bg-card border-border hover:bg-secondary/60"
              onClick={() => setShowAddons(!showAddons)}
            >
              <span>Want to add premium features?</span>
              {showAddons ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </Button>
            {showAddons && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                {activeAddons.map((addon) => {
                  const selectedAddon = selectedAddons.find((a) => a.id === addon.id);
                  const isSelected = !!selectedAddon;
                  const quantity = selectedAddon?.quantity || 1;
                  return (
                    <Card
                      key={addon.id}
                      className={`p-4 bg-card border-border shadow-card transition-all duration-300 hover:shadow-card-hover hover:-translate-y-0.5 ${
                        isSelected ? 'ring-2 ring-primary border-primary/40' : ''
                      }`}
                    >
                      <div className="flex gap-3">
                        <Checkbox checked={isSelected} onCheckedChange={() => toggleAddon(addon)} className="mt-1" />
                        <div className="flex-1 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="font-semibold text-foreground">{addon.name}</h4>
                            <div className="text-right">
                              {addon.pricingType === 'both' ? (
                                <>
                                  <span className="text-sm font-semibold text-primary block">
                                    ${addon.recurringPrice}/{addon.recurringFrequency}
                                  </span>
                                  <span className="text-xs text-muted-foreground block">+ ${addon.setupPrice} setup</span>
                                </>
                              ) : addon.pricingType === 'recurring-only' ? (
                                <span className="text-sm font-semibold text-primary">
                                  ${addon.recurringPrice}/{addon.recurringFrequency}
                                </span>
                              ) : (
                                <span className="text-sm font-semibold text-primary">${addon.setupPrice} one-time</span>
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

        {/* Continue */}
        <div className="flex justify-center pt-4">
          <Button
            size="lg"
            onClick={handleContinue}
            disabled={!isFormValid() || isSubmitting}
            className="w-full sm:w-auto px-6 sm:px-12 h-12 text-base sm:text-lg shadow-card hover:shadow-card-hover hover:-translate-y-0.5 transition-all"
          >
            {isSubmitting ? 'Processing...' : 'Continue to Summary'}
          </Button>
        </div>
      </div>
    </div>
  );
};

interface FormFieldProps {
  id: string;
  label: string;
  value: string;
  valid: boolean;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  highlighted?: boolean;
}

function FormField({ id, label, value, valid, onChange, placeholder, type = 'text', highlighted }: FormFieldProps) {
  return (
    <div
      className={`space-y-2 ${
        highlighted ? 'rounded-md ring-2 ring-primary ring-offset-2 ring-offset-background transition-shadow' : ''
      }`}
    >
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pr-10" />
        {valid && <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-primary" />}
      </div>
    </div>
  );
}

export default QuoteInfo;
