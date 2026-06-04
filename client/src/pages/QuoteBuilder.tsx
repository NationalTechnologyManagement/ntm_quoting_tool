import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuote } from '@/contexts/QuoteContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Check, Star, Search, ArrowRight, FileSearch, X, ChevronDown, ChevronUp } from 'lucide-react';
import { SiteHeader } from '@/components/SiteHeader';
import { formatContractTerm } from '@/lib/utils';

const QuoteBuilder = () => {
  const navigate = useNavigate();
  const { selectedPackage, setSelectedPackage, packages, siteContent } = useQuote();

  const [showLookup, setShowLookup] = useState(false);
  const [quoteSearch, setQuoteSearch] = useState('');
  // packageId -> whether the full feature list is expanded on its card.
  // Collapsed view shows category headers + top 2 items per category so the
  // three cards still fit comfortably; "Show more" reveals everything.
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});

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
    navigate('/quote-info');
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="max-w-6xl mx-auto space-y-10 py-12 px-4">
        {/* Header — editable copy comes from siteContent (admin-controlled) */}
        <div className="text-center space-y-4 animate-fade-in">
          <div className="flex justify-center">
            <img
              src="/ntm-logo.png"
              alt="NTM"
              className="w-20 h-20 md:w-24 md:h-24 drop-shadow-[0_0_24px_rgba(232,127,55,0.25)]"
            />
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-foreground">
            {siteContent.quoteBuilderHeading}
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto">
            {siteContent.quoteBuilderSubheading}
          </p>
        </div>

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

                    {/* Per-unit pricing display — Desktop User + Location only.
                        Web User price is intentionally NOT shown on this
                        screen; it's surfaced on the Service Details step
                        alongside the Web Users input. */}
                    <div className="mt-5 space-y-1">
                      <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-bold text-primary">${pkg.pricePerUser}</span>
                        <span className="text-muted-foreground text-sm">
                          /user/{pkg.frequency}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-semibold text-foreground/80">
                          ${pkg.pricePerLocation}
                        </span>
                        <span className="text-muted-foreground text-sm">
                          /location/{pkg.frequency}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Categorized features. Collapsed view shows top 2 per
                      category + a "+N more" hint so all three cards fit
                      side-by-side. Full list reveals on Show more. */}
                  <div className="flex-1 space-y-3">
                    {((pkg.featureGroups?.length ?? 0) > 0
                      ? pkg.featureGroups!
                      : [{ category: 'Includes', items: pkg.features }]
                    ).map((group, gi) => {
                      const isExpanded = !!expandedCards[pkg.id];
                      const PREVIEW = 2;
                      const visible = isExpanded
                        ? group.items
                        : group.items.slice(0, PREVIEW);
                      const remaining = isExpanded
                        ? 0
                        : Math.max(0, group.items.length - PREVIEW);
                      return (
                        <div key={gi}>
                          <p className="text-xs font-semibold uppercase tracking-wider text-primary mb-1">
                            {group.category}
                          </p>
                          <ul className="space-y-1.5">
                            {visible.map((item, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm">
                                <Check className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                                <span className="text-foreground">{item}</span>
                              </li>
                            ))}
                            {remaining > 0 && (
                              <li className="text-xs text-muted-foreground pl-6">
                                + {remaining} more
                              </li>
                            )}
                          </ul>
                        </div>
                      );
                    })}
                    {(pkg.featureGroups?.some((g) => g.items.length > 2) ||
                      (pkg.featureGroups?.length ?? 0) > 0) && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedCards((s) => ({ ...s, [pkg.id]: !s[pkg.id] }));
                        }}
                        className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1"
                      >
                        {expandedCards[pkg.id] ? (
                          <>
                            <ChevronUp className="w-3 h-3" /> Show less
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-3 h-3" /> Show more
                          </>
                        )}
                      </button>
                    )}
                  </div>

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
              'w-full sm:w-auto px-6 sm:px-12 h-14 text-base sm:text-lg font-semibold',
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
