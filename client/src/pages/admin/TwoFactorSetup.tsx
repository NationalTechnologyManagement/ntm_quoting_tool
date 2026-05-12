import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { ShieldCheck, Smartphone, Mail, Loader2, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { authApi } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';

type Method = 'totp' | 'email';

interface LocationState {
  setupToken?: string;
  email?: string;
}

const TwoFactorSetup = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { setSession } = useAuth();

  const state = (location.state as LocationState) || {};
  const setupToken = state.setupToken;
  const email = state.email;

  const [method, setMethod] = useState<Method | null>(null);
  const [totpData, setTotpData] = useState<{
    secret: string;
    qrDataUrl: string;
    otpauthUri: string;
  } | null>(null);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [secretCopied, setSecretCopied] = useState(false);

  // Final-screen state: show recovery codes once.
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [pendingAuth, setPendingAuth] = useState<{
    token: string;
    user: { id: string; email: string; role: string; name: string | null };
  } | null>(null);

  useEffect(() => {
    if (!setupToken) {
      toast.error('No setup session — please log in again');
      navigate('/admin/login');
    }
  }, [setupToken, navigate]);

  const chooseMethod = async (m: Method) => {
    if (!setupToken) return;
    setMethod(m);
    setLoading(true);
    try {
      const result = await authApi.setup2faStart(setupToken, m);
      if (result.method === 'totp') {
        setTotpData({
          secret: result.secret,
          qrDataUrl: result.qrDataUrl,
          otpauthUri: result.otpauthUri,
        });
      }
    } catch (e: any) {
      toast.error(e?.message || 'Failed to start 2FA setup');
      setMethod(null);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!setupToken || !method) return;
    setLoading(true);
    try {
      const result = await authApi.setup2faConfirm(setupToken, method, code);
      setRecoveryCodes(result.recoveryCodes);
      setPendingAuth({ token: result.token, user: result.user });
      toast.success('Two-factor authentication enabled');
    } catch (e: any) {
      toast.error(e?.message || 'Invalid code — try again');
    } finally {
      setLoading(false);
    }
  };

  const handleFinish = () => {
    if (!pendingAuth) return;
    setSession(pendingAuth.token, pendingAuth.user);
    navigate('/admin/packages');
  };

  const copySecret = () => {
    if (!totpData) return;
    navigator.clipboard.writeText(totpData.secret).then(() => {
      setSecretCopied(true);
      setTimeout(() => setSecretCopied(false), 1500);
    });
  };

  return (
    <div className="min-h-screen bg-gradient-hero flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-lg p-8 shadow-card-hover">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 mb-3">
            <ShieldCheck className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Set up two-factor authentication</h1>
          <p className="text-muted-foreground text-sm mt-2">
            Required for {email ?? 'your account'}. You only do this once.
          </p>
        </div>

        {!method && (
          <div className="space-y-3">
            <Button
              variant="outline"
              className="w-full h-auto py-4 flex items-start gap-3 text-left"
              onClick={() => chooseMethod('totp')}
            >
              <Smartphone className="w-6 h-6 text-primary flex-shrink-0 mt-0.5" />
              <span className="flex-1">
                <span className="block font-medium">Authenticator app (recommended)</span>
                <span className="block text-xs text-muted-foreground">
                  Google Authenticator, Authy, 1Password, etc. Works offline.
                </span>
              </span>
            </Button>
            <Button
              variant="outline"
              className="w-full h-auto py-4 flex items-start gap-3 text-left"
              onClick={() => chooseMethod('email')}
            >
              <Mail className="w-6 h-6 text-primary flex-shrink-0 mt-0.5" />
              <span className="flex-1">
                <span className="block font-medium">Email codes</span>
                <span className="block text-xs text-muted-foreground">
                  Receive a fresh 6-digit code in {email ?? 'your inbox'} every sign in.
                </span>
              </span>
            </Button>
          </div>
        )}

        {method && !recoveryCodes && (
          <form onSubmit={handleConfirm} className="space-y-5">
            {method === 'totp' && totpData && (
              <div className="space-y-3">
                <p className="text-sm">
                  Scan this QR code with your authenticator app, then enter the 6-digit code it shows.
                </p>
                <div className="flex justify-center">
                  <img
                    src={totpData.qrDataUrl}
                    alt="2FA QR code"
                    className="border rounded-md p-2 bg-white"
                  />
                </div>
                <div className="text-xs text-muted-foreground">
                  Can't scan? Enter this secret manually:
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs break-all bg-muted px-3 py-2 rounded">
                    {totpData.secret}
                  </code>
                  <Button type="button" variant="outline" size="sm" onClick={copySecret}>
                    {secretCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  </Button>
                </div>
              </div>
            )}

            {method === 'email' && (
              <p className="text-sm">
                We sent a 6-digit code to <strong>{email}</strong>. Enter it below to finish setup.
              </p>
            )}

            <div className="space-y-2">
              <Label htmlFor="setup-code">Enter the code</Label>
              <Input
                id="setup-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                required
                autoFocus
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {loading ? 'Verifying…' : 'Enable 2FA'}
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => {
                setMethod(null);
                setTotpData(null);
                setCode('');
              }}
            >
              Choose a different method
            </Button>
          </form>
        )}

        {recoveryCodes && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Save your recovery codes</h2>
            <p className="text-sm text-muted-foreground">
              Each code can be used once if you lose access to your second factor.{' '}
              <strong>Print them or store them in a password manager — they will not be shown again.</strong>
            </p>
            <div className="grid grid-cols-2 gap-2 bg-muted p-4 rounded-md font-mono text-sm">
              {recoveryCodes.map((c) => (
                <code key={c}>{c}</code>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => navigator.clipboard.writeText(recoveryCodes.join('\n'))}
            >
              <Copy className="w-4 h-4 mr-2" /> Copy all
            </Button>
            <Button className="w-full" onClick={handleFinish}>
              I've saved them — continue
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
};

export default TwoFactorSetup;
