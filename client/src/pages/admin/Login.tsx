import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Lock, ShieldCheck, Mail, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { authApi } from '@/services/api';

type Stage =
  | { kind: 'password' }
  | {
      kind: 'verify';
      challengeToken: string;
      method: 'totp' | 'email';
      email: string;
    }
  | { kind: 'setup'; setupToken: string; email: string };

const Login = () => {
  const navigate = useNavigate();
  const { login, setSession } = useAuth();
  const [stage, setStage] = useState<Stage>({ kind: 'password' });

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await login(email, password);
      if (result.status === 'ok') {
        toast.success('Welcome back');
        navigate('/admin/packages');
      } else if (result.status === 'needs_2fa') {
        toast.message(
          result.method === 'totp'
            ? 'Enter the code from your authenticator app'
            : 'We just emailed you a 6-digit code',
        );
        setStage({
          kind: 'verify',
          challengeToken: result.challengeToken,
          method: result.method,
          email: result.email,
        });
      } else if (result.status === 'needs_setup') {
        toast.message('Set up two-factor authentication to continue');
        // Route to the setup page with the setup token in URL state.
        navigate('/admin/2fa-setup', {
          state: { setupToken: result.setupToken, email: result.email },
        });
      }
    } catch (e: any) {
      toast.error(e?.message || 'Invalid credentials. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (stage.kind !== 'verify') return;
    setLoading(true);
    try {
      const result = await authApi.verify2fa(stage.challengeToken, code);
      setSession(result.token, result.user);
      toast.success('Logged in');
      navigate('/admin/packages');
    } catch (e: any) {
      toast.error(e?.message || 'Invalid verification code');
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (stage.kind !== 'verify' || stage.method !== 'email') return;
    try {
      await authApi.resendEmailCode(stage.challengeToken);
      toast.success(`New code sent to ${stage.email}`);
    } catch (e: any) {
      toast.error(e?.message || 'Could not resend code');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-hero flex items-center justify-center px-4">
      <Card className="w-full max-w-md p-8 shadow-card-hover animate-scale-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
            {stage.kind === 'verify' ? (
              <ShieldCheck className="w-8 h-8 text-primary" />
            ) : (
              <Lock className="w-8 h-8 text-primary" />
            )}
          </div>
          <h1 className="text-3xl font-bold text-foreground">
            {stage.kind === 'verify' ? 'Two-Factor Verification' : 'Admin Login'}
          </h1>
          <p className="text-muted-foreground mt-2">
            {stage.kind === 'verify'
              ? stage.method === 'totp'
                ? 'Enter the 6-digit code from your authenticator app'
                : `We sent a code to ${stage.email}`
              : 'Access the admin dashboard'}
          </p>
        </div>

        {stage.kind === 'password' && (
          <form onSubmit={handlePasswordSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                placeholder="you@trustntm.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {loading ? 'Signing in…' : 'Sign In'}
            </Button>

            <Button type="button" variant="link" className="w-full" onClick={() => navigate('/')}>
              Back to Home
            </Button>
          </form>
        )}

        {stage.kind === 'verify' && (
          <form onSubmit={handleVerifySubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="code">Verification code</Label>
              <Input
                id="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoFocus
                required
              />
              <p className="text-xs text-muted-foreground">
                Lost your authenticator? Enter one of your recovery codes instead.
              </p>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {loading ? 'Verifying…' : 'Verify & sign in'}
            </Button>

            {stage.method === 'email' && (
              <Button type="button" variant="ghost" className="w-full" onClick={handleResendCode}>
                <Mail className="w-4 h-4 mr-2" /> Resend code
              </Button>
            )}

            <Button
              type="button"
              variant="link"
              className="w-full"
              onClick={() => {
                setStage({ kind: 'password' });
                setCode('');
                setPassword('');
              }}
            >
              Use a different account
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
};

export default Login;
