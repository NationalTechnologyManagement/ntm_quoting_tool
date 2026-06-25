import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuote, Addon, computeOnboardingFee, Package, SelectedAddon } from '@/contexts/QuoteContext';
import { useChatField } from '@/contexts/AiChatContext';
import { IS_LEAD_GEN_MODE } from '@/lib/lead-gen';
import { formatAmount, formatContractTerm } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Check, ChevronDown, ChevronUp, ArrowLeft, ArrowRight, Info, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SiteHeader } from '@/components/SiteHeader';

// Field-level explainers shown in the (i) popover above each sizing input.
const SIZING_INFO = {
  desktop: {
    title: 'Desktop Users',
    body: 'Users who need the Microsoft apps — Word, PowerPoint, Excel — installed on their desktop. Best for your main office staff.',
  },
  web: {
    title: 'Web Users',
    body: 'Users who need those same apps but reach them through a web browser — the apps are not installed on their computer.',
  },
  location: {
    title: 'Locations',
    body: 'Add a location if there is on-site equipment to manage — a firewall, switch, or any other networking gear. No equipment to manage? Leave this at 0.',
  },
} as const;

const QuoteInfo = () => {
  const navigate = useNavigate();
  const { customerInfo, setCustomerInfo, selectedPackage, selectedAddons, setSelectedAddons, addons } = useQuote();

  // Only the sizing fields live on this page now. Contact details moved to
  // their own step (/quote-contact).
  const [userCount, setUserCount] = useState<number>(customerInfo.userCount ?? 0);
  const [webUserCount, setWebUserCount] = useState<number>(customerInfo.webUserCount ?? 0);
  const [locationCount, setLocationCount] = useState<number>(customerInfo.locationCount ?? 0);
  const [showAddons, setShowAddons] = useState(false);
  // Surfaced as a red error only after the customer tries to advance without
  // sizing anything. Stays red until they enter at least one.
  const [attemptedAdvance, setAttemptedAdvance] = useState(false);

  const activeAddons = addons.filter((addon) => addon.active);

  // At least one sizing dimension must be set to have something to quote.
  const hasSizing = userCount > 0 || webUserCount > 0 || locationCount > 0;
  const showSizingError = attemptedAdvance && !hasSizing;

  // If they navigated here without picking a package, send them back.
  useEffect(() => {
    if (!selectedPackage) navigate('/quote-builder');
  }, [selectedPackage, navigate]);

  // Stable setters for the AI chat field registry — the agent can prefill the
  // sizing inputs. All three accept 0 (the gate is "at least one > 0").
  const setNumericField = useCallback(
    (setter: (n: number) => void) => (v: string) => {
      const n = parseInt(v, 10);
      if (Number.isFinite(n) && n >= 0) setter(n);
    },
    [],
  );
  const userCountHighlighted = useChatField('userCount', 'Desktop users', setNumericField(setUserCount));
  const webUserCountHighlighted = useChatField('webUserCount', 'Web users', setNumericField(setWebUserCount));
  const locationCountHighlighted = useChatField('locationCount', 'Number of locations', setNumericField(setLocationCount));

  const handleContinue = () => {
    if (!hasSizing) {
      setAttemptedAdvance(true);
      toast.error('Enter at least one Desktop User, Web User, or Location to continue');
      return;
    }
    setCustomerInfo({ ...customerInfo, userCount, webUserCount, locationCount });
    navigate('/quote-contact');
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
      <div className="max-w-6xl mx-auto space-y-8 py-12 px-4">
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
            <h1 className="text-3xl sm:text-4xl font-bold text-foreground">Size your quote</h1>
            <p className="text-muted-foreground">
              You picked <span className="text-primary font-semibold">{selectedPackage.name}</span>. Tell us how many
              of each, and watch your price update live.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Left: sizing inputs + add-ons */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="p-6 md:p-8 bg-card border-border shadow-card animate-slide-up">
              <h2 className="text-2xl font-semibold mb-2 text-foreground">Service Details</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Tell us how many of each user type and how many sites we'll cover. At least one of these is
                required.
              </p>
              {/* Three matching columns. Label row, input row, and helper row
                  each get a fixed min-height so the (i) icons and helper text
                  stay aligned across columns. */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <SizingField
                  id="userCount"
                  label="Desktop Users"
                  info={SIZING_INFO.desktop}
                  value={userCount}
                  onChange={setUserCount}
                  placeholder="e.g., 10"
                  helper="Full Microsoft 365 — primary office staff."
                  highlighted={userCountHighlighted}
                  invalid={showSizingError}
                />
                <SizingField
                  id="webUserCount"
                  label="Web Users"
                  info={SIZING_INFO.web}
                  value={webUserCount}
                  onChange={setWebUserCount}
                  placeholder="e.g., 5"
                  helper="Web & email only — frontline or kiosk users."
                  highlighted={webUserCountHighlighted}
                  invalid={showSizingError}
                />
                <SizingField
                  id="locationCount"
                  label="Locations"
                  info={SIZING_INFO.location}
                  value={locationCount}
                  onChange={setLocationCount}
                  placeholder="e.g., 1"
                  helper="Sites with networking gear to manage. 0 if none."
                  highlighted={locationCountHighlighted}
                  invalid={showSizingError}
                />
              </div>

              {showSizingError && (
                <div className="mt-4 flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>Enter at least one Desktop User, Web User, or Location to continue.</span>
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
          </div>

          {/* Right: live price preview */}
          <div className="lg:col-span-1">
            <PriceWidget
              pkg={selectedPackage}
              userCount={userCount}
              webUserCount={webUserCount}
              locationCount={locationCount}
              selectedAddons={selectedAddons}
              onContinue={handleContinue}
              canContinue={hasSizing}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

interface SizingFieldProps {
  id: string;
  label: string;
  info: { title: string; body: string };
  value: number;
  onChange: (n: number) => void;
  placeholder?: string;
  helper: string;
  highlighted?: boolean;
  invalid?: boolean;
}

function SizingField({ id, label, info, value, onChange, placeholder, helper, highlighted, invalid }: SizingFieldProps) {
  return (
    <div
      className={`space-y-2 ${
        highlighted ? 'rounded-md ring-2 ring-primary ring-offset-2 ring-offset-background transition-shadow' : ''
      }`}
    >
      <div className="flex items-center gap-2 h-6">
        <Label htmlFor={id}>{label}</Label>
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              aria-label={`What is a ${label.replace(/s$/, '')}?`}
            >
              <Info className="w-4 h-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[calc(100vw-2rem)] max-w-sm text-sm space-y-2">
            <p className="font-semibold">{info.title}</p>
            <p className="text-muted-foreground">{info.body}</p>
          </PopoverContent>
        </Popover>
      </div>
      <div className="relative">
        <Input
          id={id}
          type="number"
          min="0"
          // 0 is a real value, so render empty (not "0") when unset and use
          // Math.max to keep negatives out.
          value={value > 0 ? value : ''}
          onChange={(e) => onChange(Math.max(0, parseInt(e.target.value) || 0))}
          placeholder={placeholder}
          className={['pr-10', invalid ? 'border-destructive focus-visible:ring-destructive' : ''].join(' ')}
        />
        {value > 0 && <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-primary" />}
      </div>
      <p className="text-xs text-muted-foreground min-h-[2rem]">{helper}</p>
    </div>
  );
}

interface PriceWidgetProps {
  pkg: Package;
  userCount: number;
  webUserCount: number;
  locationCount: number;
  selectedAddons: SelectedAddon[];
  onContinue: () => void;
  canContinue: boolean;
}

// Live cost preview shown beside the sizing inputs. Mirrors the math in
// Summary.tsx so the number the customer sees here matches checkout.
function PriceWidget({ pkg, userCount, webUserCount, locationCount, selectedAddons, onContinue, canContinue }: PriceWidgetProps) {
  const pricePerUserF3 = pkg.pricePerUserF3 ?? 0;
  const desktopLine = pkg.pricePerUser * userCount;
  const webLine = pricePerUserF3 * webUserCount;
  const locationLine = pkg.pricePerLocation * locationCount;
  const packageMonthly = desktopLine + webLine + locationLine;

  const addonRecurring = selectedAddons
    .filter((a) => a.pricingType === 'recurring-only' || a.pricingType === 'both')
    .reduce((sum, a) => sum + (a.recurringPrice || 0) * a.quantity, 0);
  const addonSetup = selectedAddons
    .filter((a) => a.pricingType === 'one-time-only' || a.pricingType === 'both')
    .reduce((sum, a) => sum + (a.setupPrice || 0) * a.quantity, 0);

  const monthlyTotal = packageMonthly + addonRecurring;

  const onboarding = computeOnboardingFee(pkg, userCount, locationCount, {
    waive: !IS_LEAD_GEN_MODE,
    webUserCount,
  });
  const dueToday = onboarding.final + addonSetup + monthlyTotal;

  return (
    <Card className="p-6 shadow-card sticky top-6 animate-slide-up" style={{ animationDelay: '0.05s' }}>
      <h2 className="text-lg font-semibold text-foreground">Your quote so far</h2>
      <p className="text-sm text-muted-foreground">
        {pkg.name} · {formatContractTerm(pkg.agreementMonths)}
      </p>

      {!canContinue ? (
        <p className="mt-6 text-sm text-muted-foreground">
          Enter your team size to see live pricing.
        </p>
      ) : (
        <div className="mt-5 space-y-4">
          <div className="space-y-1.5 text-sm">
            {userCount > 0 && (
              <Line label={`Desktop · ${userCount} × $${formatAmount(pkg.pricePerUser)}`} value={desktopLine} />
            )}
            {webUserCount > 0 && (
              <Line label={`Web · ${webUserCount} × $${formatAmount(pricePerUserF3)}`} value={webLine} />
            )}
            {locationCount > 0 && (
              <Line label={`Locations · ${locationCount} × $${formatAmount(pkg.pricePerLocation)}`} value={locationLine} />
            )}
            {addonRecurring > 0 && <Line label="Add-ons (recurring)" value={addonRecurring} />}
          </div>

          <div className="pt-3 border-t border-border flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">Monthly recurring</span>
            <span className="text-xl font-bold text-primary">
              ${formatAmount(monthlyTotal)}
              <span className="text-sm font-normal text-muted-foreground">/{pkg.frequency}</span>
            </span>
          </div>

          <div className="rounded-lg bg-primary/5 border border-primary/15 p-3 space-y-1.5 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Onboarding fee</span>
              <span className={onboarding.waived ? 'line-through text-muted-foreground' : 'text-foreground'}>
                ${formatAmount(onboarding.base)}
              </span>
            </div>
            {onboarding.waived && (
              <div className="flex items-center justify-between text-green-700 dark:text-green-400 font-medium">
                <span>✓ Waived (online signup)</span>
                <span>$0.00</span>
              </div>
            )}
            {addonSetup > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">One-time add-on setup</span>
                <span className="text-foreground">${formatAmount(addonSetup)}</span>
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-border">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">Due today (est.)</span>
              <span className="text-2xl font-bold text-foreground">${formatAmount(dueToday)}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              First month + onboarding{addonSetup > 0 ? ' + setup' : ''}. Sales tax is applied at invoice time.
            </p>
          </div>
        </div>
      )}

      <Button
        size="lg"
        onClick={onContinue}
        disabled={!canContinue}
        className="w-full mt-6 shadow-card hover:shadow-card-hover hover:-translate-y-0.5 transition-all"
      >
        Continue to Contact Info
        <ArrowRight className="ml-2 w-4 h-4" />
      </Button>
    </Card>
  );
}

function Line({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground">${formatAmount(value)}</span>
    </div>
  );
}

export default QuoteInfo;
