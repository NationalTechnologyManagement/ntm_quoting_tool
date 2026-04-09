import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { XCircle } from 'lucide-react';

export default function PaymentCancelled() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <Card className="max-w-md w-full p-8 text-center animate-fade-in">
        <div className="mb-6">
          <div className="w-16 h-16 bg-yellow-100 dark:bg-yellow-950/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <XCircle className="w-8 h-8 text-yellow-600 dark:text-yellow-500" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">
            Payment Cancelled
          </h1>
          <p className="text-muted-foreground">
            Your payment was cancelled. No charges have been made.
          </p>
        </div>
        
        <div className="space-y-3">
          <Button asChild className="w-full">
            <Link to="/quote-builder">← Return to Quote Builder</Link>
          </Button>
          <Button asChild variant="secondary" className="w-full">
            <Link to="/">Go to Home</Link>
          </Button>
        </div>
      </Card>
    </div>
  );
}
