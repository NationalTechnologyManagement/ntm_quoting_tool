import { Link } from 'react-router-dom';
import { Home, LayoutGrid } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Shared brand header for customer-facing pages.
 * - Sticks to the top with a translucent navy + backdrop blur so it floats
 *   over hero gradients without breaking the visual continuity.
 * - Logo + wordmark click through to /, the quoting portal landing.
 * - "Home" button on the right opens trustntm.com (the marketing site) in
 *   a new tab so the customer doesn't lose their place in the wizard.
 * - Admin pages use their own AdminNav and should not include this.
 */
export const SiteHeader = () => (
  <header className="sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur-md">
    <div className="container mx-auto px-4 h-16 flex items-center justify-between gap-2">
      <Link
        to="/"
        className="flex items-center gap-2 sm:gap-3 group min-w-0"
        aria-label="National Technology Management — quoting portal home"
      >
        <img
          src="/ntm-logo.png"
          alt=""
          className="w-9 h-9 sm:w-10 sm:h-10 flex-shrink-0 drop-shadow-md transition-transform group-hover:scale-105"
        />
        <div className="flex flex-col leading-tight min-w-0">
          <span className="text-xs sm:text-sm font-bold text-foreground tracking-wide truncate">
            National Technology Management
          </span>
          <span className="text-xs text-muted-foreground">Quoting Portal</span>
        </div>
      </Link>

      <div className="flex items-center gap-1 flex-shrink-0">
        {/* Internal: jump back to the package picker so a customer mid-wizard
            can rethink their plan without losing the rest of the session.
            Labels collapse to icon-only below sm so the header never overflows. */}
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground px-2 sm:px-3"
        >
          <Link to="/quote-builder" aria-label="Back to the package picker">
            <LayoutGrid className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Packages</span>
          </Link>
        </Button>

        {/* External: marketing site. New tab so the wizard stays put. */}
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground px-2 sm:px-3"
        >
          <a
            href="https://www.trustntm.com"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Visit trustntm.com (opens in new tab)"
          >
            <Home className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Home</span>
          </a>
        </Button>
      </div>
    </div>
  </header>
);

export default SiteHeader;
