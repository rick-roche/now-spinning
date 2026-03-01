import { useLayoutEffect, useRef, type RefObject } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
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

function ScrollToTopOnNavigate({ targetRef }: { targetRef: RefObject<HTMLElement | null> }) {
  const location = useLocation();

  useLayoutEffect(() => {
    if (!location.pathname.startsWith("/release/")) {
      return;
    }
    const node = targetRef.current;
    if (!node) {
      return;
    }

    requestAnimationFrame(() => {
      node.scrollTop = 0;
      if (typeof node.scrollTo === "function") {
        node.scrollTo({ top: 0, left: 0, behavior: "auto" });
      }
      if (typeof document !== "undefined") {
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
      }
    });
  }, [location.key, targetRef]);

  return null;
}

export function App() {
  const isOnline = useOnlineStatus();
  const mainRef = useRef<HTMLElement | null>(null);

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
          <main ref={mainRef} id="main-content" className="flex-1 overflow-y-auto" tabIndex={-1}>
            <ScrollToTopOnNavigate targetRef={mainRef} />
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

