import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { LogOut, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

const NAV_ITEMS = [
  { path: '/admin/quotes', label: 'Quotes', match: (p: string) => p.startsWith('/admin/quotes') },
  { path: '/admin/packages', label: 'Packages' },
  { path: '/admin/addons', label: 'Add-Ons' },
  { path: '/admin/promo-codes', label: 'Promo Codes' },
  { path: '/admin/terms', label: 'Terms' },
  { path: '/admin/integrations', label: 'Integrations' },
  { path: '/admin/cw-reference-ids', label: 'CW IDs' },
  {
    path: '/admin/contracts/preview',
    label: 'Contract',
    match: (p: string) => p.startsWith('/admin/contracts'),
  },
  { path: '/admin/account', label: 'Account' },
] as const;

const AdminNav = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/admin/login');
    toast.success('Logged out successfully');
  };

  const currentPath = window.location.pathname;
  const isActive = (item: (typeof NAV_ITEMS)[number]) =>
    'match' in item && typeof item.match === 'function'
      ? item.match(currentPath)
      : currentPath === item.path;

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
            {NAV_ITEMS.map((item) => (
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
