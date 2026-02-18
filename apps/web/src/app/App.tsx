import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Home } from "../pages/Home";
import { Settings } from "../pages/Settings";
import { Collection } from "../pages/Collection";
import { Release } from "../pages/Release";
import { SessionPage } from "../pages/Session";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { BottomNav } from "../components/BottomNav";

export function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <div className="min-h-screen flex flex-col pb-24">
          <main className="flex-1 overflow-y-auto">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/collection" element={<Collection />} />
              <Route path="/search" element={<Collection />} />
              <Route path="/release/:id" element={<Release />} />
              <Route path="/session" element={<SessionPage />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </main>
          <BottomNav />
        </div>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

