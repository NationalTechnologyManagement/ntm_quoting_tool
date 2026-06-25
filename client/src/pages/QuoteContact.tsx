import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuote, CustomerInfo } from '@/contexts/QuoteContext';
import { useChatField } from '@/contexts/AiChatContext';
import { leadApi } from '@/services/api';
import { IS_LEAD_GEN_MODE } from '@/lib/lead-gen';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Check, ArrowLeft, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { SiteHeader } from '@/components/SiteHeader';

const QuoteContact = () => {
  const navigate = useNavigate();
  const { customerInfo, setCustomerInfo, selectedPackage, selectedAddons } = useQuote();

  const [formData, setFormData] = useState(customerInfo);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const hasSizing =
    (customerInfo.userCount ?? 0) > 0 ||
    (customerInfo.webUserCount ?? 0) > 0 ||
    (customerInfo.locationCount ?? 0) > 0;

  // Guard the flow: no package → back to the picker; package but no sizing yet
  // (e.g. deep link) → back to the sizing step.
  useEffect(() => {
    if (!selectedPackage) navigate('/quote-builder');
    else if (!hasSizing) navigate('/quote-info');
  }, [selectedPackage, hasSizing, navigate]);

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
        userCount: customerInfo.userCount,
        webUserCount: customerInfo.webUserCount,
        locationCount: customerInfo.locationCount,
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
            userCount: customerInfo.userCount || 0,
            webUserCount: customerInfo.webUserCount ?? 0,
            locationCount: customerInfo.locationCount || 0,
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
    formData.referrerCode,
    customerInfo.userCount,
    customerInfo.webUserCount,
    customerInfo.locationCount,
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

  const handleInputChange = (field: string, value: string) => {
    const processedValue = field === 'phone' ? formatPhoneNumber(value) : value;
    setFormData((prev) => ({ ...prev, [field]: processedValue }));
  };

  // Stable setters for the AI chat field registry — only customer-typed
  // inputs are registered (never the continue button).
  const setStringField = useCallback(
    (field: keyof CustomerInfo) => (v: string) => {
      setFormData((prev) => ({ ...prev, [field]: field === 'phone' ? formatPhoneNumber(v) : v }));
    },
    [],
  );

  const nameHighlighted = useChatField('name', 'Full name', setStringField('name'));
  const businessHighlighted = useChatField('businessName', 'Business name', setStringField('businessName'));
  const emailHighlighted = useChatField('email', 'Email', setStringField('email'));
  const phoneHighlighted = useChatField('phone', 'Phone', setStringField('phone'));
  const addressHighlighted = useChatField('address', 'Address', setStringField('address'));
  const referrerHighlighted = useChatField('referrerCode', 'Referrer code', setStringField('referrerCode'));

  const isFieldValid = (field: keyof CustomerInfo): boolean => {
    const value = formData[field];
    if (field === 'email') return typeof value === 'string' && value.length > 0 && isValidEmail(value);
    if (field === 'phone') {
      const cleaned = typeof value === 'string' ? value.replace(/\D/g, '') : '';
      return cleaned.length === 10;
    }
    return typeof value === 'string' && value.trim().length > 0;
  };

  const isFormValid = () =>
    isFieldValid('name') &&
    isFieldValid('businessName') &&
    isFieldValid('email') &&
    isFieldValid('phone') &&
    isFieldValid('address') &&
    selectedPackage !== null;

  const handleContinue = async () => {
    if (!isFormValid()) {
      toast.error('Please fill in all required fields');
      return;
    }
    setIsSubmitting(true);

    const merged = { ...customerInfo, ...formData };
    const packageCost = selectedPackage
      ? selectedPackage.pricePerUser * merged.userCount +
        (selectedPackage.pricePerUserF3 ?? 0) * (merged.webUserCount ?? 0) +
        selectedPackage.pricePerLocation * merged.locationCount
      : 0;

    try {
      await leadApi.create({
        customer: {
          name: merged.name,
          email: merged.email,
          phone: merged.phone,
          businessName: merged.businessName,
          address: merged.address,
          userCount: merged.userCount,
          webUserCount: merged.webUserCount ?? 0,
          locationCount: merged.locationCount,
          referrerCode: merged.referrerCode || null,
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
        source: 'quote-contact',
      });
    } catch (err) {
      console.error('Lead create failed:', err);
    }

    setCustomerInfo(merged);
    navigate('/summary');
  };

  if (!selectedPackage) return null;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="max-w-3xl mx-auto space-y-8 py-12 px-4">
        {/* Header with back button */}
        <div className="space-y-4 animate-fade-in">
          <Button
            variant="ghost"
            onClick={() => navigate('/quote-info')}
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Sizing
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
            <p className="text-muted-foreground">A few contact details and we'll generate your quote.</p>
          </div>
        </div>

        {/* Customer Information */}
        <Card className="p-6 md:p-8 bg-card border-border shadow-card animate-slide-up">
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

        {/* Continue */}
        <div className="flex justify-center pt-2">
          <Button
            size="lg"
            onClick={handleContinue}
            disabled={!isFormValid() || isSubmitting}
            className="w-full sm:w-auto px-6 sm:px-12 h-12 text-base sm:text-lg shadow-card hover:shadow-card-hover hover:-translate-y-0.5 transition-all"
          >
            {isSubmitting ? 'Processing...' : 'Continue to Summary'}
            <ArrowRight className="ml-2 w-4 h-4" />
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

export default QuoteContact;
