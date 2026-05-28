import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuote, computeOnboardingFee } from "@/contexts/QuoteContext";
import { useChatField } from "@/contexts/AiChatContext";
import { quoteApi } from "@/services/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Mail, CreditCard, CalendarCheck, ChevronDown, ChevronUp, ArrowLeft, AlertCircle, X, Pencil, Type as TypeIcon } from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/SiteHeader";
import { SendQuoteDialog } from "@/components/SendQuoteDialog";
import { SignaturePad } from "@/components/SignaturePad";
import { formatAmount, formatContractTerm } from "@/lib/utils";
import { IS_LEAD_GEN_MODE } from "@/lib/lead-gen";

const generateQuoteNumber = (type: "quote" | "order") => {
  const prefix = type === "quote" ? "QT" : "OR";
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, "");
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${dateStr}-${randomSuffix}`;
};

const Summary = () => {
  const navigate = useNavigate();
  const {
    customerInfo,
    selectedPackage,
    selectedAddons,
    addons,
    promoCodes,
    appliedPromoCodes,
    setAppliedPromoCodes,
    termsContent,
  } = useQuote();
  const [expandedFeatures, setExpandedFeatures] = useState(false);
  const [loading, setLoading] = useState<"email" | "purchase" | "followup" | null>(null);
  const [promoInput, setPromoInput] = useState("");
  // Let the AI agent prefill the promo input (the agent does NOT auto-apply
  // the code — the user still has to click the Apply button).
  const setPromoFromAgent = useCallback((v: string) => setPromoInput(v.toUpperCase().trim()), []);
  const promoHighlighted = useChatField("promo-code", "Promo code", setPromoFromAgent);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [signature, setSignature] = useState("");
  const [userIpAddress, setUserIpAddress] = useState("");
  const [createdQuote, setCreatedQuote] = useState<{ quoteNumber: string } | null>(null);
  // Signature mode: "typed" (existing digital signature) or "drawn"
  // (handwritten via SignaturePad). Either is valid; drawn additionally
  // requires a typed legal name for audit metadata.
  const [signatureMode, setSignatureMode] = useState<"typed" | "drawn">("typed");
  const [drawnSignature, setDrawnSignature] = useState<string>("");
  const [signaturePadOpen, setSignaturePadOpen] = useState(false);

  // Fetch user's IP address
  useEffect(() => {
    fetch("https://api.ipify.org?format=json")
      .then((res) => res.json())
      .then((data) => setUserIpAddress(data.ip))
      .catch((err) => console.error("Failed to fetch IP:", err));
  }, []);

  // Auto-create quote as draft on page load to capture tire kickers
  useEffect(() => {
    if (createdQuote || !selectedPackage) return;

    const createDraftQuote = async () => {
      try {
        const result = await quoteApi.create({
          customer: {
            ...customerInfo,
            referrerCode: customerInfo.referrerCode || null,
          },
          selectedPackage: {
            id: selectedPackage.id,
            name: selectedPackage.name,
            pricePerUser: selectedPackage.pricePerUser,
            pricePerUserF3: selectedPackage.pricePerUserF3 ?? 0,
            pricePerLocation: selectedPackage.pricePerLocation,
            frequency: selectedPackage.frequency,
            features: selectedPackage.features,
            featureGroups: selectedPackage.featureGroups ?? [],
            agreementMonths: selectedPackage.agreementMonths ?? 0,
            calculatedPrice:
              selectedPackage.pricePerUser * customerInfo.userCount +
              (selectedPackage.pricePerUserF3 ?? 0) * (customerInfo.webUserCount ?? 0) +
              selectedPackage.pricePerLocation * customerInfo.locationCount,
          },
          selectedAddons: selectedAddons.map((addon) => ({
            id: addon.id, name: addon.name, description: addon.description,
            price: addon.price, quantity: addon.quantity, frequency: addon.frequency,
            totalPrice: addon.price * addon.quantity, pricingType: addon.pricingType,
            recurringPrice: addon.recurringPrice || null, recurringFrequency: addon.recurringFrequency || null,
            setupPrice: addon.setupPrice || null,
            totalRecurringCost: addon.recurringPrice ? addon.recurringPrice * addon.quantity : 0,
            totalSetupCost: addon.setupPrice ? addon.setupPrice * addon.quantity : 0,
          })),
          onboarding: (() => {
            const r = computeOnboardingFee(
              selectedPackage as any,
              customerInfo.userCount,
              customerInfo.locationCount,
              { waive: !IS_LEAD_GEN_MODE, webUserCount: customerInfo.webUserCount ?? 0 },
            );
            return {
              userCount: customerInfo.userCount,
              costPerUser: customerInfo.userCount > 0 ? r.base / customerInfo.userCount : 0,
              totalCost: r.base,
              discount: r.waived ? r.base : 0,
              finalCost: r.final,
            };
          })(),
          appliedPromoCodes: [],
          totals: {
            onboardingCost: computeOnboardingFee(
              selectedPackage as any,
              customerInfo.userCount,
              customerInfo.locationCount,
              { waive: !IS_LEAD_GEN_MODE, webUserCount: customerInfo.webUserCount ?? 0 },
            ).final,
            oneTimeCosts: 0,
            recurringCosts:
              selectedPackage.pricePerUser * customerInfo.userCount +
              (selectedPackage.pricePerUserF3 ?? 0) * (customerInfo.webUserCount ?? 0) +
              selectedPackage.pricePerLocation * customerInfo.locationCount,
            discount: 0, grandTotal: 0, recurringFrequency: selectedPackage.frequency,
          },
          terms: { version: termsContent.version, id: termsContent.id, url: `${window.location.origin}/terms`, content: termsContent.content },
        });
        setCreatedQuote(result);
      } catch (err) {
        console.error("Auto-create quote error:", err);
      }
    };

    createDraftQuote();
  }, []);

  // Validate addon data integrity
  useEffect(() => {
    let hasInvalidData = false;

    selectedAddons.forEach(addon => {
      // Check for missing pricing data
      if (!addon.recurringPrice && !addon.setupPrice) {
        console.error('❌ Invalid addon detected (no pricing):', addon);
        hasInvalidData = true;
      }
      
      // Check for invalid quantity
      if (addon.quantity < 1 || !Number.isInteger(addon.quantity)) {
        console.error('❌ Invalid quantity detected:', addon.name, 'quantity:', addon.quantity);
        hasInvalidData = true;
      }

      // Check pricing type consistency
      if (addon.pricingType === 'both' && (!addon.recurringPrice || !addon.setupPrice)) {
        console.error('❌ Invalid both-pricing addon:', addon);
        hasInvalidData = true;
      }
      if (addon.pricingType === 'recurring-only' && !addon.recurringPrice) {
        console.error('❌ Invalid recurring-only addon:', addon);
        hasInvalidData = true;
      }
      if (addon.pricingType === 'one-time-only' && !addon.setupPrice) {
        console.error('❌ Invalid one-time-only addon:', addon);
        hasInvalidData = true;
      }
    });

    if (hasInvalidData) {
      console.warn('⚠️ Invalid addon data detected. User should refresh the quote.');
      toast.error('Some add-ons have invalid data. Please go back and reconfigure your quote.');
    }
  }, [selectedAddons]);

  // Redirect if no package selected
  if (!selectedPackage) {
    navigate("/quote-builder");
    return null;
  }

  // Calculate package cost — splits per-user into Desktop (Business Premium)
  // and Web (F3) tiers. Existing quotes pre-2026 had webUserCount=undefined,
  // which evaluates to 0 and falls back to the desktop-only math.
  const webUserCount = customerInfo.webUserCount ?? 0;
  const packageCost = selectedPackage
    ? selectedPackage.pricePerUser * customerInfo.userCount +
      (selectedPackage.pricePerUserF3 ?? 0) * webUserCount +
      selectedPackage.pricePerLocation * customerInfo.locationCount
    : 0;

  // Onboarding fee: 2x monthly recurring (per-user × users + per-location × locations).
  // Auto-waived for 36-month plans signed online (per ntm onboarding-fee policy).
  const onboardingResult = selectedPackage
    ? computeOnboardingFee(
        selectedPackage as any,
        customerInfo.userCount,
        customerInfo.locationCount,
        { waive: !IS_LEAD_GEN_MODE, webUserCount },
      )
    : { base: 0, waived: false, final: 0 };
  const onboardingCost = onboardingResult.final;
  const onboardingWaived = onboardingResult.waived;

  // Calculate one-time costs: setup fees from addons
  const addonSetupCosts = selectedAddons
    .filter(addon => addon.pricingType === 'one-time-only' || addon.pricingType === 'both')
    .reduce((sum, addon) => sum + (addon.setupPrice || 0) * addon.quantity, 0);

  // One-time costs: only use new dual-pricing calculation
  const oneTimeCosts = addonSetupCosts;

  // Calculate recurring costs: package + recurring addon fees
  const addonRecurringCosts = selectedAddons
    .filter(addon => addon.pricingType === 'recurring-only' || addon.pricingType === 'both')
    .reduce((sum, addon) => sum + (addon.recurringPrice || 0) * addon.quantity, 0);

  // Recurring costs: package + new dual-pricing calculation only
  const recurringCosts = packageCost + addonRecurringCosts;

  // Calculate promo code discounts
  let oneTimeDiscount = 0;
  let recurringDiscount = 0;
  let onboardingDiscount = 0;

  appliedPromoCodes.forEach((promo) => {
    if (promo.discountType === "percentage") {
      if (promo.applyTo === "onboarding") {
        onboardingDiscount += onboardingCost * (promo.discount / 100);
      } else if (promo.applyTo === "one-time") {
        oneTimeDiscount += oneTimeCosts * (promo.discount / 100);
      } else if (promo.applyTo === "monthly") {
        recurringDiscount += recurringCosts * (promo.discount / 100);
      }
    } else {
      // Fixed discount
      if (promo.applyTo === "onboarding") {
        onboardingDiscount += Math.min(promo.discount, onboardingCost - onboardingDiscount);
      } else if (promo.applyTo === "one-time") {
        oneTimeDiscount += Math.min(promo.discount, oneTimeCosts - oneTimeDiscount);
      } else if (promo.applyTo === "monthly") {
        recurringDiscount += Math.min(promo.discount, recurringCosts - recurringDiscount);
      }
    }
  });

  const totalDiscount = oneTimeDiscount + recurringDiscount + onboardingDiscount;
  const finalOnboardingCost = onboardingCost - onboardingDiscount;
  const finalOneTimeCosts = oneTimeCosts - oneTimeDiscount;
  const finalRecurringCosts = recurringCosts - recurringDiscount;
  const grandTotal = finalOnboardingCost + finalOneTimeCosts + finalRecurringCosts;

  const handleApplyPromo = () => {
    const promo = promoCodes.find((p) => p.code.toUpperCase() === promoInput.toUpperCase() && p.active);

    if (!promo) {
      toast.error("Invalid or inactive promo code");
      return;
    }

    // Check if already applied
    if (appliedPromoCodes.some((p) => p.code === promo.code)) {
      toast.error("Promo code already applied");
      return;
    }

    setAppliedPromoCodes([...appliedPromoCodes, promo]);
    setPromoInput("");
    toast.success(`Promo code "${promo.code}" applied!`);
  };

  const handleRemovePromo = (code: string) => {
    setAppliedPromoCodes(appliedPromoCodes.filter((p) => p.code !== code));
    toast.success("Promo code removed");
  };

  // Create quote once on the server, reuse for email/purchase
  const getOrCreateQuote = async () => {
    if (createdQuote) return createdQuote;

    const quotePayload = {
      customer: {
        ...customerInfo,
        userCount: customerInfo.userCount,
        locationCount: customerInfo.locationCount,
        referrerCode: customerInfo.referrerCode || null,
      },
      selectedPackage: {
        id: selectedPackage.id,
        name: selectedPackage.name,
        pricePerUser: selectedPackage.pricePerUser,
        pricePerUserF3: selectedPackage.pricePerUserF3 ?? 0,
        pricePerLocation: selectedPackage.pricePerLocation,
        frequency: selectedPackage.frequency,
        features: selectedPackage.features,
        agreementMonths: selectedPackage.agreementMonths ?? 0,
        calculatedPrice: packageCost,
      },
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
      onboarding: {
        userCount: customerInfo.userCount,
        costPerUser: customerInfo.userCount > 0 ? onboardingResult.base / customerInfo.userCount : 0,
        totalCost: onboardingResult.base,
        discount: onboardingResult.waived ? onboardingResult.base : onboardingDiscount,
        finalCost: finalOnboardingCost,
      },
      appliedPromoCodes: appliedPromoCodes.map((promo) => ({
        code: promo.code,
        discount: promo.discount,
        discountType: promo.discountType,
        applyTo: promo.applyTo,
      })),
      totals: {
        onboardingCost: finalOnboardingCost,
        oneTimeCosts: finalOneTimeCosts,
        recurringCosts: finalRecurringCosts,
        discount: totalDiscount,
        grandTotal,
        recurringFrequency: selectedPackage.frequency,
      },
      terms: {
        version: termsContent.version,
        id: termsContent.id,
        url: `${window.location.origin}/terms`,
        content: termsContent.content,
      },
    };

    const result = await quoteApi.create(quotePayload);
    setCreatedQuote(result);
    return result;
  };

  // Track the created quote + open the send-quote dialog when the customer
  // clicks "Email Me Quote". The dialog handles the actual send so the
  // customer can optionally CC their team or NTM rep.
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailDialogQuoteNumber, setEmailDialogQuoteNumber] = useState<string | null>(null);

  const handleEmailQuote = async () => {
    setLoading("email");
    try {
      const quote = await getOrCreateQuote();
      setEmailDialogQuoteNumber(quote.quoteNumber);
      setEmailDialogOpen(true);
    } catch (error) {
      console.error("Email quote error:", error);
      toast.error("Failed to prepare quote. Please try again.");
    } finally {
      setLoading(null);
    }
  };

  // Lite quoting tool: applies the quote-tool-lite-submitted GHL tag and
  // returns a calendar booking URL. No payment, no contract, no signature.
  const handleRequestFollowup = async () => {
    setLoading("followup");
    try {
      const quote = await getOrCreateQuote();
      const { bookingUrl } = await quoteApi.requestFollowup(quote.quoteNumber);
      toast.success("Submitted! Pick a time with a sales rep next.");
      window.location.href = bookingUrl;
    } catch (error) {
      console.error("Request follow-up error:", error);
      toast.error("Could not submit your request. Please try again.");
      setLoading(null);
    }
  };

  const handlePurchase = async () => {
    // Validate customer information
    if (
      !customerInfo.name ||
      !customerInfo.email ||
      !customerInfo.phone ||
      !customerInfo.businessName ||
      !customerInfo.address
    ) {
      toast.error("Please complete all required customer information");
      return;
    }

    // Validate package selection
    if (!selectedPackage) {
      toast.error("Please select a package");
      return;
    }

    // Validate agreement
    if (!agreedToTerms) {
      toast.error("Please agree to the Terms and Conditions");
      return;
    }

    if (!signature || signature.trim().length < 3) {
      toast.error("Please provide your full name as a signature");
      return;
    }

    if (signatureMode === "drawn" && !drawnSignature) {
      toast.error("Please draw your signature before continuing");
      return;
    }

    // VALIDATE ADDON DATA INTEGRITY before sending to webhook
    const invalidAddons = selectedAddons.filter(addon => {
      // Check for missing pricing
      if (addon.pricingType === 'both' && (!addon.recurringPrice || !addon.setupPrice)) {
        console.error('❌ Invalid dual-pricing addon:', addon);
        return true;
      }
      if (addon.pricingType === 'recurring-only' && !addon.recurringPrice) {
        console.error('❌ Invalid recurring-only addon:', addon);
        return true;
      }
      if (addon.pricingType === 'one-time-only' && !addon.setupPrice) {
        console.error('❌ Invalid one-time-only addon:', addon);
        return true;
      }
      // Check for invalid quantity
      if (addon.quantity < 1 || !Number.isInteger(addon.quantity)) {
        console.error('❌ Invalid quantity for addon:', addon.name, 'quantity:', addon.quantity);
        return true;
      }
      return false;
    });

    if (invalidAddons.length > 0) {
      toast.error('Some add-ons have invalid data. Please go back and reconfigure your quote.');
      console.error('❌ Invalid addons detected:', invalidAddons);
      return;
    }

    setLoading("purchase");

    try {
      const quote = await getOrCreateQuote();
      const orderNumber = generateQuoteNumber("order");

      const checkoutData = await quoteApi.checkout(quote.quoteNumber, {
        agreement: {
          signedBy: signature.trim(),
          email: customerInfo.email,
          agreedToTerms: true,
          termsVersion: termsContent.version,
          termsId: termsContent.id,
          termsUrl: `${window.location.origin}/terms`,
          termsContent: termsContent.content,
          signedAt: new Date().toISOString(),
          ipAddress: userIpAddress,
          userAgent: navigator.userAgent,
          // Only attach the rasterized signature if the customer drew one.
          // Typed mode leaves this off and the contract PDF falls back to
          // the cursive typed name.
          ...(signatureMode === "drawn" && drawnSignature
            ? { signatureImage: drawnSignature }
            : {}),
        },
        orderNumber,
      });

      if (checkoutData.paymentLink) {
        window.location.href = checkoutData.paymentLink;
      } else {
        throw new Error("No payment link received");
      }
    } catch (error) {
      console.error("Payment initiation error:", error);
      toast.error("Unable to process payment. Please try again or contact support.");
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      {emailDialogQuoteNumber && (
        <SendQuoteDialog
          open={emailDialogOpen}
          onOpenChange={setEmailDialogOpen}
          quoteNumber={emailDialogQuoteNumber}
          customerEmail={customerInfo.email}
          variant="customer"
        />
      )}

      <SignaturePad
        open={signaturePadOpen}
        onOpenChange={setSignaturePadOpen}
        typedName={signature.trim() || undefined}
        onConfirm={(dataUrl) => setDrawnSignature(dataUrl)}
      />
      <div className="max-w-6xl mx-auto py-12 px-4">
        {/* Back button */}
        <Button variant="ghost" onClick={() => navigate("/quote-builder")} className="mb-6">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Quote Builder
        </Button>

        {/* Header */}
        <div className="text-center mb-8 animate-fade-in">
          <h1 className="text-4xl font-bold text-foreground mb-2">Your Quote Summary</h1>
          <p className="text-muted-foreground">Review your selection and complete your order</p>
        </div>

        {/* Quote Number Display */}
        <Card className="p-4 mb-6 bg-primary/5 border-primary/20 animate-fade-in">
          <div>
            <p className="text-sm text-muted-foreground">Quote Number</p>
            <p className="text-2xl font-bold text-primary font-mono">
              {createdQuote ? createdQuote.quoteNumber : 'Generating...'}
            </p>
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Order Summary */}
          <div className="lg:col-span-2 space-y-6">
            {/* Customer Information */}
            <Card className="p-6 shadow-card animate-slide-up">
              <div className="flex items-start justify-between mb-4">
                <h2 className="text-xl font-semibold text-foreground">Customer Information</h2>
                <Button variant="link" size="sm" onClick={() => navigate("/quote-builder")} className="text-primary">
                  Edit
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Name</p>
                  <p className="font-medium text-foreground">{customerInfo.name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Business</p>
                  <p className="font-medium text-foreground">{customerInfo.businessName}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Email</p>
                  <p className="font-medium text-foreground">{customerInfo.email}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Phone</p>
                  <p className="font-medium text-foreground">{customerInfo.phone}</p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-muted-foreground">Address</p>
                  <p className="font-medium text-foreground">{customerInfo.address}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Desktop Users</p>
                  <p className="font-medium text-foreground">{customerInfo.userCount}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Web Users</p>
                  <p className="font-medium text-foreground">{customerInfo.webUserCount ?? 0}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Locations</p>
                  <p className="font-medium text-foreground">{customerInfo.locationCount}</p>
                </div>
                {customerInfo.referrerCode && (
                  <div className="md:col-span-2">
                    <p className="text-muted-foreground">Referrer Code</p>
                    <Badge variant="secondary" className="mt-1 font-mono">
                      {customerInfo.referrerCode.toUpperCase()}
                    </Badge>
                  </div>
                )}
              </div>
            </Card>

            {/* Selected Package */}
            <Card className="p-6 shadow-card animate-slide-up" style={{ animationDelay: "0.1s" }}>
              <h2 className="text-xl font-semibold mb-4 text-foreground">Selected Package</h2>
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg text-foreground">{selectedPackage.name}</h3>
                    <div className="text-sm text-muted-foreground space-y-1 mt-1">
                      <p>
                        ${selectedPackage.pricePerUser}/desktop user × {customerInfo.userCount} = $
                        {formatAmount(selectedPackage.pricePerUser * customerInfo.userCount)}
                      </p>
                      {(customerInfo.webUserCount ?? 0) > 0 && (
                        <p>
                          ${selectedPackage.pricePerUserF3 ?? 0}/web user ×{' '}
                          {customerInfo.webUserCount ?? 0} = $
                          {formatAmount(
                            (selectedPackage.pricePerUserF3 ?? 0) *
                              (customerInfo.webUserCount ?? 0),
                          )}
                        </p>
                      )}
                      <p>
                        ${selectedPackage.pricePerLocation}/location × {customerInfo.locationCount} = $
                        {formatAmount(selectedPackage.pricePerLocation * customerInfo.locationCount)}
                      </p>
                      <p className="font-semibold text-primary">
                        Package Total: ${formatAmount(packageCost)}/{selectedPackage.frequency}
                      </p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setExpandedFeatures(!expandedFeatures)}>
                    {expandedFeatures ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </Button>
                </div>

                {expandedFeatures && (
                  <div className="pt-2 border-t space-y-3">
                    {((selectedPackage.featureGroups?.length ?? 0) > 0
                      ? selectedPackage.featureGroups!
                      : [{ category: 'Includes', items: selectedPackage.features }]
                    ).map((group, gi) => (
                      <div key={gi}>
                        <p className="text-xs font-semibold uppercase tracking-wider text-primary mb-1">
                          {group.category}
                        </p>
                        <ul className="space-y-1.5">
                          {group.items.map((item, i) => (
                            <li
                              key={i}
                              className="text-sm text-foreground flex items-center gap-2"
                            >
                              <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>

            {/* Selected Add-ons */}
            <Card className="p-6 shadow-card animate-slide-up" style={{ animationDelay: "0.2s" }}>
              <h2 className="text-xl font-semibold mb-4 text-foreground">Selected Add-Ons</h2>
              {selectedAddons.length === 0 ? (
                <p className="text-muted-foreground">No add-ons selected</p>
              ) : (
                <ul className="space-y-3">
                  {selectedAddons.map((addon) => (
                    <li key={addon.id} className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-medium text-foreground">
                          {addon.name}
                          {addon.quantity > 1 && (
                            <span className="text-sm text-muted-foreground ml-2">× {addon.quantity}</span>
                          )}
                        </p>
                        <p className="text-sm text-muted-foreground">{addon.description}</p>
                      </div>
                      <div className="text-right space-y-1">
                        {addon.pricingType === 'both' ? (
                          <>
                            <p className="font-medium text-primary">
                              ${formatAmount((addon.recurringPrice || 0) * addon.quantity)}/{addon.recurringFrequency || 'monthly'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              + ${formatAmount((addon.setupPrice || 0) * addon.quantity)} one-time setup
                            </p>
                          </>
                        ) : addon.pricingType === 'recurring-only' ? (
                          <p className="font-medium text-primary">
                            ${formatAmount((addon.recurringPrice || 0) * addon.quantity)}/{addon.recurringFrequency || 'monthly'}
                          </p>
                        ) : (
                          <p className="font-medium text-primary">
                            ${formatAmount((addon.setupPrice || 0) * addon.quantity)} one-time
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* Legal Disclaimer */}
            <Card
              className="p-6 shadow-card animate-slide-up bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900"
              style={{ animationDelay: "0.25s" }}
            >
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-500 flex-shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <h3 className="font-semibold text-foreground text-sm">Important Disclaimer</h3>
                  <ul className="text-xs text-muted-foreground space-y-1.5 leading-relaxed">
                    <li>• This order is subject to {selectedPackage?.agreementMonths && selectedPackage.agreementMonths > 0
                      ? `a ${formatContractTerm(selectedPackage.agreementMonths).toLowerCase()}`
                      : 'a month-to-month agreement'} unless otherwise specified.</li>
                    <li>
                      • We reserve the right to cancel or modify this quote if any information provided is found to be
                      incorrect or incomplete.
                    </li>
                    <li>
                      • Sales tax will be calculated and applied at the time of invoice generation based on your
                      business location.
                    </li>
                    <li>• This quote is valid for 30 days from the date of generation.</li>
                    <li>• All prices are subject to change without notice.</li>
                    <li>
                      • By proceeding with this purchase, you acknowledge that you have read and agree to these terms.
                    </li>
                  </ul>
                </div>
              </div>
            </Card>

            {/* Agreement Section — full quote flow only; lite mode has no
                contract to sign. */}
            {!IS_LEAD_GEN_MODE && (
            <Card className="p-6 shadow-card animate-slide-up bg-white dark:bg-card" style={{ animationDelay: "0.3s" }}>
              <h2 className="text-xl font-semibold mb-4 text-foreground">Agreement</h2>

              <div className="space-y-4">
                {/* Terms & Conditions Checkbox */}
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="terms"
                    checked={agreedToTerms}
                    onCheckedChange={(checked) => setAgreedToTerms(checked === true)}
                    className="mt-1"
                  />
                  <Label htmlFor="terms" className="text-sm leading-relaxed cursor-pointer">
                    I agree to the{" "}
                    <a
                      href="/terms"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline font-medium"
                    >
                      Terms and Conditions
                    </a>{" "}
                    {selectedPackage?.agreementMonths && selectedPackage.agreementMonths > 0
                      ? `and acknowledge that this is a ${formatContractTerm(selectedPackage.agreementMonths).toLowerCase()}.`
                      : 'and acknowledge this is a month-to-month service agreement.'}
                  </Label>
                </div>

                {/* Signature Field — typed legal name is always required
                    for the audit trail. Drawn signature is optional and
                    overrides the cursive rendering in the contract PDF. */}
                <div className="space-y-2">
                  <Label htmlFor="signature" className="text-sm font-medium">
                    Electronic Signature
                  </Label>
                  <Input
                    id="signature"
                    type="text"
                    placeholder="Type your full name to sign"
                    value={signature}
                    onChange={(e) => setSignature(e.target.value)}
                    className="font-serif text-lg"
                  />
                  <p className="text-xs text-muted-foreground">
                    By typing your name, you are providing an electronic signature that is legally binding.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Signature Style</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={signatureMode === "typed" ? "default" : "outline"}
                      onClick={() => setSignatureMode("typed")}
                      className="justify-start"
                    >
                      <TypeIcon className="w-4 h-4 mr-2" />
                      Digital (typed)
                    </Button>
                    <Button
                      type="button"
                      variant={signatureMode === "drawn" ? "default" : "outline"}
                      onClick={() => setSignatureMode("drawn")}
                      className="justify-start"
                    >
                      <Pencil className="w-4 h-4 mr-2" />
                      Draw with mouse
                    </Button>
                  </div>

                  {signatureMode === "drawn" && (
                    <div className="mt-2 rounded-md border p-3 bg-muted/30">
                      {drawnSignature ? (
                        <div className="space-y-2">
                          <div className="rounded-sm border bg-white p-2 flex items-center justify-center">
                            <img
                              src={drawnSignature}
                              alt="Your drawn signature"
                              className="max-h-24 max-w-full object-contain"
                            />
                          </div>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setSignaturePadOpen(true)}
                            >
                              <Pencil className="w-4 h-4 mr-2" />
                              Redo signature
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setDrawnSignature("")}
                            >
                              Clear
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => setSignaturePadOpen(true)}
                          className="w-full"
                        >
                          <Pencil className="w-4 h-4 mr-2" />
                          Click to draw your signature
                        </Button>
                      )}
                      <p className="text-xs text-muted-foreground mt-2">
                        Opens a signature pad. Click once to start, move your
                        mouse to draw, click again to end the stroke.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </Card>
            )}
          </div>

          {/* Right: Cost Breakdown */}
          <div className="space-y-6">
            <Card className="p-6 shadow-card sticky top-6 animate-slide-up" style={{ animationDelay: "0.3s" }}>
              <h2 className="text-xl font-semibold mb-6 text-foreground">Cost Breakdown</h2>

              {/* Promo Code Section */}
              <div className="mb-6 space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="promo-code" className="text-sm">
                    Promo Code
                  </Label>
                  <div className={`flex gap-2 ${promoHighlighted ? 'rounded-md ring-2 ring-primary ring-offset-2 ring-offset-background transition-shadow' : ''}`}>
                    <Input
                      id="promo-code"
                      placeholder="Enter code"
                      value={promoInput}
                      onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                      onKeyDown={(e) => e.key === "Enter" && handleApplyPromo()}
                      className="flex-1"
                    />
                    <Button variant="secondary" onClick={handleApplyPromo} disabled={!promoInput.trim()}>
                      Apply
                    </Button>
                  </div>
                </div>

                {/* Applied Promo Codes List */}
                {appliedPromoCodes.length > 0 && (
                  <div className="space-y-2">
                    {appliedPromoCodes.map((promo) => (
                      <div
                        key={promo.id}
                        className="p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-green-700 dark:text-green-400">{promo.code}</span>
                          <span className="text-xs text-muted-foreground">
                            ({promo.discountType === "percentage" ? `${promo.discount}%` : `$${promo.discount}`} off{" "}
                            {promo.applyTo})
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemovePromo(promo.code)}
                          className="h-auto p-1"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Separator className="mb-4" />

              <div className="space-y-4">
                {/* Onboarding Cost */}
                <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm text-muted-foreground">Onboarding Fee</p>
                    <p className={`text-sm ${onboardingWaived ? 'line-through text-muted-foreground' : 'text-muted-foreground'}`}>
                      ${formatAmount(onboardingResult.base)}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    2× monthly recurring (${formatAmount(onboardingResult.base / 2)}/mo × 2)
                  </p>
                  {onboardingWaived && (
                    <div className="mt-2 pt-2 border-t border-green-200">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-green-700 dark:text-green-400">
                          ✓ Waived (online portal signup)
                        </p>
                        <p className="text-lg font-bold text-green-700 dark:text-green-400">$0.00</p>
                      </div>
                    </div>
                  )}
                  {!onboardingWaived && onboardingDiscount > 0 && (
                    <div className="mt-2 pt-2 border-t border-primary/20">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-green-600 dark:text-green-400">Discount Applied</p>
                        <p className="text-xs font-semibold text-green-600 dark:text-green-400">
                          -${formatAmount(onboardingDiscount)}
                        </p>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <p className="text-sm font-semibold text-primary">Final Onboarding Cost</p>
                        <p className="text-lg font-bold text-primary">${formatAmount(finalOnboardingCost)}</p>
                      </div>
                    </div>
                  )}
                  {!onboardingWaived && onboardingDiscount === 0 && (
                    <p className="text-lg font-bold text-primary mt-1">${formatAmount(onboardingCost)}</p>
                  )}
                </div>

                <div className="p-4 rounded-lg bg-secondary/10 border border-secondary/20">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm text-muted-foreground">One-Time Add-ons</p>
                    <p className="text-sm text-muted-foreground">${formatAmount(oneTimeCosts)}</p>
                  </div>
                  {selectedAddons.filter(a => a.pricingType === 'one-time-only' || a.pricingType === 'both').length > 0 && (
                    <div className="text-xs text-muted-foreground mb-1">
                      {selectedAddons
                        .filter(a => a.pricingType === 'one-time-only' || a.pricingType === 'both')
                        .map(a => `${a.name}: $${formatAmount((a.setupPrice || 0) * a.quantity)}`)
                        .join(', ')}
                    </div>
                  )}
                  {oneTimeDiscount > 0 && (
                    <div className="mt-2 pt-2 border-t border-secondary/20">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-green-600 dark:text-green-400">Discount Applied</p>
                        <p className="text-xs font-semibold text-green-600 dark:text-green-400">
                          -${formatAmount(oneTimeDiscount)}
                        </p>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <p className="text-sm font-semibold text-secondary">Final One-Time Cost</p>
                        <p className="text-lg font-bold text-secondary">${formatAmount(finalOneTimeCosts)}</p>
                      </div>
                    </div>
                  )}
                  {oneTimeDiscount === 0 && (
                    <p className="text-lg font-bold text-secondary mt-1">${formatAmount(oneTimeCosts)}</p>
                  )}
                </div>

                <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm text-muted-foreground">Monthly Recurring</p>
                    <p className="text-sm text-muted-foreground">${formatAmount(recurringCosts)}/month</p>
                  </div>
                  {recurringDiscount > 0 && (
                    <div className="mt-2 pt-2 border-t border-primary/20">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-green-600 dark:text-green-400">Discount Applied</p>
                        <p className="text-xs font-semibold text-green-600 dark:text-green-400">
                          -${formatAmount(recurringDiscount)}
                        </p>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <p className="text-sm font-semibold text-primary">Final Cost</p>
                        <p className="text-lg font-bold text-primary">${formatAmount(finalRecurringCosts)}/month</p>
                      </div>
                    </div>
                  )}
                  {recurringDiscount === 0 && (
                    <p className="text-lg font-bold text-primary mt-1">${formatAmount(recurringCosts)}/month</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
                    Invoices are sent on the <strong>1st of every month</strong> and are due
                    within <strong>30 days</strong> (Net 30). Your first month is paid at
                    checkout; recurring billing starts on the 1st of next month.
                  </p>
                </div>

                {appliedPromoCodes.length > 0 && totalDiscount > 0 && (
                  <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900">
                    <p className="text-sm text-muted-foreground mb-2">Total Savings</p>
                    <div className="space-y-1.5">
                      {onboardingDiscount > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-green-700 dark:text-green-400">Onboarding savings</span>
                          <span className="font-semibold text-green-700 dark:text-green-400">-${formatAmount(onboardingDiscount)}</span>
                        </div>
                      )}
                      {oneTimeDiscount > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-green-700 dark:text-green-400">One-time savings</span>
                          <span className="font-semibold text-green-700 dark:text-green-400">-${formatAmount(oneTimeDiscount)}</span>
                        </div>
                      )}
                      {recurringDiscount > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-green-700 dark:text-green-400">Monthly savings (ongoing)</span>
                          <span className="font-semibold text-green-700 dark:text-green-400">-${formatAmount(recurringDiscount)}/mo</span>
                        </div>
                      )}
                      <div className="pt-1.5 border-t border-green-200 dark:border-green-800 flex justify-between">
                        <span className="text-sm font-medium text-green-800 dark:text-green-300">Total</span>
                        <span className="text-lg font-bold text-green-600 dark:text-green-400">-${formatAmount(totalDiscount)}</span>
                      </div>
                    </div>
                  </div>
                )}

                <Separator />

                <div className="p-4 rounded-lg bg-gradient-card border border-border">
                  <p className="text-sm text-muted-foreground mb-1">Due Today</p>
                  <p className="text-3xl font-bold text-foreground">
                    ${formatAmount(finalOnboardingCost + finalOneTimeCosts + finalRecurringCosts)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {finalOnboardingCost > 0 && `$${formatAmount(finalOnboardingCost)} onboarding + `}
                    {finalOneTimeCosts > 0 && `$${formatAmount(finalOneTimeCosts)} one-time + `}
                    {`$${formatAmount(finalRecurringCosts)} first month`}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {`Then $${formatAmount(finalRecurringCosts)}/month from month 2 onward.`}
                  </p>
                </div>
              </div>

              <div className="mt-6 space-y-3">
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full"
                  onClick={handleEmailQuote}
                  disabled={loading !== null}
                >
                  {loading === "email" ? (
                    "Sending..."
                  ) : (
                    <>
                      <Mail className="w-4 h-4 mr-2" />
                      Email Me Quote
                    </>
                  )}
                </Button>

                {IS_LEAD_GEN_MODE ? (
                  <>
                    <Button
                      size="lg"
                      className="w-full"
                      onClick={handleRequestFollowup}
                      disabled={loading !== null}
                    >
                      {loading === "followup" ? (
                        "Submitting..."
                      ) : (
                        <>
                          <CalendarCheck className="w-4 h-4 mr-2" />
                          Request Follow-up from Sales Rep
                        </>
                      )}
                    </Button>
                    <p className="text-xs text-muted-foreground text-center">
                      A sales rep will follow up. You'll be redirected to pick a time on their calendar.
                    </p>
                  </>
                ) : (
                  <>
                    <Button
                      size="lg"
                      className="w-full"
                      onClick={handlePurchase}
                      disabled={
                        loading !== null ||
                        !agreedToTerms ||
                        !signature ||
                        signature.trim().length < 3 ||
                        (signatureMode === "drawn" && !drawnSignature)
                      }
                    >
                      {loading === "purchase" ? (
                        "Processing..."
                      ) : (
                        <>
                          <CreditCard className="w-4 h-4 mr-2" />
                          Purchase Now
                        </>
                      )}
                    </Button>
                    {(!agreedToTerms || !signature || signature.trim().length < 3) && (
                      <p className="text-xs text-muted-foreground text-center">
                        Please agree to terms and provide your signature to continue
                      </p>
                    )}
                    {agreedToTerms &&
                      signature.trim().length >= 3 &&
                      signatureMode === "drawn" &&
                      !drawnSignature && (
                        <p className="text-xs text-muted-foreground text-center">
                          Please draw your signature to continue
                        </p>
                      )}
                  </>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Summary;
