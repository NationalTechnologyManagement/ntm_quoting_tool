/**
 * Shared dark-navy footer for the customer-facing portal (2026 redesign).
 * Purely presentational — logo, wordmark, and a link back to the marketing
 * site. Matches the footer in the design comps.
 */
export const SiteFooter = () => (
  <footer className="bg-[#16243F] px-6 py-9">
    <div className="max-w-[1120px] mx-auto flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <img src="/ntm-logo.png" alt="NTM" className="w-[34px] h-[34px]" />
        <span className="font-heading font-semibold text-sm text-white">
          National Technology Management
        </span>
      </div>
      <p className="text-[13px] text-[#8B97A8] m-0">
        Clear pricing with tax and fees included. Questions? Visit{' '}
        <a
          href="https://www.trustntm.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#F0A472] hover:text-[#F0A472]"
        >
          trustntm.com
        </a>
      </p>
    </div>
  </footer>
);

export default SiteFooter;
