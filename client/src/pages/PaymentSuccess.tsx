import { useSearchParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CheckCircle } from 'lucide-react';
import { SiteHeader } from '@/components/SiteHeader';

export default function PaymentSuccess() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const paymentId = searchParams.get('payment_id') || searchParams.get('id');

  const displayId = sessionId || paymentId;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="flex items-center justify-center px-4 py-20">
      <Card className="max-w-md w-full p-8 text-center animate-fade-in">
        <div className="mb-6">
          <div className="w-16 h-16 bg-green-100 dark:bg-green-950/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-500" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">
            Payment Successful! 🎉
          </h1>
          <p className="text-muted-foreground">
            Thank you for your purchase. Your payment has been processed successfully.
          </p>
        </div>
        
        {displayId && (
          <div className="bg-muted rounded-lg p-4 mb-6">
            <p className="text-sm text-muted-foreground mb-1">
              {sessionId ? 'Session ID' : 'Payment ID'}
            </p>
            <p className="text-sm font-mono text-foreground break-all">{displayId}</p>
          </div>
        )}
        
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            A confirmation email has been sent to your inbox with all the details.
          </p>
          <Button asChild className="w-full">
            <Link to="/">Return to Home</Link>
          </Button>
        </div>
      </Card>
      </div>
    </div>
  );
}
