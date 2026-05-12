import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { quoteApi } from "@/services/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  AlertCircle,
  CreditCard,
  CalendarCheck,
  MapPin,
  Phone,
  Mail,
  Building2,
  Users,
  MapPinned,
  ChevronUp,
  ChevronDown,
  Tag,
  FileText,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { SiteHeader } from "@/components/SiteHeader";
import { formatAmount } from "@/lib/utils";
import { IS_LEAD_GEN_MODE } from "@/lib/lead-gen";

interface QuoteData {
  quoteNumber: string;
  customer: {
    name: string;
    email: string;
    phone: string;
    businessName: string;
    address: string;
    userCount: number;
    webUserCount?: number;
    locationCount: number;
    referrerCode?: string;
  };
  selectedPackage: {
    id: string;
    name: string;
    pricePerUser: number;
    pricePerUserF3?: number;
    pricePerLocation: number;
    frequency: string;
    calculatedPrice: number;
    features?: string[];
    featureGroups?: Array<{ category: string; items: string[] }>;
  };
  selectedAddons: Array<{
    id: string;
    name: string;
    description?: string;
    price: number;
    quantity: number;
    frequency: string;
    totalPrice: number;
    pricingType: 'recurring-only' | 'one-time-only' | 'both';
    recurringPrice?: number;
    recurringFrequency?: string;
    setupPrice?: number;
    totalRecurringCost?: number;
    totalSetupCost?: number;
  }>;
  onboarding: {
    userCount: number;
    costPerUser: number;
    totalCost: number;
    discount: number;
    finalCost: number;
  };
  appliedPromoCodes: Array<{
    code: string;
    discount: number;
    discountType: string;
    applyTo: string;
  }>;
  totals: {
    onboardingCost: number;
    oneTimeCosts: number;
    recurringCosts: number;
    grandTotal: number;
    recurringFrequency: string;
  };
  termsVersion: string;
  termsId: string;
  termsUrl: string;
  termsContent: string;
  notes?: string;
}

const generateOrderNumber = () => {
  const prefix = "OR";
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, "");
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${dateStr}-${randomSuffix}`;
};

const fetchUserIp = async (): Promise<string> => {
  try {
    const res = await fetch("https://api.ipify.org?format=json");
    const data = await res.json();
    return data.ip;
  } catch {
    return "unknown";
  }
};

export default function QuoteReview() {
  const [searchParams] = useSearchParams();
  const quoteId = searchParams.get("id");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [quoteData, setQuoteData] = useState<QuoteData | null>(null);

  const [signature, setSignature] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [expandedFeatures, setExpandedFeatures] = useState(false);
  const [promoInput, setPromoInput] = useState("");
  const [applyingPromo, setApplyingPromo] = useState(false);

  const handleApplyPromo = async () => {
    if (!promoInput.trim() || !quoteData) return;
    setApplyingPromo(true);
    try {
      const updated = await quoteApi.applyPromo(quoteData.quoteNumber, promoInput.trim());
      setQuoteData(updated);
      setPromoInput("");
      toast({ title: "Promo Applied", description: `Code "${promoInput.trim()}" applied successfully!` });
    } catch (err: any) {
      toast({ title: "Invalid Code", description: err.message || "Could not apply promo code.", variant: "destructive" });
    } finally {
      setApplyingPromo(false);
    }
  };

  useEffect(() => {
    if (!quoteId) {
      setError("No quote ID provided in the URL");
      setLoading(false);
      return;
    }

    fetchQuoteData();
  }, [quoteId]);

  const fetchQuoteData = async () => {
    try {
      setLoading(true);
      const data = await quoteApi.get(quoteId!);
      setQuoteData(data);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load quote");
      toast({
        title: "Error",
        description: "Unable to load quote details. Please check the link and try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Lite quoting tool: trade the checkout flow for a calendar booking link.
  const handleRequestFollowup = async () => {
    if (!quoteData) return;
    try {
      setSubmitting(true);
      const { bookingUrl } = await quoteApi.requestFollowup(quoteData.quoteNumber);
      toast({ title: "Submitted", description: "Pick a time with a sales rep next." });
      window.location.href = bookingUrl;
    } catch (err) {
      console.error("Request follow-up error:", err);
      toast({
        title: "Error",
        description: "Could not submit your request. Please try again.",
        variant: "destructive",
      });
      setSubmitting(false);
    }
  };

  const handleAcceptQuote = async () => {
    if (!quoteData) return;

    if (signature.trim().length < 3) {
      toast({
        title: "Invalid Signature",
        description: "Please enter your full legal name (minimum 3 characters)",
        variant: "destructive",
      });
      return;
    }

    if (!agreedToTerms) {
      toast({
        title: "Terms Required",
        description: "You must agree to the terms and conditions to proceed",
        variant: "destructive",
      });
      return;
    }

    try {
      setSubmitting(true);
      const userIpAddress = await fetchUserIp();

      const checkoutPayload = {
        orderNumber: generateOrderNumber(),
        agreement: {
          signedBy: signature.trim(),
          email: quoteData.customer.email,
          agreedToTerms: true as const,
          termsVersion: quoteData.termsVersion || quoteData.terms?.version || '1.0',
          termsId: quoteData.termsId || quoteData.terms?.id || '',
          termsUrl: quoteData.termsUrl || quoteData.terms?.url || `${window.location.origin}/terms`,
          termsContent: quoteData.termsContent || quoteData.terms?.content || '',
          signedAt: new Date().toISOString(),
          ipAddress: userIpAddress,
          userAgent: navigator.userAgent,
        },
      };

      const data = await quoteApi.checkout(quoteData.quoteNumber, checkoutPayload);

      // Use the hosted payment link from Alternative Payments
      if (data.paymentLink) {
        window.location.href = data.paymentLink;
      } else {
        throw new Error("No payment link received");
      }
    } catch (err) {
      console.error("Error processing quote acceptance:", err);
      toast({
        title: "Processing Error",
        description: "Unable to proceed to payment. Please try again or contact support.",
        variant: "destructive",
      });
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <div className="flex items-center justify-center py-20">
          <Card className="p-8 text-center animate-fade-in">
            <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-muted-foreground">Loading quote details...</p>
          </Card>
        </div>
      </div>
    );
  }

  if (error || !quoteData) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <div className="flex items-center justify-center px-4 py-20">
          <Card className="max-w-md w-full p-8 text-center animate-fade-in">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-destructive" />
            <h2 className="text-xl font-semibold mb-2">Quote Not Found</h2>
            <p className="text-muted-foreground mb-6">
              {error || "The quote you are looking for could not be found or has expired."}
            </p>
            <div className="space-y-3">
              <Button asChild className="w-full">
                <Link to="/">Return to Home</Link>
              </Button>
              <Button variant="outline" className="w-full" asChild>
                <a href="mailto:support@trustntm.com">Contact Support</a>
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="max-w-4xl mx-auto py-12 px-4">
        {/* Header Section */}
        <div className="text-center mb-8 animate-fade-in">
          <h1 className="text-4xl font-bold mb-2">Quote Review & Acceptance</h1>
          <p className="text-muted-foreground mt-2">Review your quote and proceed to payment</p>

          <div className="flex items-center justify-center gap-4 mt-4 flex-wrap">
            <div className="text-sm">
              Quote ID: <span className="font-mono font-semibold">{quoteData.quoteNumber}</span>
            </div>
            <Badge
              variant="secondary"
              className="bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200"
            >
              Pending Approval
            </Badge>
          </div>
        </div>

        {/* Customer Information */}
        <Card className="p-6 mb-6 animate-fade-in">
          <h2 className="text-2xl font-semibold mb-4">Customer Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-start gap-3">
              <Users className="w-5 h-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm text-muted-foreground">Contact Name</p>
                <p className="font-medium">{quoteData.customer.name}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Building2 className="w-5 h-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm text-muted-foreground">Business Name</p>
                <p className="font-medium">{quoteData.customer.businessName}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Mail className="w-5 h-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm text-muted-foreground">Email</p>
                <p className="font-medium">{quoteData.customer.email}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Phone className="w-5 h-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm text-muted-foreground">Phone</p>
                <p className="font-medium">{quoteData.customer.phone}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm text-muted-foreground">Address</p>
                <p className="font-medium">{quoteData.customer.address}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <MapPinned className="w-5 h-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm text-muted-foreground">Users & Locations</p>
                <p className="font-medium">
                  {quoteData.customer.userCount} users, {quoteData.customer.locationCount} locations
                </p>
              </div>
            </div>
            {quoteData.customer.referrerCode && (
              <div className="md:col-span-2">
                <p className="text-sm text-muted-foreground mb-1">Referrer Code</p>
                <Badge variant="secondary" className="font-mono">
                  {quoteData.customer.referrerCode.toUpperCase()}
                </Badge>
              </div>
            )}
          </div>
        </Card>

        {/* Admin-authored notes, if any. Customer-visible. Plain text with
            blank-line paragraphs preserved. */}
        {quoteData.notes && quoteData.notes.trim() && (
          <Card className="p-6 mb-6 animate-fade-in border-primary/30 bg-primary/5">
            <h2 className="text-xl font-semibold mb-3">Notes</h2>
            <p className="text-sm whitespace-pre-line">{quoteData.notes}</p>
          </Card>
        )}

        {/* Selected Package */}
        <Card className="p-6 mb-6 animate-fade-in">
          <h2 className="text-2xl font-semibold mb-4">Selected Package</h2>
          <div className="space-y-3">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="font-semibold text-lg">{quoteData.selectedPackage.name}</h3>
                <div className="text-sm text-muted-foreground space-y-1 mt-2">
                  <p>
                    ${formatAmount(quoteData.selectedPackage.pricePerUser)}/desktop user ×{' '}
                    {quoteData.customer.userCount} = $
                    {formatAmount(
                      quoteData.selectedPackage.pricePerUser * quoteData.customer.userCount,
                    )}
                  </p>
                  {(quoteData.customer.webUserCount ?? 0) > 0 && (
                    <p>
                      ${formatAmount(quoteData.selectedPackage.pricePerUserF3 ?? 0)}/web user ×{' '}
                      {quoteData.customer.webUserCount ?? 0} = $
                      {formatAmount(
                        (quoteData.selectedPackage.pricePerUserF3 ?? 0) *
                          (quoteData.customer.webUserCount ?? 0),
                      )}
                    </p>
                  )}
                  <p>
                    ${formatAmount(quoteData.selectedPackage.pricePerLocation)}/location ×{" "}
                    {quoteData.customer.locationCount} = $
                    {formatAmount(quoteData.selectedPackage.pricePerLocation * quoteData.customer.locationCount)}
                  </p>
                  <p className="font-semibold text-primary pt-1">
                    Package Total: ${formatAmount(quoteData.selectedPackage.calculatedPrice)}/
                    {quoteData.selectedPackage.frequency}
                  </p>
                </div>
              </div>
              {quoteData.selectedPackage.features && quoteData.selectedPackage.features.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setExpandedFeatures(!expandedFeatures)} type="button">
                  {expandedFeatures ? <ChevronUp /> : <ChevronDown />}
                </Button>
              )}
            </div>

            {expandedFeatures && (() => {
              const groups =
                quoteData.selectedPackage.featureGroups &&
                quoteData.selectedPackage.featureGroups.length > 0
                  ? quoteData.selectedPackage.featureGroups
                  : quoteData.selectedPackage.features &&
                      quoteData.selectedPackage.features.length > 0
                    ? [{ category: 'Includes', items: quoteData.selectedPackage.features }]
                    : [];
              if (groups.length === 0) return null;
              return (
                <div className="pt-3 border-t space-y-4">
                  {groups.map((g, gi) => (
                    <div key={gi}>
                      <p className="text-xs font-semibold uppercase tracking-wider text-primary mb-1">
                        {g.category}
                      </p>
                      <ul className="space-y-1.5">
                        {g.items.map((item, i) => (
                          <li key={i} className="text-sm flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </Card>

        {/* Selected Add-ons */}
        <Card className="p-6 mb-6 animate-fade-in">
          <h2 className="text-2xl font-semibold mb-4">Selected Add-Ons</h2>
          {!quoteData.selectedAddons || quoteData.selectedAddons.length === 0 ? (
            <p className="text-muted-foreground">No add-ons selected</p>
          ) : (
            <ul className="space-y-4">
              {quoteData.selectedAddons.map((addon) => (
                <li key={addon.id} className="pb-4 border-b last:border-b-0 last:pb-0">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{addon.name}</p>
                        {addon.quantity > 1 && (
                          <Badge variant="secondary" className="text-xs">
                            × {addon.quantity}
                          </Badge>
                        )}
                      </div>
                      {addon.description && <p className="text-sm text-muted-foreground mt-1">{addon.description}</p>}
                    </div>
                    <div className="text-right space-y-1">
                      {addon.pricingType === 'both' ? (
                        <>
                          <p className="text-sm font-semibold text-primary">
                            ${formatAmount(addon.totalRecurringCost)}/{addon.recurringFrequency}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            + ${formatAmount(addon.totalSetupCost)} setup
                          </p>
                        </>
                      ) : addon.pricingType === 'recurring-only' ? (
                        <p className="text-sm font-semibold text-primary">
                          ${formatAmount(addon.totalRecurringCost)}/{addon.recurringFrequency}
                        </p>
                      ) : (
                        <p className="text-sm font-semibold text-primary">
                          ${formatAmount(addon.totalSetupCost)} one-time
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Promo Code Entry */}
        <Card className="p-6 mb-6 animate-fade-in">
          <div className="flex items-center gap-2 mb-3">
            <Tag className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">Promo Code</h2>
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Enter promo code"
              value={promoInput}
              onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && handleApplyPromo()}
              disabled={applyingPromo || submitting}
            />
            <Button
              onClick={handleApplyPromo}
              disabled={!promoInput.trim() || applyingPromo || submitting}
              variant="secondary"
            >
              {applyingPromo ? <Loader2 className="w-4 h-4 animate-spin" /> : "Apply"}
            </Button>
          </div>
        </Card>

        {/* Applied Promo Codes */}
        {quoteData.appliedPromoCodes && quoteData.appliedPromoCodes.length > 0 && (
          <Card className="p-6 mb-6 animate-fade-in bg-green-50/50 dark:bg-green-950/20 border-green-200 dark:border-green-800">
            <h2 className="text-2xl font-semibold mb-4 text-green-900 dark:text-green-100">Applied Discounts</h2>
            <ul className="space-y-3">
              {quoteData.appliedPromoCodes.map((promo, index) => (
                <li key={index} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge className="bg-green-600 hover:bg-green-700">{promo.code}</Badge>
                    <span className="text-sm text-muted-foreground">
                      Applied to {promo.applyTo === "onboarding" ? "onboarding" : promo.applyTo === "one-time" ? "one-time costs" : "recurring costs"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-green-700 dark:text-green-400">
                      -{promo.discountType === "percentage" ? `${promo.discount}%` : `$${formatAmount(promo.discount)}`}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-green-700 hover:text-red-600 hover:bg-red-50"
                      onClick={async () => {
                        try {
                          const updated = await quoteApi.removePromo(quoteData.quoteNumber, promo.code);
                          setQuoteData(updated);
                          toast({ title: "Promo Removed", description: `Code "${promo.code}" removed.` });
                        } catch (err: any) {
                          toast({ title: "Error", description: err.message || "Could not remove promo.", variant: "destructive" });
                        }
                      }}
                      disabled={submitting}
                    >
                      ×
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* Cost Breakdown */}
        <div className="mb-6 animate-fade-in">
          <h2 className="text-2xl font-semibold mb-4">Cost Breakdown</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* Standard Onboarding
                Online portal quotes get onboarding waived per NTM policy, so
                the customer-facing card shows the base ("normally $X") with a
                strikethrough plus the waived $0 they're actually paying.
                Avoids the awkward "$291.333333.../user" floating-point line. */}
            {(() => {
              const baseOnboarding = quoteData.onboarding.totalCost;
              const finalOnboarding = quoteData.onboarding.finalCost;
              const waived = baseOnboarding > 0 && finalOnboarding === 0;
              const discounted =
                !waived && quoteData.onboarding.discount > 0 && finalOnboarding < baseOnboarding;
              return (
                <Card className="p-6 bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950/30 dark:to-purple-900/30 border-purple-200 dark:border-purple-800">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="text-lg font-semibold text-purple-900 dark:text-purple-100">
                        Standard Onboarding
                      </h3>
                      {baseOnboarding > 0 && (
                        <p
                          className={`text-sm mt-1 ${
                            waived
                              ? 'text-purple-700/70 dark:text-purple-300/70 line-through'
                              : 'text-purple-700 dark:text-purple-300'
                          }`}
                        >
                          Normally ${formatAmount(baseOnboarding)}
                        </p>
                      )}
                      {waived && (
                        <p className="text-sm font-semibold text-green-600 dark:text-green-400 mt-1">
                          ✓ Waived — free onboarding for online signups
                        </p>
                      )}
                      {discounted && (
                        <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                          Discount applied: ${formatAmount(quoteData.onboarding.discount)}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-3xl font-bold text-purple-900 dark:text-purple-100 mt-4">
                    ${formatAmount(finalOnboarding)}
                  </div>
                </Card>
              );
            })()}

            {/* One-Time Add-ons */}
            {(() => {
              const baseOneTime = quoteData.selectedAddons
                .filter(a => a.pricingType === 'one-time-only' || a.pricingType === 'both')
                .reduce((sum, a) => sum + (a.setupPrice || 0) * a.quantity, 0);
              const oneTimeDiscount = baseOneTime - quoteData.totals.oneTimeCosts;
              if (baseOneTime <= 0 && quoteData.totals.oneTimeCosts <= 0) return null;
              return (
                <Card className="p-6 bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-950/30 dark:to-orange-900/30 border-orange-200 dark:border-orange-800">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="text-lg font-semibold text-orange-900 dark:text-orange-100">One-Time Add-ons</h3>
                      <p className="text-sm text-orange-700 dark:text-orange-300 mt-1">One-time charges</p>
                      {oneTimeDiscount > 0.01 && (
                        <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                          Discount applied: ${formatAmount(oneTimeDiscount)}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-3xl font-bold text-orange-900 dark:text-orange-100 mt-4">
                    ${formatAmount(quoteData.totals.oneTimeCosts)}
                  </div>
                </Card>
              );
            })()}

            {/* Monthly Recurring */}
            {(() => {
              const baseRecurring = quoteData.selectedPackage.calculatedPrice +
                quoteData.selectedAddons
                  .filter(a => a.pricingType === 'recurring-only' || a.pricingType === 'both')
                  .reduce((sum, a) => sum + (a.recurringPrice || 0) * a.quantity, 0);
              const recurringDiscount = baseRecurring - quoteData.totals.recurringCosts;
              return (
                <Card className="p-6 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/30 dark:to-blue-900/30 border-blue-200 dark:border-blue-800">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100">
                        {quoteData.totals.recurringFrequency.charAt(0).toUpperCase() +
                          quoteData.totals.recurringFrequency.slice(1)}{" "}
                        Recurring
                      </h3>
                      <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">{quoteData.selectedPackage.name}</p>
                      {recurringDiscount > 0.01 && (
                        <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                          Discount applied: ${formatAmount(recurringDiscount)}/mo
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-3xl font-bold text-blue-900 dark:text-blue-100 mt-4">
                    ${formatAmount(quoteData.totals.recurringCosts)}
                    <span className="text-base font-normal text-blue-700 dark:text-blue-300">
                      {" "}
                      per {quoteData.totals.recurringFrequency}
                    </span>
                  </div>
                  <p className="text-xs text-blue-700 dark:text-blue-300 mt-3 leading-relaxed">
                    Invoices are sent on the <strong>1st of every month</strong> and are due
                    within <strong>30 days</strong> (Net 30). Your first month is paid today;
                    CW takes over from next month's invoice.
                  </p>
                </Card>
              );
            })()}
          </div>

          {/* Due Today - Full Width */}
          <Card className="p-8 bg-gradient-to-br from-green-50 to-emerald-100 dark:from-green-950/30 dark:to-emerald-900/30 border-green-200 dark:border-green-800">
            <div className="text-center">
              <p className="text-xs font-semibold text-green-700 dark:text-green-300 uppercase tracking-wider mb-2">
                To Start Services
              </p>
              <h3 className="text-2xl font-semibold text-green-900 dark:text-green-100 mb-2">Pay Today</h3>
              <div className="text-5xl font-bold text-green-900 dark:text-green-100 mb-3">
                ${formatAmount(quoteData.totals.onboardingCost + quoteData.totals.oneTimeCosts + quoteData.totals.recurringCosts)}
              </div>
              <p className="text-sm text-green-700 dark:text-green-300">
                {quoteData.totals.onboardingCost > 0 && `Onboarding ($${formatAmount(quoteData.totals.onboardingCost)}) + `}
                {quoteData.totals.oneTimeCosts > 0 && `One-time ($${formatAmount(quoteData.totals.oneTimeCosts)}) + `}
                {`First month ($${formatAmount(quoteData.totals.recurringCosts)})`}
              </p>
              <p className="text-xs text-green-700 dark:text-green-300 mt-2">
                {`Then $${formatAmount(quoteData.totals.recurringCosts)}/month starting next billing cycle.`}
              </p>
              <p className="text-xs text-green-800 dark:text-green-200 mt-3 italic">
                Services activate once payment is captured. Ongoing invoices are sent on the
                1st of every month and are due within 30 days (Net 30).
              </p>
            </div>
          </Card>
        </div>

        {/* Acceptance Section */}
        <Card className="p-8 mb-8 animate-fade-in">
          <h3 className="text-xl font-semibold mb-6">Accept Quote & Proceed</h3>

          {IS_LEAD_GEN_MODE ? (
            <div className="space-y-4">
              <Button
                onClick={handleRequestFollowup}
                disabled={submitting}
                className="w-full h-12 text-lg"
              >
                {submitting ? (
                  <>
                    <Loader2 className="animate-spin mr-2" /> Submitting...
                  </>
                ) : (
                  <>
                    Request Follow-up from Sales Rep <CalendarCheck className="ml-2" />
                  </>
                )}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                A sales rep will reach out to finalize pricing. You'll be redirected to pick a time on their calendar.
              </p>
            </div>
          ) : (
          <>

          <div className="space-y-6">
            {/* E-Signature */}
            <div>
              <Label htmlFor="signature">Full Legal Name (E-Signature)</Label>
              <Input
                id="signature"
                placeholder="Enter your full legal name"
                value={signature}
                onChange={(e) => setSignature(e.target.value)}
                className="mt-2"
                disabled={submitting}
              />
              <p className="text-xs text-muted-foreground mt-1">
                By typing your name, you agree this constitutes a legal signature.
              </p>
            </div>

            {/* Terms Checkbox */}
            <div className="flex items-start space-x-3">
              <Checkbox
                id="terms"
                checked={agreedToTerms}
                onCheckedChange={(checked) => setAgreedToTerms(checked === true)}
                disabled={submitting}
              />
              <Label htmlFor="terms" className="text-sm cursor-pointer leading-relaxed">
                I agree to the{" "}
                <a
                  href="/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  terms and conditions
                </a>{" "}
                and authorize this purchase.
              </Label>
            </div>

            {/* Preview the full Quote + Contract before paying. Opens the
                same template the signed PDF uses in a new tab so the
                customer can read every clause + (if they want) use the
                browser's "Save as PDF" to keep a copy. */}
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() =>
                window.open(
                  `/api/contracts/${encodeURIComponent(quoteData.quoteNumber)}/preview`,
                  '_blank',
                  'noopener,noreferrer',
                )
              }
            >
              <FileText className="mr-2 w-4 h-4" />
              Preview full Quote &amp; Contract
            </Button>

            {/* Submit Button */}
            <Button
              onClick={handleAcceptQuote}
              disabled={!signature.trim() || !agreedToTerms || submitting}
              className="w-full h-12 text-lg"
            >
              {submitting ? (
                <>
                  <Loader2 className="animate-spin mr-2" /> Processing...
                </>
              ) : (
                <>
                  Pay $
                  {formatAmount(
                    quoteData.totals.onboardingCost +
                      quoteData.totals.oneTimeCosts +
                      quoteData.totals.recurringCosts,
                  )}{' '}
                  &amp; Start Services <CreditCard className="ml-2" />
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground text-center -mt-2">
              You'll be redirected to Alternative Payments' secure checkout to complete payment.
            </p>
          </div>
          </>
          )}
        </Card>
      </div>
    </div>
  );
}
