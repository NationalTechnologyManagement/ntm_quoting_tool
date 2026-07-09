import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

/**
 * Shared brand header for customer-facing pages (2026 portal redesign).
 * Warm, light, sticky bar: NTM logo + wordmark on the left, quick links on
 * the right. The "Already have a quote?" lookup lives here as a dropdown so
 * every page can reach it (it used to live in the QuoteBuilder body).
 *
 * variant:
 *   'full'    — Packages link + quote lookup + trustntm.com (landing page)
 *   'minimal' — just trustntm.com (wizard steps, which have their own back
 *               links + step indicator in the body)
 */
export const SiteHeader = ({ variant = 'full' }: { variant?: 'full' | 'minimal' }) => {
  const navigate = useNavigate();
  const [lookupOpen, setLookupOpen] = useState(false);
  const [quoteSearch, setQuoteSearch] = useState('');
  const lookupRef = useRef<HTMLDivElement>(null);

  // Same lookup behavior the QuoteBuilder body used to have: an email goes to
  // the by-email lookup, anything else is treated as a quote number.
  const handleLookup = () => {
    const v = quoteSearch.trim();
    if (!v) return;
    if (v.includes('@')) {
      navigate(`/quote-lookup?email=${encodeURIComponent(v)}`);
    } else {
      navigate(`/quote-review?id=${v}`);
    }
    setLookupOpen(false);
  };

  useEffect(() => {
    if (!lookupOpen) return;
    const onDown = (e: MouseEvent) => {
      if (lookupRef.current && !lookupRef.current.contains(e.target as Node)) {
        setLookupOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [lookupOpen]);

  const linkClass =
    'text-sm font-medium text-[#4A5563] px-3.5 py-2 rounded-lg transition-colors hover:bg-[#F1EFEA] hover:text-[#16243F]';

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[#ECEAE4] bg-[#FBFAF8]/[0.88] backdrop-blur-md">
      <div className="max-w-[1120px] mx-auto px-6 h-[68px] flex items-center justify-between gap-4">
        <Link
          to="/quote-builder"
          className="flex items-center gap-3 min-w-0"
          aria-label="National Technology Management — quoting portal home"
        >
          <img src="/ntm-logo.png" alt="NTM" className="w-10 h-10 flex-shrink-0" />
          <span className="flex flex-col leading-[1.15] min-w-0">
            <span className="font-heading font-bold text-sm tracking-[0.01em] text-[#16243F] whitespace-nowrap">
              National Technology Management
            </span>
            <span className="text-xs text-[#7A8595]">Quoting Portal</span>
          </span>
        </Link>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {variant === 'full' && (
            <>
              <Link to="/quote-builder" className={linkClass}>
                Packages
              </Link>

              <div className="relative" ref={lookupRef}>
                <button
                  type="button"
                  onClick={() => setLookupOpen((o) => !o)}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-[#4A5563] px-3.5 py-2 rounded-lg transition-colors hover:bg-[#F1EFEA] hover:text-[#16243F]"
                >
                  <span className="hidden sm:inline">Already have a quote?</span>
                  <span className="sm:hidden">My quote</span>
                  <span className="text-[11px]">{lookupOpen ? '▲' : '▼'}</span>
                </button>
                {lookupOpen && (
                  <div className="absolute top-[calc(100%+12px)] right-0 w-[340px] max-w-[calc(100vw-2rem)] bg-white border border-[#E9E7E2] rounded-2xl shadow-[0_20px_44px_-16px_rgba(22,36,63,0.32)] p-5 z-[60]">
                    <div className="absolute -top-[7px] right-[26px] w-3 h-3 bg-white border-l border-t border-[#E9E7E2] rotate-45" />
                    <p className="font-heading font-bold text-[15px] text-[#16243F] mb-1">
                      Look up your quote
                    </p>
                    <p className="text-[13px] leading-[1.45] text-[#6B7686] mb-3.5">
                      Enter your quote number or the email address on the quote.
                    </p>
                    <input
                      value={quoteSearch}
                      onChange={(e) => setQuoteSearch(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
                      placeholder="QT-20260427-1234 or your email"
                      className="w-full h-11 px-3.5 rounded-[9px] border border-[#DCD9D2] bg-[#FBFAF8] text-[#1B2432] text-sm mb-2.5 outline-none focus:border-[#D96626]"
                    />
                    <button
                      type="button"
                      onClick={handleLookup}
                      className="w-full h-11 rounded-[9px] bg-[#D96626] text-white font-heading font-semibold text-sm transition-colors hover:bg-[#C25A20]"
                    >
                      Find my quote →
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          <a
            href="https://www.trustntm.com"
            target="_blank"
            rel="noopener noreferrer"
            className={linkClass}
          >
            trustntm.com&nbsp;↗
          </a>
        </div>
      </div>
    </header>
  );
};

export default SiteHeader;
