import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { LogOut, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

const AdminNav = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/admin/login');
    toast.success('Logged out successfully');
  };

  const currentPath = window.location.pathname;

  return (
    <nav className="bg-card border-b border-border shadow-sm">
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/ntm-logo.png"
              alt=""
              className="w-9 h-9 drop-shadow-md"
            />
            <h1 className="text-2xl font-bold text-foreground">Admin Dashboard</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex gap-2">
              <Button
                variant={currentPath === '/admin/quotes' ? 'default' : 'ghost'}
                onClick={() => navigate('/admin/quotes')}
              >
                Quotes
              </Button>
              <Button
                variant={currentPath === '/admin/packages' ? 'default' : 'ghost'}
                onClick={() => navigate('/admin/packages')}
              >
                Packages
              </Button>
              <Button
                variant={currentPath === '/admin/addons' ? 'default' : 'ghost'}
                onClick={() => navigate('/admin/addons')}
              >
                Add-Ons
              </Button>
              <Button
                variant={currentPath === '/admin/promo-codes' ? 'default' : 'ghost'}
                onClick={() => navigate('/admin/promo-codes')}
              >
                Promo Codes
              </Button>
              <Button
                variant={currentPath === '/admin/terms' ? 'default' : 'ghost'}
                onClick={() => navigate('/admin/terms')}
              >
                Terms
              </Button>
              <Button
                variant={currentPath === '/admin/integrations' ? 'default' : 'ghost'}
                onClick={() => navigate('/admin/integrations')}
              >
                Integrations
              </Button>
              <Button
                variant={currentPath === '/admin/cw-reference-ids' ? 'default' : 'ghost'}
                onClick={() => navigate('/admin/cw-reference-ids')}
              >
                CW IDs
              </Button>
              <Button
                variant={currentPath.startsWith('/admin/contracts') ? 'default' : 'ghost'}
                onClick={() => navigate('/admin/contracts/preview')}
              >
                Contract
              </Button>
              <Button
                variant={currentPath === '/admin/account' ? 'default' : 'ghost'}
                onClick={() => navigate('/admin/account')}
              >
                Account
              </Button>
            </div>
            <div className="flex gap-2 border-l pl-4">
              <Button variant="outline" onClick={() => navigate('/')}>
                <ExternalLink className="w-4 h-4 mr-2" />
                View Site
              </Button>
              <Button variant="outline" onClick={handleLogout}>
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default AdminNav;
