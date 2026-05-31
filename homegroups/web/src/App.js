import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Header from "./components/Header";
import Footer from "./components/Footer";
import HomePage from "./pages/HomePage";
import FeaturesPage from "./pages/FeaturesPage";
import PricingPage from "./pages/PricingPage";
import AboutPage from "./pages/AboutPage";
import ContactPage from "./pages/ContactPage";
import PrivacyPage from "./pages/PrivacyPage";
import TermsPage from "./pages/TermsPage";
import NotFoundPage from "./pages/NotFoundPage";
import GroupProfilePage from "./pages/GroupProfilePage";
import ClaimGroupPage from "./pages/ClaimGroupPage";
import StripeRedirectPage from "./pages/StripeRedirectPage";
import SubscribePage from "./pages/SubscribePage";
import BillingPage from "./pages/BillingPage";
import TreatmentCentersPage from "./pages/TreatmentCentersPage";
import IntergroupsPage from "./pages/IntergroupsPage";
import IntergroupSuccessPage from "./pages/IntergroupSuccessPage";
import IntergroupCancelPage from "./pages/IntergroupCancelPage";
import TreatmentCenterSuccessPage from "./pages/TreatmentCenterSuccessPage";
import TreatmentCenterCancelPage from "./pages/TreatmentCenterCancelPage";
import FacilityDashboardPage from "./pages/FacilityDashboardPage";
import JoinGroupPage from "./pages/JoinGroupPage";

function App() {
  return (
    <Router>
      <Routes>
        {/* Standalone pages (no header/footer - for WebView/embedded use) */}
        <Route path="/subscribe" element={<SubscribePage />} />
        <Route path="/billing" element={<BillingPage />} />
        <Route path="/stripe-redirect" element={<StripeRedirectPage />} />
        <Route path="/intergroup-success" element={<IntergroupSuccessPage />} />
        <Route path="/intergroup-cancel" element={<IntergroupCancelPage />} />
        <Route
          path="/treatment-center-success"
          element={<TreatmentCenterSuccessPage />}
        />
        <Route
          path="/treatment-center-cancel"
          element={<TreatmentCenterCancelPage />}
        />
        <Route path="/facility-dashboard" element={<FacilityDashboardPage />} />
        <Route path="/join/:code" element={<JoinGroupPage />} />

        {/* Main site pages with header/footer */}
        <Route
          path="*"
          element={
            <div className="app">
              <Header />
              <main>
                <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/features" element={<FeaturesPage />} />
                  <Route path="/pricing" element={<PricingPage />} />
                  <Route
                    path="/for-treatment-centers"
                    element={<TreatmentCentersPage />}
                  />
                  <Route
                    path="/for-intergroups"
                    element={<IntergroupsPage />}
                  />
                  <Route path="/about" element={<AboutPage />} />
                  <Route path="/contact" element={<ContactPage />} />
                  <Route path="/privacy" element={<PrivacyPage />} />
                  <Route path="/terms" element={<TermsPage />} />
                  <Route path="/groups/:id" element={<GroupProfilePage />} />
                  <Route
                    path="/groups/:id/claim"
                    element={<ClaimGroupPage />}
                  />
                  <Route path="*" element={<NotFoundPage />} />
                </Routes>
              </main>
              <Footer />
            </div>
          }
        />
      </Routes>
    </Router>
  );
}

export default App;
