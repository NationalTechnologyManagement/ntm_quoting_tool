import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Loader2, Search, FileText, ArrowRight } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { quoteLookupApi } from '@/services/api';
import { SiteHeader } from '@/components/SiteHeader';

interface QuoteResult {
  quoteNumber: string;
  status: string;
  businessName: string;
  packageName: string;
  grandTotal: number;
  recurringCosts: number;
  createdAt: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'bg-gray-100 text-gray-800' },
  sent: { label: 'Sent', color: 'bg-blue-100 text-blue-800' },
  accepted: { label: 'Accepted', color: 'bg-yellow-100 text-yellow-800' },
  checkout_pending: { label: 'Awaiting Payment', color: 'bg-orange-100 text-orange-800' },
  paid: { label: 'Paid', color: 'bg-green-100 text-green-800' },
  expired: { label: 'Expired', color: 'bg-red-100 text-red-800' },
};

export default function QuoteLookup() {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState(searchParams.get('email') || '');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<QuoteResult[] | null>(null);

  // Auto-search if email was passed via URL
  useEffect(() => {
    const emailParam = searchParams.get('email');
    if (emailParam) {
      setEmail(emailParam);
      handleSearchWithEmail(emailParam);
    }
  }, []);

  const handleSearchWithEmail = async (searchEmail: string) => {
    try {
      setLoading(true);
      const data = await quoteLookupApi.byEmail(searchEmail.trim());
      setResults(data.quotes);
      if (data.quotes.length === 0) {
        toast({ title: 'No quotes found', description: 'No quotes were found for this email address.' });
      }
    } catch {
      toast({ title: 'Error', description: 'Unable to look up quotes. Please try again.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!email.trim()) {
      toast({ title: 'Email required', description: 'Please enter the email used for your quote.', variant: 'destructive' });
      return;
    }
    await handleSearchWithEmail(email);
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="max-w-2xl mx-auto py-12 px-4">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2">Find Your Quote</h1>
          <p className="text-muted-foreground">
            Enter the email address used when your quote was created to view your quotes.
          </p>
        </div>

        <Card className="p-6 mb-8">
          <div className="space-y-4">
            <div>
              <Label htmlFor="email">Email Address</Label>
              <div className="flex gap-2 mt-2">
                <Input
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  disabled={loading}
                />
                <Button onClick={handleSearch} disabled={loading}>
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {results !== null && (
          results.length === 0 ? (
            <Card className="p-8 text-center">
              <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-medium mb-2">No Quotes Found</h3>
              <p className="text-muted-foreground mb-4">
                We couldn't find any quotes associated with this email.
              </p>
              <Button asChild>
                <Link to="/quote-builder">Create a New Quote</Link>
              </Button>
            </Card>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Found {results.length} quote{results.length !== 1 ? 's' : ''}
              </p>
              {results.map((q) => {
                const statusInfo = STATUS_LABELS[q.status] || { label: q.status, color: '' };
                return (
                  <Card key={q.quoteNumber} className="p-5 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="font-mono font-semibold">{q.quoteNumber}</span>
                          <Badge className={statusInfo.color} variant="secondary">
                            {statusInfo.label}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{q.businessName}</p>
                        <div className="flex gap-4 mt-2 text-sm">
                          <span>
                            <span className="text-muted-foreground">Package:</span>{' '}
                            <span className="font-medium">{q.packageName}</span>
                          </span>
                          <span>
                            <span className="text-muted-foreground">Recurring:</span>{' '}
                            <span className="font-medium">${q.recurringCosts.toFixed(2)}/mo</span>
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Created {new Date(q.createdAt).toLocaleDateString('en-US', {
                            month: 'long', day: 'numeric', year: 'numeric',
                          })}
                        </p>
                      </div>
                      <Button asChild variant="outline" size="sm">
                        <Link to={`/quote-review?id=${q.quoteNumber}`}>
                          View <ArrowRight className="w-4 h-4 ml-1" />
                        </Link>
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )
        )}

        <div className="text-center mt-8">
          <Button variant="ghost" asChild>
            <Link to="/">Back to Home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
