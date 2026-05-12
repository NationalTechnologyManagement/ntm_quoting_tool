import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { LogOut, ExternalLink, PlusCircle } from 'lucide-react';
import { toast } from 'sonner';

type NavItem = {
  path: string;
  label: string;
  match?: (p: string) => boolean;
  adminOnly?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { path: '/admin/quotes', label: 'Quotes', match: (p: string) => p.startsWith('/admin/quotes') },
  { path: '/admin/logs', label: 'Logs' },
  { path: '/admin/packages', label: 'Packages' },
  { path: '/admin/addons', label: 'Add-Ons' },
  { path: '/admin/promo-codes', label: 'Promo Codes' },
  { path: '/admin/terms', label: 'Terms' },
  { path: '/admin/site-content', label: 'Site Copy' },
  { path: '/admin/integrations', label: 'Integrations' },
  { path: '/admin/cw-reference-ids', label: 'CW IDs' },
  { path: '/admin/ai-chat', label: 'AI Chat' },
  {
    path: '/admin/contracts/preview',
    label: 'Contract',
    match: (p: string) => p.startsWith('/admin/contracts'),
  },
  { path: '/admin/users', label: 'Users', adminOnly: true },
  { path: '/admin/account', label: 'Account' },
];

const AdminNav = () => {
  const navigate = useNavigate();
  const { logout, user } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/admin/login');
    toast.success('Logged out successfully');
  };

  const currentPath = window.location.pathname;
  const visibleItems = NAV_ITEMS.filter((item) => !item.adminOnly || user?.role === 'admin');
  const isActive = (item: NavItem) =>
    typeof item.match === 'function' ? item.match(currentPath) : currentPath === item.path;

  return (
    <nav className="bg-card border-b border-border shadow-sm">
      <div className="max-w-7xl mx-auto px-4 py-3">
        {/* Top row: brand on left, account/utility on right */}
        <div className="flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => navigate('/admin/quotes')}
            className="flex items-center gap-3 group flex-shrink-0"
            aria-label="Admin home"
          >
            <img src="/ntm-logo.png" alt="" className="w-9 h-9 drop-shadow-md" />
            <span className="hidden sm:inline text-base font-semibold text-foreground tracking-wide whitespace-nowrap">
              NTM Admin
            </span>
          </button>

          <div className="flex items-center gap-2">
            {/* Always-visible CTA in NTM orange (bg-primary) so staff can
                spin up a quote from any admin page in one click. */}
            <Button
              onClick={() => navigate('/admin/quotes/new')}
              className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-md font-semibold"
            >
              <PlusCircle className="w-5 h-5 mr-2" />
              <span>Create Quote</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/')}>
              <ExternalLink className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">View Site</span>
            </Button>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Logout</span>
            </Button>
          </div>
        </div>

        {/* Bottom row: section navigation. Horizontally scrollable on narrow screens. */}
        <div className="mt-3 -mx-4 px-4 overflow-x-auto">
          <div className="flex gap-1 min-w-max">
            {visibleItems.map((item) => (
              <Button
                key={item.path}
                variant={isActive(item) ? 'default' : 'ghost'}
                size="sm"
                onClick={() => navigate(item.path)}
                className="whitespace-nowrap"
              >
                {item.label}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default AdminNav;
