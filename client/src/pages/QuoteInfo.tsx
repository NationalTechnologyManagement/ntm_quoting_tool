import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuote, Addon, computeOnboardingFee, Package, SelectedAddon } from '@/contexts/QuoteContext';
import { useChatField } from '@/contexts/AiChatContext';
import { IS_LEAD_GEN_MODE } from '@/lib/lead-gen';
import { formatAmount, formatContractTerm } from '@/lib/utils';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Info } from 'lucide-react';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { StepIndicator } from '@/components/StepIndicator';

// Field-level explainers shown in the (i) popover next to each sizing input.
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

  const [userCount, setUserCount] = useState<number>(customerInfo.userCount ?? 0);
  const [webUserCount, setWebUserCount] = useState<number>(customerInfo.webUserCount ?? 0);
  const [locationCount, setLocationCount] = useState<number>(customerInfo.locationCount ?? 0);
  const [showAddons, setShowAddons] = useState(false);
  const [attemptedAdvance, setAttemptedAdvance] = useState(false);

  const activeAddons = addons.filter((addon) => addon.active);

  const hasSizing = userCount > 0 || webUserCount > 0 || locationCount > 0;
  const showSizingError = attemptedAdvance && !hasSizing;

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
    <div className="min-h-screen flex flex-col bg-[#FBFAF8]">
      <SiteHeader variant="minimal" />

      <div className="flex-1 max-w-[1080px] w-full mx-auto px-6">
        <StepIndicator current={2} />

        {/* Title + back link */}
        <div className="text-center pt-[22px] pb-[30px] animate-rise">
          <button
            type="button"
            onClick={() => navigate('/quote-builder')}
            className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-[#7A8595] mb-3.5 hover:text-[#16243F] transition-colors"
          >
            ← Back to Packages
          </button>
          <h1 className="font-heading font-extrabold text-[34px] tracking-[-0.02em] text-[#16243F] mb-2">
            Size your quote
          </h1>
          <p className="text-base text-[#5A6575] m-0">
            You picked <span className="text-[#D96626] font-semibold">{selectedPackage.name}</span>. Tell us how many
            of each, and watch your price update live.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-7 items-start pb-16">
          {/* Left: sizing + add-ons */}
          <div className="flex flex-col gap-6 min-w-0">
            {/* Service Details */}
            <div className="bg-white border border-[#E9E7E2] rounded-2xl p-[30px] shadow-[0_1px_2px_rgba(22,36,63,0.04)]">
              <h2 className="font-heading font-bold text-xl text-[#16243F] mb-1">Service Details</h2>
              <p className="text-sm text-[#6B7686] mb-6">
                Tell us how many of each user type and how many sites we'll cover. At least one of these is required.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-[18px]">
                <SizingField id="userCount" label="Desktop Users" info={SIZING_INFO.desktop} value={userCount} onChange={setUserCount} placeholder="e.g., 10" helper="Full Microsoft 365 — primary office staff." highlighted={userCountHighlighted} invalid={showSizingError} />
                <SizingField id="webUserCount" label="Web Users" info={SIZING_INFO.web} value={webUserCount} onChange={setWebUserCount} placeholder="e.g., 5" helper="Web & email only — frontline or kiosk users." highlighted={webUserCountHighlighted} invalid={showSizingError} />
                <SizingField id="locationCount" label="Locations" info={SIZING_INFO.location} value={locationCount} onChange={setLocationCount} placeholder="e.g., 1" helper="Sites with networking gear to manage. 0 if none." highlighted={locationCountHighlighted} invalid={showSizingError} />
              </div>

              {showSizingError && (
                <div className="mt-4 flex items-center gap-2 text-[13.5px] text-[#C6402B]">
                  <span className="font-bold">!</span>
                  <span>Enter at least one Desktop User, Web User, or Location to continue.</span>
                </div>
              )}
            </div>

            {/* Add-ons */}
            {activeAddons.length > 0 && (
              <div className="bg-white border border-[#E9E7E2] rounded-2xl shadow-[0_1px_2px_rgba(22,36,63,0.04)] overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowAddons(!showAddons)}
                  className="w-full flex items-center justify-between gap-3 px-[30px] py-[22px] bg-transparent border-none cursor-pointer text-left"
                >
                  <span>
                    <span className="block font-heading font-bold text-[17px] text-[#16243F]">
                      Want to add premium features?
                    </span>
                    <span className="block text-[13.5px] text-[#6B7686] mt-0.5">
                      Phones, faxing, backups and more. Optional.
                    </span>
                  </span>
                  <span className="text-[#D96626] text-base flex-shrink-0">{showAddons ? '▲' : '▼'}</span>
                </button>
                {showAddons && (
                  <div className="px-[30px] pb-7 pt-1 grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {activeAddons.map((addon) => {
                      const selectedAddon = selectedAddons.find((a) => a.id === addon.id);
                      const isSelected = !!selectedAddon;
                      const quantity = selectedAddon?.quantity || 1;
                      return (
                        <div
                          key={addon.id}
                          onClick={() => toggleAddon(addon)}
                          className="relative rounded-xl p-4 cursor-pointer border-[1.5px] transition-colors"
                          style={{
                            borderColor: isSelected ? '#E9A877' : '#EAE8E2',
                            background: isSelected ? '#FDF1E9' : '#FFFFFF',
                          }}
                        >
                          <div className="flex items-start justify-between gap-2.5">
                            <div className="flex items-start gap-2.5">
                              <span
                                className="w-5 h-5 rounded-[5px] border-[1.5px] text-white text-xs font-bold inline-flex items-center justify-center flex-shrink-0 mt-px"
                                style={{
                                  borderColor: isSelected ? '#D96626' : '#CBD0D8',
                                  background: isSelected ? '#D96626' : '#FFFFFF',
                                }}
                              >
                                {isSelected ? '✓' : ''}
                              </span>
                              <div>
                                <p className="font-heading font-semibold text-[14.5px] text-[#16243F] mb-0.5">{addon.name}</p>
                                <p className="text-[12.5px] leading-[1.45] text-[#6B7686] m-0">{addon.description}</p>
                              </div>
                            </div>
                            <span className="font-heading font-bold text-[13px] text-[#D96626] whitespace-nowrap flex-shrink-0 text-right">
                              {addon.pricingType === 'both' ? (
                                <>
                                  ${addon.recurringPrice}/{addon.recurringFrequency}
                                  <span className="block text-[11px] font-normal text-[#8A94A3]">+ ${addon.setupPrice} setup</span>
                                </>
                              ) : addon.pricingType === 'recurring-only' ? (
                                <>${addon.recurringPrice}/{addon.recurringFrequency}</>
                              ) : (
                                <>${addon.setupPrice} one-time</>
                              )}
                            </span>
                          </div>
                          {isSelected && (
                            <div className="flex items-center gap-2.5 pt-3 mt-3 border-t border-[#F0E4D6]" onClick={(e) => e.stopPropagation()}>
                              <label htmlFor={`quantity-${addon.id}`} className="text-[13px] font-medium text-[#16243F]">
                                Quantity:
                              </label>
                              <input
                                id={`quantity-${addon.id}`}
                                type="number"
                                min="1"
                                max="999"
                                value={quantity}
                                onChange={(e) => updateAddonQuantity(addon.id, parseInt(e.target.value) || 1)}
                                className="w-20 h-8 px-2 rounded-lg border-[1.5px] border-[#DCD9D2] bg-white text-[#16243F] text-sm outline-none focus:border-[#D96626]"
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right: live price */}
          <div className="lg:sticky lg:top-[88px]">
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

      <SiteFooter />
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
    <div className={highlighted ? 'rounded-[10px] ring-2 ring-[#D96626] ring-offset-2 ring-offset-[#FBFAF8] transition-shadow' : ''}>
      <div className="flex items-center gap-2 mb-2 h-5">
        <label htmlFor={id} className="text-[13.5px] font-semibold text-[#16243F]">{label}</label>
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className="text-[#8A94A3] hover:text-[#16243F]" aria-label={`What is a ${label.replace(/s$/, '')}?`}>
              <Info className="w-4 h-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[calc(100vw-2rem)] max-w-sm text-sm space-y-2">
            <p className="font-semibold text-[#16243F]">{info.title}</p>
            <p className="text-[#6B7686]">{info.body}</p>
          </PopoverContent>
        </Popover>
      </div>
      <div className="relative">
        <input
          id={id}
          type="number"
          min="0"
          value={value > 0 ? value : ''}
          onChange={(e) => onChange(Math.max(0, parseInt(e.target.value) || 0))}
          placeholder={placeholder}
          className="w-full h-12 pl-3.5 pr-10 rounded-[10px] border-[1.5px] bg-[#FBFAF8] text-[#16243F] text-[15px] outline-none transition-colors placeholder:text-[#A9B0BC]"
          style={{ borderColor: invalid ? '#E0A99B' : '#DCD9D2' }}
        />
        {value > 0 && <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#D96626] font-bold">✓</span>}
      </div>
      <p className="text-xs leading-[1.4] text-[#8A94A3] mt-2 min-h-[2.1rem]">{helper}</p>
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

// Live cost preview beside the sizing inputs. Mirrors the math in Summary.tsx
// so the number the customer sees here matches checkout.
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
    <div className="bg-white border border-[#E9E7E2] rounded-2xl p-[26px] shadow-[0_8px_24px_-14px_rgba(22,36,63,0.18)]">
      <h2 className="font-heading font-bold text-[17px] text-[#16243F] mb-0.5">Your quote so far</h2>
      <p className="text-[13px] text-[#8A94A3] mb-[18px]">
        {pkg.name} · {formatContractTerm(pkg.agreementMonths)}
      </p>

      {!canContinue ? (
        <p className="text-sm text-[#8A94A3] my-5">Enter your team size to see live pricing.</p>
      ) : (
        <>
          <div className="flex flex-col gap-2.5 text-[13.5px]">
            {userCount > 0 && <Line label={`Desktop · ${userCount} × $${formatAmount(pkg.pricePerUser)}`} value={desktopLine} />}
            {webUserCount > 0 && <Line label={`Web · ${webUserCount} × $${formatAmount(pricePerUserF3)}`} value={webLine} />}
            {locationCount > 0 && <Line label={`Locations · ${locationCount} × $${formatAmount(pkg.pricePerLocation)}`} value={locationLine} />}
            {addonRecurring > 0 && <Line label="Add-ons (recurring)" value={addonRecurring} />}
          </div>

          <div className="mt-4 pt-3.5 border-t border-[#EFEDE8] flex items-center justify-between">
            <span className="text-sm font-semibold text-[#16243F]">Monthly recurring</span>
            <span className="font-heading font-extrabold text-[22px] text-[#D96626]">
              ${formatAmount(monthlyTotal)}
              <span className="text-[13px] font-normal text-[#8A94A3]">/{pkg.frequency}</span>
            </span>
          </div>

          <div className="mt-4 rounded-xl bg-[#FDF1E9] border border-[#F6DCC7] p-3.5 text-[13.5px]">
            <div className="flex items-center justify-between">
              <span className="text-[#6B7686]">Onboarding fee</span>
              <span className={onboarding.waived ? 'line-through text-[#8A94A3]' : 'text-[#16243F]'}>
                ${formatAmount(onboarding.base)}
              </span>
            </div>
            {onboarding.waived && (
              <div className="flex items-center justify-between mt-1.5 text-[#1F8A4C] font-semibold">
                <span>✓ Waived (online signup)</span>
                <span>$0.00</span>
              </div>
            )}
            {addonSetup > 0 && (
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-[#6B7686]">One-time add-on setup</span>
                <span className="text-[#16243F]">${formatAmount(addonSetup)}</span>
              </div>
            )}
          </div>

          <div className="mt-4 pt-3.5 border-t border-[#EFEDE8]">
            <div className="flex items-baseline justify-between">
              <span className="text-[13.5px] text-[#8A94A3]">Due today (est.)</span>
              <span className="font-heading font-extrabold text-2xl text-[#16243F]">${formatAmount(dueToday)}</span>
            </div>
            <p className="text-[11.5px] leading-[1.4] text-[#9AA3B1] mt-1.5">
              First month + onboarding{addonSetup > 0 ? ' + setup' : ''}. Sales tax is applied at invoice time.
            </p>
          </div>
        </>
      )}

      <button
        type="button"
        onClick={onContinue}
        disabled={!canContinue}
        className={[
          'w-full h-[50px] mt-5 rounded-[11px] font-heading font-semibold text-[15px] transition-colors',
          canContinue ? 'bg-[#D96626] text-white hover:bg-[#C25A20] cursor-pointer' : 'bg-[#E7E4DE] text-white cursor-not-allowed',
        ].join(' ')}
      >
        Continue to Contact Info →
      </button>
    </div>
  );
}

function Line({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[#6B7686]">{label}</span>
      <span className="text-[#16243F]">${formatAmount(value)}</span>
    </div>
  );
}

export default QuoteInfo;
