import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuote } from '@/contexts/QuoteContext';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { formatContractTerm } from '@/lib/utils';

// Feature preview count on the collapsed card. "Show all features" reveals
// the rest; no information is hidden, just deferred.
const PREVIEW = 3;

// "What happens next" FAQ. Answers are grounded in how the portal actually
// works (see docs/SOP.html) and NTM's real service facts (trustntm.com) — no
// invented marketing claims.
const FAQS: { q: string; a: string }[] = [
  {
    q: 'What happens after I choose a plan?',
    a: "Tell us your team size and contact details, review your full quote, then type your name to e-sign and pay online — by card or ACH — through a secure hosted checkout. You'll get one email with your signed contract attached as a PDF.",
  },
  {
    q: "What's included in every plan?",
    a: 'Every plan includes proactive monitoring, a Network Operations Center, endpoint security, Microsoft 365 management, and a US-based helpdesk. Higher tiers add managed security like MDR/EDR and advanced threat protection, Microsoft 365 backups, and 24×7 coverage.',
  },
  {
    q: 'Is there a contract, and what about the onboarding fee?',
    a: 'Each plan shows its term on the card — month-to-month, 3-year, or 5-year. When you sign up online here through the portal, we waive the onboarding fee.',
  },
  {
    q: 'How does billing work?',
    a: 'Your first month is paid at checkout. After that, invoices are sent on the 1st of every month and are due within 30 days (Net 30). Sales tax is calculated at invoice time based on your business location.',
  },
  {
    q: 'Can I add phones, backups, or server management?',
    a: 'Yes. On the sizing step you can add VoIP, Microsoft Teams Phone, eFaxing, Microsoft 365 backups, and per-VM server management to your quote.',
  },
  {
    q: 'What are your support hours?',
    a: 'Our US-based helpdesk is available Monday–Friday, 8:00 AM–5:00 PM, with 24/7 emergency support. Higher tiers include full 24×7 coverage.',
  },
  {
    q: 'How soon can we get started?',
    a: 'Onboarding begins as soon as payment is captured, and we coordinate scheduling with you. Most customers are up and running within a few business days.',
  },
];

const QuoteBuilder = () => {
  const navigate = useNavigate();
  const { selectedPackage, setSelectedPackage, packages, siteContent } = useQuote();

  // packageId -> whether the full feature list is expanded on its card.
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
  // Which FAQ is open (single-open accordion). First one open by default.
  const [openFaq, setOpenFaq] = useState<number>(0);

  // Newsletter visitor tracker — scoped to this pricing page ONLY. Injected
  // into <head> on mount, removed on unmount (SPA; index.html would load it on
  // every route). Guarded against duplicate injection.
  useEffect(() => {
    const SRC = 'https://ntm-newsletter-production.up.railway.app/static/tracker.js';
    if (document.querySelector(`script[src="${SRC}"]`)) return;
    const script = document.createElement('script');
    script.src = SRC;
    script.async = true;
    script.dataset.tenant = 'pricing';
    document.head.appendChild(script);
    return () => {
      script.remove();
    };
  }, []);

  const selectAndBuild = (pkg: (typeof packages)[number]) => {
    setSelectedPackage(pkg);
    navigate('/quote-info');
  };

  const colClass =
    packages.length <= 2
      ? 'grid grid-cols-1 md:grid-cols-2 gap-7 max-w-[840px] mx-auto'
      : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7 max-w-[1080px] mx-auto';

  return (
    <div className="min-h-screen bg-[#FBFAF8]">
      <SiteHeader variant="full" />

      <div className="max-w-[1120px] mx-auto px-6">
        {/* Hero — editable copy from siteContent (admin-controlled) */}
        <section className="text-center pt-9 pb-6 animate-rise">
          <h1 className="font-heading font-extrabold text-[32px] sm:text-[38px] leading-[1.06] tracking-[-0.02em] text-[#16243F] max-w-[720px] mx-auto mb-3">
            {siteContent.quoteBuilderHeading}
          </h1>
          <p className="text-base leading-[1.55] text-[#5A6575] max-w-[600px] mx-auto">
            {siteContent.quoteBuilderSubheading}
          </p>
        </section>

        {/* Plans */}
        <section id="plans" className="scroll-mt-[88px]">
          <div className={colClass}>
            {packages.map((pkg, index) => {
              const isSelected = selectedPackage?.id === pkg.id;
              const groups =
                (pkg.featureGroups?.length ?? 0) > 0
                  ? pkg.featureGroups!
                  : [{ category: 'Includes', items: pkg.features }];
              const isExpanded = !!expandedCards[pkg.id];
              const canExpand = groups.some((g) => g.items.length > PREVIEW);
              return (
                <div
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
                    'relative flex flex-col bg-white rounded-2xl p-8 cursor-pointer animate-rise',
                    'shadow-[0_1px_2px_rgba(22,36,63,0.04)] transition-all duration-[250ms]',
                    'hover:-translate-y-1 hover:shadow-[0_16px_34px_-14px_rgba(22,36,63,0.24)]',
                    isSelected ? 'border-2 border-[#D96626]' : 'border border-[#E9E7E2] hover:border-[#D9D5CD]',
                  ].join(' ')}
                >
                  {pkg.isBestValue && (
                    <div className="absolute -top-[13px] left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 bg-[#D96626] text-white px-3.5 py-1.5 rounded-full text-xs font-semibold tracking-[0.03em] shadow-[0_6px_14px_-4px_rgba(217,102,38,0.5)] whitespace-nowrap">
                      ★ Most Popular
                    </div>
                  )}

                  <h3 className="font-heading font-bold text-2xl text-[#16243F] mb-1">{pkg.name}</h3>
                  <p className="text-[13px] text-[#8A94A3] mb-4">{formatContractTerm(pkg.agreementMonths)}</p>

                  {/* Price — per user + per location (real package data) */}
                  <div className="mb-3.5">
                    <div className="flex items-baseline gap-1.5">
                      <span className="font-heading font-extrabold text-[34px] text-[#16243F] tracking-[-0.02em]">
                        ${pkg.pricePerUser}
                      </span>
                      <span className="text-[13.5px] text-[#7A8595]">/user/{pkg.frequency}</span>
                    </div>
                    <p className="text-[12.5px] text-[#8A94A3] mt-1">
                      Plus ${pkg.pricePerLocation} per location.
                    </p>
                    <p className="text-[11.5px] text-[#A2ABB8] mt-1 leading-[1.4]">
                      Includes basic network equipment — firewall, switch, and access points.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      selectAndBuild(pkg);
                    }}
                    className={[
                      'w-full h-12 rounded-[10px] font-heading font-semibold text-[15px] transition-colors',
                      isSelected
                        ? 'bg-[#D96626] text-white shadow-[0_8px_18px_-8px_rgba(217,102,38,0.6)] hover:bg-[#C25A20]'
                        : 'bg-white text-[#16243F] border-[1.5px] border-[#16243F] hover:bg-[#16243F] hover:text-white',
                    ].join(' ')}
                  >
                    Start now →
                  </button>

                  <div className="h-px bg-[#EFEDE8] my-5" />

                  {/* Feature groups */}
                  <div className="flex-1 flex flex-col gap-[18px]">
                    {groups.map((group, gi) => {
                      const visible = isExpanded ? group.items : group.items.slice(0, PREVIEW);
                      const remaining = isExpanded ? 0 : Math.max(0, group.items.length - PREVIEW);
                      return (
                        <div key={gi}>
                          <div className="flex items-center gap-2 mb-2.5">
                            <span className="w-1.5 h-1.5 bg-[#D96626] inline-block" />
                            <span className="text-[11px] font-semibold tracking-[0.1em] uppercase text-[#8A94A3]">
                              {group.category}
                            </span>
                          </div>
                          <ul className="list-none m-0 p-0 flex flex-col gap-2">
                            {visible.map((item, i) => (
                              <li
                                key={i}
                                className="flex items-start gap-2.5 text-[13.5px] leading-[1.4] text-[#2A3547]"
                              >
                                <span className="text-[#D96626] font-bold flex-shrink-0 -mt-px">✓</span>
                                <span>{item}</span>
                              </li>
                            ))}
                            {remaining > 0 && (
                              <li className="text-[13px] text-[#9AA3B1] pl-[18px]">+ {remaining} more</li>
                            )}
                          </ul>
                        </div>
                      );
                    })}
                  </div>

                  {canExpand && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedCards((s) => ({ ...s, [pkg.id]: !s[pkg.id] }));
                      }}
                      className="self-start mt-4 bg-transparent border-none p-0 text-[13px] font-semibold text-[#D96626] cursor-pointer"
                    >
                      {isExpanded ? '– Show less' : '+ Show all features'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* What happens next — FAQ */}
        <section className="pt-16 pb-6">
          <div className="text-center mb-9">
            <span className="text-[13px] font-semibold tracking-[0.12em] uppercase text-[#D96626]">
              Good to know
            </span>
            <h2 className="font-heading font-bold text-[30px] tracking-[-0.01em] text-[#16243F] mt-2">
              What happens next
            </h2>
          </div>
          <div className="max-w-[760px] mx-auto flex flex-col gap-3">
            {FAQS.map((faq, i) => {
              const open = openFaq === i;
              return (
                <div key={i} className="bg-white border border-[#EAE8E2] rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setOpenFaq(open ? -1 : i)}
                    className="w-full flex items-center justify-between gap-4 px-[22px] py-5 bg-transparent border-none cursor-pointer text-left font-heading font-semibold text-[16.5px] text-[#16243F]"
                  >
                    <span>{faq.q}</span>
                    <span className="text-[#D96626] text-[22px] font-normal flex-shrink-0 leading-none">
                      {open ? '−' : '+'}
                    </span>
                  </button>
                  {open && (
                    <p className="m-0 px-[22px] pb-[22px] text-[15px] leading-[1.65] text-[#5A6575]">
                      {faq.a}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <div className="h-8" />
      </div>

      <SiteFooter />
    </div>
  );
};

export default QuoteBuilder;
