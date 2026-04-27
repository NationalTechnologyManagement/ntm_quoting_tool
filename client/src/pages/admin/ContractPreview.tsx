import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, ArrowLeft, FileText, ExternalLink } from 'lucide-react';
import { adminApi } from '@/services/api';
import AdminNav from '@/components/admin/AdminNav';
import { toast } from 'sonner';

const ContractPreview = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [params] = useSearchParams();
  const { quoteNumber: routeQuote } = useParams<{ quoteNumber?: string }>();

  const [quoteInput, setQuoteInput] = useState(routeQuote ?? params.get('q') ?? '');
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadedQuote, setLoadedQuote] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) navigate('/admin/login');
  }, [isAuthenticated, navigate]);

  const fetchPreview = async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    try {
      const html = await adminApi.getContractPreviewHtml(q.trim());
      setHtml(html);
      setLoadedQuote(q.trim());
    } catch (err: any) {
      toast.error(err?.message || 'Could not load preview');
      setHtml(null);
    } finally {
      setLoading(false);
    }
  };

  // If routed in with a quote number / query param, auto-load
  useEffect(() => {
    const initial = routeQuote ?? params.get('q');
    if (initial) fetchPreview(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeQuote]);

  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin/quotes')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Quotes
          </Button>
          <h2 className="text-3xl font-bold">Contract Preview</h2>
        </div>

        <Card className="p-4 mb-4">
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-2">
              <Label htmlFor="quote">Quote number or DB id</Label>
              <Input
                id="quote"
                value={quoteInput}
                onChange={(e) => setQuoteInput(e.target.value)}
                placeholder="QT-20260427-0042"
                onKeyDown={(e) => e.key === 'Enter' && fetchPreview(quoteInput)}
              />
            </div>
            <Button onClick={() => fetchPreview(quoteInput)} disabled={loading || !quoteInput.trim()}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
              Render
            </Button>
          </div>
        </Card>

        {html && (
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between p-3 border-b border-border bg-muted/30">
              <p className="text-sm text-muted-foreground">
                Rendered from <code className="font-mono text-foreground">{loadedQuote}</code> using the same template the
                signed PDF uses.
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const w = window.open('', '_blank');
                  if (w && html) {
                    w.document.write(html);
                    w.document.close();
                  }
                }}
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Open in new tab
              </Button>
            </div>
            <iframe
              title="Contract preview"
              srcDoc={html}
              className="w-full bg-white"
              style={{ minHeight: '80vh' }}
            />
          </Card>
        )}

        {!html && !loading && (
          <Card className="p-12 text-center">
            <FileText className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground">
              Enter a quote number above to preview the rendered contract.
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Or visit <code className="font-mono">/admin/contracts/preview/QT-XXXX</code> directly.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
};

export default ContractPreview;
