import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuote, CustomerInfo } from '@/contexts/QuoteContext';
import { useChatField } from '@/contexts/AiChatContext';
import { leadApi } from '@/services/api';
import { IS_LEAD_GEN_MODE } from '@/lib/lead-gen';
import { toast } from 'sonner';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { StepIndicator } from '@/components/StepIndicator';

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
  // email, fire-and-forget to GHL — debounced so we send one request per
  // pause. Server-side upsert dedupes by email, so re-firing is cheap.
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

  const valid = isFormValid();

  return (
    <div className="min-h-screen flex flex-col bg-[#FBFAF8]">
      <SiteHeader variant="minimal" />

      <div className="flex-1 max-w-[760px] w-full mx-auto px-6">
        <StepIndicator current={3} />

        {/* Title + back link */}
        <div className="text-center pt-[22px] pb-[30px] animate-rise">
          <button
            type="button"
            onClick={() => navigate('/quote-info')}
            className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-[#7A8595] mb-3.5 hover:text-[#16243F] transition-colors"
          >
            ← Back to Sizing
          </button>
          <h1 className="font-heading font-extrabold text-[34px] tracking-[-0.02em] text-[#16243F] mb-2">
            Tell us about your business
          </h1>
          <p className="text-base text-[#5A6575] m-0">A few contact details and we'll generate your quote.</p>
        </div>

        {/* Form card */}
        <div className="bg-white border border-[#E9E7E2] rounded-2xl p-8 shadow-[0_1px_2px_rgba(22,36,63,0.04)] animate-rise">
          <h2 className="font-heading font-bold text-xl text-[#16243F] mb-[22px]">Customer Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-[18px]">
            <FormField id="name" label="Full Name *" value={formData.name} valid={isFieldValid('name')} onChange={(v) => handleInputChange('name', v)} placeholder="John Doe" highlighted={nameHighlighted} />
            <FormField id="businessName" label="Business Name *" value={formData.businessName} valid={isFieldValid('businessName')} onChange={(v) => handleInputChange('businessName', v)} placeholder="Acme Corp" highlighted={businessHighlighted} />
            <FormField id="email" label="Email Address *" type="email" value={formData.email} valid={isFieldValid('email')} onChange={(v) => handleInputChange('email', v)} placeholder="john@example.com" highlighted={emailHighlighted} />
            <FormField id="phone" label="Phone Number *" type="tel" value={formData.phone} valid={isFieldValid('phone')} onChange={(v) => handleInputChange('phone', v)} placeholder="(555) 555-5555" highlighted={phoneHighlighted} />
            <FormField className="md:col-span-2" id="address" label="Business Address *" value={formData.address} valid={isFieldValid('address')} onChange={(v) => handleInputChange('address', v)} placeholder="123 Main St, City, State, ZIP" highlighted={addressHighlighted} />
            <FormField className="md:col-span-2" id="referrerCode" label="Referrer Code (Optional)" value={formData.referrerCode || ''} valid={false} onChange={(v) => handleInputChange('referrerCode', v.toUpperCase())} placeholder="Enter code if you were referred" highlighted={referrerHighlighted} inputClassName="uppercase font-mono" maxLength={20} />
          </div>
        </div>

        {/* Continue */}
        <div className="flex justify-center pt-7 pb-16">
          <button
            type="button"
            onClick={handleContinue}
            disabled={!valid || isSubmitting}
            className={[
              'inline-flex items-center gap-2.5 h-[54px] px-10 rounded-xl font-heading font-bold text-base transition-colors',
              valid && !isSubmitting
                ? 'bg-[#D96626] text-white hover:bg-[#C25A20] cursor-pointer'
                : 'bg-[#E7E4DE] text-white cursor-not-allowed',
            ].join(' ')}
          >
            {isSubmitting ? 'Processing…' : valid ? 'Continue to Summary →' : 'Fill in your details to continue'}
          </button>
        </div>
      </div>

      <SiteFooter />
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
  className?: string;
  inputClassName?: string;
  maxLength?: number;
}

function FormField({
  id,
  label,
  value,
  valid,
  onChange,
  placeholder,
  type = 'text',
  highlighted,
  className = '',
  inputClassName = '',
  maxLength,
}: FormFieldProps) {
  return (
    <div className={`${className} ${highlighted ? 'rounded-[10px] ring-2 ring-[#D96626] ring-offset-2 ring-offset-[#FBFAF8] transition-shadow' : ''}`}>
      <label htmlFor={id} className="block text-[13.5px] font-semibold text-[#16243F] mb-2">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={type}
          value={value}
          maxLength={maxLength}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full h-12 pl-3.5 pr-10 rounded-[10px] border-[1.5px] border-[#DCD9D2] bg-[#FBFAF8] text-[#16243F] text-[15px] outline-none focus:border-[#D96626] transition-colors placeholder:text-[#A9B0BC] ${inputClassName}`}
        />
        {valid && (
          <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#D96626] font-bold">✓</span>
        )}
      </div>
    </div>
  );
}

export default QuoteContact;
