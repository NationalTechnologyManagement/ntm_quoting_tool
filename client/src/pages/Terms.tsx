import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuote } from "@/contexts/QuoteContext";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SiteHeader } from "@/components/SiteHeader";

const Terms = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { termsContent, getTermsByVersion } = useQuote();
  
  const requestedVersion = searchParams.get('v');
  const displayTerms = requestedVersion 
    ? getTermsByVersion(requestedVersion) || termsContent 
    : termsContent;
  
  const isHistoricalVersion = requestedVersion && displayTerms.version !== termsContent.version;

  const lastUpdated = new Date(displayTerms.lastUpdated).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <SiteHeader />
      <div className="max-w-4xl mx-auto py-12 px-4">
        <Button
          variant="ghost"
          onClick={() => navigate(-1)}
          className="mb-6"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>

        {isHistoricalVersion && (
          <Alert className="mb-6 border-orange-500/50 bg-orange-500/10">
            <AlertCircle className="h-4 w-4 text-orange-500" />
            <AlertDescription className="text-orange-700 dark:text-orange-400">
              You are viewing a historical version (v{displayTerms.version}) from {lastUpdated}.
              <Button 
                variant="link" 
                className="ml-2 h-auto p-0 text-orange-700 dark:text-orange-400 underline"
                onClick={() => navigate('/terms')}
              >
                View Latest Version
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-3xl font-bold">Terms and Conditions</CardTitle>
            <p className="text-sm text-muted-foreground mt-2">
              Version {displayTerms.version} • Last updated: {lastUpdated}
              {isHistoricalVersion && <span className="ml-2 text-orange-500">(Historical)</span>}
            </p>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none dark:prose-invert">
            <div className="whitespace-pre-wrap">{displayTerms.content}</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Terms;
