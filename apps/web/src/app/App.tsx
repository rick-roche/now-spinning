import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Home } from "../pages/Home";
import { Settings } from "../pages/Settings";
import { Collection } from "../pages/Collection";
import { Release } from "../pages/Release";
import { SessionPage } from "../pages/Session";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { BottomNav } from "../components/BottomNav";
import { OfflineBanner } from "../components/OfflineBanner";
import { SideNav } from "../components/SideNav";
import { useOnlineStatus } from "../hooks/useOnlineStatus";

export function App() {
  const isOnline = useOnlineStatus();

  return (
    <ErrorBoundary>
      <BrowserRouter>
        {/* Skip link for keyboard navigation */}
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:bg-primary focus:text-white focus:px-4 focus:py-2 focus:rounded-lg focus:shadow-lg">
          Skip to main content
        </a>
        {/* SideNav is fixed-position, rendered outside the flow */}
        <SideNav />
        {/* Content area: offset by sidebar on desktop, padded for bottom nav on mobile */}
        <div className="min-h-screen flex flex-col md:ml-56 pb-24 md:pb-0">
          {!isOnline && <OfflineBanner />}
          <main id="main-content" className="flex-1 overflow-y-auto" tabIndex={-1}>
            <Routes>
              <Route path="/" element={<ErrorBoundary><Home /></ErrorBoundary>} />
              <Route path="/collection" element={<ErrorBoundary><Collection /></ErrorBoundary>} />
              <Route path="/search" element={<ErrorBoundary><Collection /></ErrorBoundary>} />
              <Route path="/release/:id" element={<ErrorBoundary><Release /></ErrorBoundary>} />
              <Route path="/session" element={<ErrorBoundary><SessionPage /></ErrorBoundary>} />
              <Route path="/settings" element={<ErrorBoundary><Settings /></ErrorBoundary>} />
            </Routes>
          </main>
          <BottomNav />
        </div>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

