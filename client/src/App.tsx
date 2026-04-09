import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QuoteProvider } from "./contexts/QuoteContext";
import { AuthProvider } from "./contexts/AuthContext";
import Landing from "./pages/Landing";
import QuoteBuilder from "./pages/QuoteBuilder";
import Summary from "./pages/Summary";
import Terms from "./pages/Terms";
import QuoteReview from "./pages/QuoteReview";
import PaymentSuccess from "./pages/PaymentSuccess";
import PaymentCancelled from "./pages/PaymentCancelled";
import Login from "./pages/admin/Login";
import PackageManagement from "./pages/admin/PackageManagement";
import AddonManagement from "./pages/admin/AddonManagement";
import PromoCodeManagement from "./pages/admin/PromoCodeManagement";
import TermsManagement from "./pages/admin/TermsManagement";
import QuoteManagement from "./pages/admin/QuoteManagement";
import IntegrationSettings from "./pages/admin/IntegrationSettings";
import QuoteLookup from "./pages/QuoteLookup";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <QuoteProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/quote-builder" element={<QuoteBuilder />} />
              <Route path="/summary" element={<Summary />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/quote-review" element={<QuoteReview />} />
              <Route path="/payment-success" element={<PaymentSuccess />} />
              <Route path="/payment-cancelled" element={<PaymentCancelled />} />
              <Route path="/quote-lookup" element={<QuoteLookup />} />
              <Route path="/admin/login" element={<Login />} />
              <Route path="/admin/quotes" element={<QuoteManagement />} />
              <Route path="/admin/integrations" element={<IntegrationSettings />} />
              <Route path="/admin/packages" element={<PackageManagement />} />
              <Route path="/admin/addons" element={<AddonManagement />} />
              <Route path="/admin/promo-codes" element={<PromoCodeManagement />} />
              <Route path="/admin/terms" element={<TermsManagement />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </QuoteProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
