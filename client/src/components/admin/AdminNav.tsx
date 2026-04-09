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
          <h1 className="text-2xl font-bold text-foreground">Admin Dashboard</h1>
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
