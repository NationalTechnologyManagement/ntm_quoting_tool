import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { UserPlus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { authApi } from '@/services/api';

const AcceptInvite = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [invite, setInvite] = useState<{
    email: string;
    role: string;
    expiresAt: string;
  } | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setLoadError('No invite token in the link');
      return;
    }
    authApi
      .getInvite(token)
      .then((data) => setInvite(data))
      .catch((e: any) => setLoadError(e?.message || 'Invite link is invalid or expired'));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast.error('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    setLoading(true);
    try {
      const result = await authApi.acceptInvite(token, name, password);
      toast.success('Account created — now set up 2FA');
      navigate('/admin/2fa-setup', {
        state: { setupToken: result.setupToken, email: result.email },
        replace: true,
      });
    } catch (e: any) {
      toast.error(e?.message || 'Could not accept invite');
    } finally {
      setLoading(false);
    }
  };

  if (loadError) {
    return (
      <div className="min-h-screen bg-gradient-hero flex items-center justify-center px-4">
        <Card className="w-full max-w-md p-8">
          <h1 className="text-xl font-bold mb-2">Invite unavailable</h1>
          <p className="text-sm text-muted-foreground mb-4">{loadError}</p>
          <Button variant="outline" className="w-full" onClick={() => navigate('/admin/login')}>
            Go to login
          </Button>
        </Card>
      </div>
    );
  }

  if (!invite) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const roleLabel = invite.role === 'admin' ? 'Admin' : 'Sales Rep';

  return (
    <div className="min-h-screen bg-gradient-hero flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md p-8 shadow-card-hover">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 mb-3">
            <UserPlus className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Welcome to NTM</h1>
          <p className="text-muted-foreground text-sm mt-2">
            You've been invited as <strong>{roleLabel}</strong> for{' '}
            <span className="font-medium">{invite.email}</span>. Set up your account below.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Your name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="First Last"
              required
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pw">Password</Label>
            <Input
              id="pw"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            {loading ? 'Creating account…' : 'Create account & set up 2FA'}
          </Button>
        </form>
      </Card>
    </div>
  );
};

export default AcceptInvite;
