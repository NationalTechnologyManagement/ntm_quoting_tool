import { Link } from 'react-router-dom';

/**
 * Shared brand header for customer-facing pages.
 * - Sticks to the top with a translucent navy + backdrop blur so it floats
 *   over hero gradients without breaking the visual continuity.
 * - Logo + wordmark click through to /, the landing page.
 * - Admin pages use their own AdminNav and should not include this.
 */
export const SiteHeader = () => (
  <header className="sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur-md">
    <div className="container mx-auto px-4 h-16 flex items-center justify-between">
      <Link
        to="/"
        className="flex items-center gap-3 group"
        aria-label="National Technology Management — home"
      >
        <img
          src="/ntm-logo.png"
          alt=""
          className="w-10 h-10 drop-shadow-md transition-transform group-hover:scale-105"
        />
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-bold text-foreground tracking-wide">
            National Technology Management
          </span>
          <span className="text-xs text-muted-foreground">Quoting Portal</span>
        </div>
      </Link>
    </div>
  </header>
);

export default SiteHeader;
