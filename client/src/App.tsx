import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QuoteProvider } from "./contexts/QuoteContext";
import { AuthProvider } from "./contexts/AuthContext";
import { AiChatProvider } from "./contexts/AiChatContext";
import { AiChatWidget } from "./components/AiChatWidget";
import QuoteBuilder from "./pages/QuoteBuilder";
import QuoteInfo from "./pages/QuoteInfo";
import Summary from "./pages/Summary";
import Terms from "./pages/Terms";
import QuoteReview from "./pages/QuoteReview";
import PaymentSuccess from "./pages/PaymentSuccess";
import PaymentCancelled from "./pages/PaymentCancelled";
import Login from "./pages/admin/Login";
import TwoFactorSetup from "./pages/admin/TwoFactorSetup";
import AcceptInvite from "./pages/admin/AcceptInvite";
import SsoGhl from "./pages/admin/SsoGhl";
import Users from "./pages/admin/Users";
import PackageManagement from "./pages/admin/PackageManagement";
import AddonManagement from "./pages/admin/AddonManagement";
import PromoCodeManagement from "./pages/admin/PromoCodeManagement";
import TermsManagement from "./pages/admin/TermsManagement";
import SiteContentManagement from "./pages/admin/SiteContentManagement";
import QuoteManagement from "./pages/admin/QuoteManagement";
import IntegrationSettings from "./pages/admin/IntegrationSettings";
import CwReferenceData from "./pages/admin/CwReferenceData";
import AiChatSettings from "./pages/admin/AiChatSettings";
import Account from "./pages/admin/Account";
import ContractPreview from "./pages/admin/ContractPreview";
import QuoteDetail from "./pages/admin/QuoteDetail";
import Logs from "./pages/admin/Logs";
import CreateQuote from "./pages/admin/CreateQuote";
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
            <AiChatProvider>
              <Routes>
                <Route path="/" element={<Navigate to="/quote-builder" replace />} />
                <Route path="/quote-builder" element={<QuoteBuilder />} />
                <Route path="/quote-info" element={<QuoteInfo />} />
                <Route path="/summary" element={<Summary />} />
                <Route path="/terms" element={<Terms />} />
                <Route path="/quote-review" element={<QuoteReview />} />
                <Route path="/payment-success" element={<PaymentSuccess />} />
                <Route path="/payment-cancelled" element={<PaymentCancelled />} />
                <Route path="/quote-lookup" element={<QuoteLookup />} />
                <Route path="/admin/login" element={<Login />} />
                <Route path="/admin/2fa-setup" element={<TwoFactorSetup />} />
                <Route path="/admin/accept-invite" element={<AcceptInvite />} />
                <Route path="/sso/ghl" element={<SsoGhl />} />
                <Route path="/admin/users" element={<Users />} />
                <Route path="/admin/quotes" element={<QuoteManagement />} />
                <Route path="/admin/quotes/new" element={<CreateQuote />} />
                <Route path="/admin/quotes/:id" element={<QuoteDetail />} />
                <Route path="/admin/logs" element={<Logs />} />
                <Route path="/admin/integrations" element={<IntegrationSettings />} />
                <Route path="/admin/cw-reference-ids" element={<CwReferenceData />} />
                <Route path="/admin/ai-chat" element={<AiChatSettings />} />
                <Route path="/admin/account" element={<Account />} />
                <Route path="/admin/contracts/preview" element={<ContractPreview />} />
                <Route path="/admin/contracts/preview/:quoteNumber" element={<ContractPreview />} />
                <Route path="/admin/packages" element={<PackageManagement />} />
                <Route path="/admin/addons" element={<AddonManagement />} />
                <Route path="/admin/promo-codes" element={<PromoCodeManagement />} />
                <Route path="/admin/terms" element={<TermsManagement />} />
                <Route path="/admin/site-content" element={<SiteContentManagement />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
              <AiChatWidget />
            </AiChatProvider>
          </BrowserRouter>
        </TooltipProvider>
      </QuoteProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
