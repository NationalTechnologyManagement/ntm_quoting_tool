import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuote } from '@/contexts/QuoteContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Check,
  Star,
  Search,
  ArrowRight,
  FileSearch,
  X,
  Info,
  AlertCircle,
} from 'lucide-react';
import { SiteHeader } from '@/components/SiteHeader';
import { formatContractTerm, formatCurrency } from '@/lib/utils';

const QuoteBuilder = () => {
  const navigate = useNavigate();
  const {
    selectedPackage,
    setSelectedPackage,
    packages,
    customerInfo,
    setCustomerInfo,
    siteContent,
  } = useQuote();

  const [showLookup, setShowLookup] = useState(false);
  const [quoteSearch, setQuoteSearch] = useState('');
  // Surfaced inline only after the customer tries to advance without at
  // least one Desktop User. Stays in red until they fix it.
  const [attemptedAdvance, setAttemptedAdvance] = useState(false);

  const desktopCount = customerInfo.userCount;
  const webCount = customerInfo.webUserCount ?? 0;
  const locationCount = customerInfo.locationCount;
  const needsDesktop = desktopCount < 1;

  const setDesktopCount = (n: number) =>
    setCustomerInfo({ ...customerInfo, userCount: Math.max(0, n) });
  const setWebCount = (n: number) =>
    setCustomerInfo({ ...customerInfo, webUserCount: Math.max(0, n) });
  const setLocationCount = (n: number) =>
    setCustomerInfo({ ...customerInfo, locationCount: Math.max(1, n) });

  const handleLookup = () => {
    const v = quoteSearch.trim();
    if (!v) return;
    if (v.includes('@')) {
      navigate(`/quote-lookup?email=${encodeURIComponent(v)}`);
    } else {
      navigate(`/quote-review?id=${v}`);
    }
  };

  const handleBuildQuote = () => {
    if (!selectedPackage) return;
    if (needsDesktop) {
      setAttemptedAdvance(true);
      return;
    }
    navigate('/quote-info');
  };

  const monthlyForPackage = (pkg: typeof packages[number]) =>
    pkg.pricePerUser * desktopCount +
    (pkg.pricePerUserF3 ?? 0) * webCount +
    pkg.pricePerLocation * locationCount;

  // Explainer body is admin-editable plain text with blank-line paragraph
  // breaks. Render newlines as <br/> so the formatting stays faithful.
  const explainerParagraphs = useMemo(
    () => siteContent.quoteBuilderExplainerBody.split(/\n\n+/),
    [siteContent.quoteBuilderExplainerBody],
  );

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="max-w-6xl mx-auto space-y-8 py-12 px-4">
        {/* Header — editable copy comes from siteContent (admin-controlled) */}
        <div className="text-center space-y-4 animate-fade-in">
          <div className="flex justify-center">
            <img
              src="/ntm-logo.png"
              alt="NTM"
              className="w-20 h-20 md:w-24 md:h-24 drop-shadow-[0_0_24px_rgba(232,127,55,0.25)]"
            />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-foreground">
            {siteContent.quoteBuilderHeading}
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            {siteContent.quoteBuilderSubheading}
          </p>
        </div>

        {/* User sizing + explainer. Put the inputs front-and-center so the
            customer can size their team before picking a package — the
            package cards then show live monthly totals based on these
            counts. */}
        <Card className="p-6 shadow-card animate-slide-up">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="desktop-users" className="font-semibold">
                  Desktop Users
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground"
                      aria-label="What's a Desktop User?"
                    >
                      <Info className="w-4 h-4" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="max-w-md text-sm space-y-2">
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
              <Input
                id="desktop-users"
                type="number"
                min={0}
                value={desktopCount}
                onChange={(e) => setDesktopCount(parseInt(e.target.value) || 0)}
                className={
                  attemptedAdvance && needsDesktop
                    ? 'border-destructive focus-visible:ring-destructive'
                    : ''
                }
              />
              <p className="text-xs text-muted-foreground">
                Full Microsoft 365 — primary staff.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="web-users" className="font-semibold">
                Web Users
              </Label>
              <Input
                id="web-users"
                type="number"
                min={0}
                value={webCount}
                onChange={(e) => setWebCount(parseInt(e.target.value) || 0)}
              />
              <p className="text-xs text-muted-foreground">
                Web &amp; email only — frontline, kiosk, shared devices.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="locations" className="font-semibold">
                Locations
              </Label>
              <Input
                id="locations"
                type="number"
                min={1}
                value={locationCount}
                onChange={(e) => setLocationCount(parseInt(e.target.value) || 1)}
              />
              <p className="text-xs text-muted-foreground">
                Number of physical sites we'll manage.
              </p>
            </div>
          </div>

          {/* Required-Desktop validator. Red only after the customer tries
              to proceed without one — pre-validation isn't useful when the
              default count is already 1 and they typed 0. */}
          {attemptedAdvance && needsDesktop && (
            <div className="mt-4 flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>
                At least one Desktop User is required to continue. Web Users alone
                aren't supported.
              </span>
            </div>
          )}
        </Card>

        {/* Packages — 3D feel + hover lift + selection ring. Grid auto-fits
            to the package count: 2 packages stay centered (Essentials is
            hidden by default), 3+ packages flow into the third column. */}
        <div
          className={
            packages.length <= 2
              ? 'grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto animate-slide-up'
              : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-slide-up'
          }
        >
          {packages.map((pkg, index) => {
            const isSelected = selectedPackage?.id === pkg.id;
            const monthly = monthlyForPackage(pkg);
            return (
              <Card
                key={pkg.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedPackage(pkg)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedPackage(pkg);
                  }
                }}
                style={{ animationDelay: `${index * 80}ms` }}
                className={[
                  'relative p-6 cursor-pointer bg-card border-border',
                  'shadow-card hover:shadow-card-hover',
                  'transition-all duration-300 ease-out',
                  'hover:-translate-y-1.5 hover:border-primary/40',
                  'animate-slide-up',
                  isSelected
                    ? 'ring-2 ring-primary ring-offset-2 ring-offset-background border-primary/60 -translate-y-1'
                    : '',
                ].join(' ')}
              >
                {pkg.isBestValue && (
                  <Badge className="absolute -top-3 right-4 bg-primary text-primary-foreground shadow-md animate-pulse">
                    <Star className="w-3 h-3 mr-1 fill-current" />
                    Most Popular
                  </Badge>
                )}

                <div className="flex flex-col h-full space-y-5">
                  <div>
                    <h3 className="text-2xl font-bold text-foreground">{pkg.name}</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {formatContractTerm(pkg.agreementMonths)}
                    </p>

                    {/* Live monthly total for THIS package given the sizing
                        the customer entered above. Falls back to per-unit
                        prices when nothing's been entered yet. */}
                    <div className="mt-5 space-y-2">
                      <div className="flex items-baseline gap-2">
                        <span className="text-4xl font-bold text-primary">
                          {formatCurrency(monthly)}
                        </span>
                        <span className="text-muted-foreground text-sm">
                          /{pkg.frequency}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        <div>
                          {desktopCount} desktop × ${pkg.pricePerUser}
                          {webCount > 0 && (
                            <>
                              {' '}+ {webCount} web × ${pkg.pricePerUserF3 ?? 0}
                            </>
                          )}
                        </div>
                        <div>
                          {locationCount} location{locationCount === 1 ? '' : 's'} × $
                          {pkg.pricePerLocation}
                        </div>
                      </div>
                    </div>
                  </div>

                  <ul className="space-y-2 flex-1">
                    {pkg.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <Check className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                        <span className="text-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    variant={isSelected ? 'default' : 'outline'}
                    className={[
                      'w-full mt-auto transition-all',
                      isSelected ? 'shadow-md' : 'bg-secondary/40 hover:bg-secondary',
                    ].join(' ')}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedPackage(pkg);
                    }}
                  >
                    {isSelected ? (
                      <>
                        <Check className="w-4 h-4 mr-2" />
                        Selected
                      </>
                    ) : (
                      'Select'
                    )}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Build a Quote CTA */}
        <div className="flex justify-center pt-4 animate-fade-in" style={{ animationDelay: '400ms' }}>
          <Button
            size="lg"
            onClick={handleBuildQuote}
            disabled={!selectedPackage}
            className={[
              'px-12 h-14 text-lg font-semibold',
              'shadow-card hover:shadow-card-hover',
              'transition-all duration-300 group',
              selectedPackage ? 'hover:-translate-y-0.5 hover:scale-[1.02]' : '',
            ].join(' ')}
          >
            {selectedPackage ? `Build a Quote — ${selectedPackage.name}` : 'Select a package to continue'}
            <ArrowRight className={`ml-2 w-5 h-5 transition-transform ${selectedPackage ? 'group-hover:translate-x-1' : ''}`} />
          </Button>
        </div>

        {/* Have a quote already — collapsed by default */}
        <div className="flex justify-center pt-2 animate-fade-in" style={{ animationDelay: '600ms' }}>
          {!showLookup ? (
            <Button
              variant="ghost"
              onClick={() => setShowLookup(true)}
              className="text-muted-foreground hover:text-foreground"
            >
              <FileSearch className="w-4 h-4 mr-2" />
              Have a quote already? Look it up
            </Button>
          ) : (
            <Card className="p-4 bg-card border-border shadow-card animate-scale-in w-full max-w-2xl">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-foreground">Look up an existing quote</p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowLookup(false);
                    setQuoteSearch('');
                  }}
                  className="h-7 w-7 p-0"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="QT-20260427-1234 or your email"
                  value={quoteSearch}
                  onChange={(e) => setQuoteSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
                  autoFocus
                  className="flex-1"
                />
                <Button onClick={handleLookup} disabled={!quoteSearch.trim()}>
                  <Search className="w-4 h-4 mr-2" />
                  Find
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default QuoteBuilder;
