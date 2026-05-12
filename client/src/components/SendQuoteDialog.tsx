// Shared dialog for sending a quote to one or more email addresses.
// Used from:
//   - Customer Summary page ("Email Me Quote") — customer can also CC
//     a colleague or sales rep.
//   - Admin QuoteDetail ("Send Quote via Email") — adds an info line
//     about the auto-CCed sales rep when one is assigned.
//
// Always sends to the customer email (server-side guarantee). The dialog
// only collects *extra* recipients, so the customer is never accidentally
// dropped from the To: line.

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Mail } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { quoteApi } from '@/services/api';

export interface SendQuoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quoteNumber: string;
  customerEmail: string;
  // When set, shown as an info line so the user knows a rep is auto-CCed.
  salesRepEmail?: string | null;
  // Variant tweaks the copy and button labels for customer vs. admin.
  variant?: 'customer' | 'admin';
  // Fired after a successful send. Useful for refreshing parent state.
  onSent?: () => void;
}

function parseEmailList(raw: string): string[] {
  return raw
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function isValidEmail(addr: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr);
}

export function SendQuoteDialog({
  open,
  onOpenChange,
  quoteNumber,
  customerEmail,
  salesRepEmail,
  variant = 'admin',
  onSent,
}: SendQuoteDialogProps) {
  const [extraTo, setExtraTo] = useState('');
  const [cc, setCc] = useState('');
  const [sending, setSending] = useState(false);

  const isCustomer = variant === 'customer';

  const handleSend = async () => {
    const additionalTo = parseEmailList(extraTo);
    const ccList = parseEmailList(cc);
    const invalid = [...additionalTo, ...ccList].filter((e) => !isValidEmail(e));
    if (invalid.length) {
      toast.error(`Invalid email address${invalid.length > 1 ? 'es' : ''}: ${invalid.join(', ')}`);
      return;
    }

    setSending(true);
    try {
      const result = await quoteApi.email(quoteNumber, { additionalTo, cc: ccList });
      const recipients = [...(result.to ?? []), ...(result.cc ?? [])];
      toast.success(
        recipients.length > 1
          ? `Quote emailed to ${recipients.length} recipients`
          : `Quote emailed to ${customerEmail}`,
      );
      onOpenChange(false);
      setExtraTo('');
      setCc('');
      onSent?.();
    } catch (e: any) {
      toast.error(e?.message || 'Email send failed');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isCustomer ? 'Email this quote' : 'Send Quote via Email'}</DialogTitle>
          <DialogDescription>
            {isCustomer ? (
              <>
                We'll always send to <span className="font-medium">{customerEmail}</span>. Want to
                loop someone else in (a partner, your accountant, an internal stakeholder)? Add their
                email addresses below.
              </>
            ) : (
              <>
                The customer at <span className="font-medium">{customerEmail}</span> is always
                included
                {salesRepEmail && (
                  <>
                    , and the assigned sales rep{' '}
                    <span className="font-medium">{salesRepEmail}</span> is auto-CCed
                  </>
                )}
                . Add any additional recipients below. Separate addresses with commas, semicolons, or
                spaces.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="sqd-extra-to">
              {isCustomer ? 'Also send to (To)' : 'Additional recipients (To)'}
            </Label>
            <Input
              id="sqd-extra-to"
              placeholder={
                isCustomer
                  ? 'partner@yourcompany.com, accountant@yourcompany.com'
                  : 'ceo@company.com, controller@company.com'
              }
              value={extraTo}
              onChange={(e) => setExtraTo(e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1">
              {isCustomer
                ? 'Anyone on your team who should see this quote.'
                : 'Other decision-makers on the customer side.'}
            </p>
          </div>
          <div>
            <Label htmlFor="sqd-cc">CC{isCustomer ? ' (your NTM rep, optional)' : ' (sales rep, internal)'}</Label>
            <Input
              id="sqd-cc"
              placeholder={isCustomer ? 'rep@trustntm.com' : 'rep@trustntm.com'}
              value={cc}
              onChange={(e) => setCc(e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1">
              {isCustomer
                ? 'CC your NTM sales contact so they can follow up.'
                : 'The assigned sales rep typically goes here so they can follow up.'}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={sending}>
            {sending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Mail className="w-4 h-4 mr-2" />
            )}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
