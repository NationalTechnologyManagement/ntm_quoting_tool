// GHL embedded-iframe SSO landing.
//
// GHL Custom Menu Link points to /sso/ghl?loc=...&k=... — this page picks
// up those params, asks the server "do you trust this device?", and either:
//   - silently redirects into the admin portal (returning user), or
//   - prompts for email + 6-digit code to enroll the browser (first time).
//
// After successful check or verify we drop the session JWT into localStorage
// too so the existing Bearer-token API client works for non-cookie paths.

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { ssoApi } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Loader2, Mail, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

const LANDING = '/admin/quotes';

type Stage =
  | { kind: 'checking' }
  | { kind: 'enroll-email' }
  | { kind: 'enroll-code' }
  | { kind: 'config-error'; message: string };

const SsoGhl = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { setSession } = useAuth();

  const loc = params.get('loc') || '';
  const k = params.get('k') || '';

  const [stage, setStage] = useState<Stage>({ kind: 'checking' });
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  // Whether the user chose to verify with their authenticator app (TOTP)
  // instead of an emailed code — only affects the on-screen copy; the server
  // accepts either code at the verify step.
  const [usingAuthenticator, setUsingAuthenticator] = useState(false);

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  // ── Step 1: probe device cookie on mount ──────────────────────────
  useEffect(() => {
    if (!loc || !k) {
      setStage({
        kind: 'config-error',
        message: 'Missing SSO parameters. Re-open from the GHL menu.',
      });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const result = await ssoApi.check(loc, k);
        if (cancelled) return;
        if (result.ready) {
          setSession(result.token, result.user);
          navigate(LANDING, { replace: true });
        } else {
          setStage({ kind: 'enroll-email' });
        }
      } catch (e: any) {
        if (cancelled) return;
        setStage({
          kind: 'config-error',
          message: e?.message || 'Could not establish an SSO session.',
        });
      }
    })();
    return () => {
      cancelled = true;
    };
    // loc/k come from query string; setSession + navigate are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc, k]);

  // ── Step 2: user enters email, we email them a code ───────────────
  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await ssoApi.start(loc, k, email);
      // Server always returns 200 even for unknown emails to avoid leaking
      // which addresses belong to admins. Move to the code stage regardless.
      toast.message(`If ${email} is an admin, a code is on its way.`);
      setUsingAuthenticator(false);
      setStage({ kind: 'enroll-code' });
    } catch (e: any) {
      toast.error(e?.message || 'Could not send code');
    } finally {
      setLoading(false);
    }
  };

  // Authenticator path: skip the emailed code entirely and go straight to the
  // code entry — the user types the current code from their authenticator app.
  // The verify endpoint accepts a valid TOTP for enrolled users.
  const handleUseAuthenticator = () => {
    if (!emailOk) {
      toast.error('Enter your admin email first');
      return;
    }
    setUsingAuthenticator(true);
    setStage({ kind: 'enroll-code' });
  };

  // ── Step 3: user enters code, we mint device + session cookies ────
  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await ssoApi.verify(loc, k, email, code);
      setSession(result.token, result.user);
      toast.success('Device enrolled — welcome!');
      navigate(LANDING, { replace: true });
    } catch (e: any) {
      toast.error(e?.message || 'Invalid code');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    try {
      await ssoApi.start(loc, k, email);
      toast.success('New code sent');
    } catch (e: any) {
      toast.error(e?.message || 'Could not resend code');
    }
  };

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-hero flex items-center justify-center px-4">
      <Card className="w-full max-w-md p-8 shadow-card-hover animate-scale-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
            {stage.kind === 'checking' ? (
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            ) : (
              <ShieldCheck className="w-8 h-8 text-primary" />
            )}
          </div>
          <h1 className="text-3xl font-bold text-foreground">
            {stage.kind === 'checking'
              ? 'Signing you in…'
              : stage.kind === 'config-error'
                ? 'Could not sign you in'
                : stage.kind === 'enroll-code'
                  ? 'Enter your code'
                  : 'Verify this device'}
          </h1>
          <p className="text-muted-foreground mt-2">
            {stage.kind === 'checking'
              ? 'Hold tight — checking if this device is enrolled.'
              : stage.kind === 'config-error'
                ? stage.message
                : stage.kind === 'enroll-code'
                  ? usingAuthenticator
                    ? 'Open your authenticator app and enter the current 6-digit code.'
                    : `We emailed a code to ${email}. Enter it below — or use your authenticator app.`
                  : 'First time on this browser. Enter your admin email and we’ll email a one-time code — or use your authenticator app.'}
          </p>
        </div>

        {stage.kind === 'enroll-email' && (
          <form onSubmit={handleEmailSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email">Admin email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@trustntm.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {loading ? 'Sending…' : 'Email me a code'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={handleUseAuthenticator}
              disabled={loading}
            >
              <ShieldCheck className="w-4 h-4 mr-2" /> Use my authenticator app
            </Button>
          </form>
        )}

        {stage.kind === 'enroll-code' && (
          <form onSubmit={handleCodeSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="code">
                {usingAuthenticator ? 'Authenticator code' : '6-digit code'}
              </Label>
              <Input
                id="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                autoFocus
              />
              {!usingAuthenticator && (
                <p className="text-xs text-muted-foreground">
                  You can also enter the current code from your authenticator app.
                </p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {loading ? 'Verifying…' : 'Verify & sign in'}
            </Button>
            {!usingAuthenticator && (
              <Button type="button" variant="ghost" className="w-full" onClick={handleResend}>
                <Mail className="w-4 h-4 mr-2" /> Resend code
              </Button>
            )}
            <Button
              type="button"
              variant="link"
              className="w-full"
              onClick={() => {
                setCode('');
                setStage({ kind: 'enroll-email' });
              }}
            >
              Use a different email
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
};

export default SsoGhl;
