import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import { Container, Flex, Heading, Text } from "@radix-ui/themes";
import { Home } from "../pages/Home";
import { Settings } from "../pages/Settings";
import { Collection } from "../pages/Collection";
import { Search } from "../pages/Search";
import { Release } from "../pages/Release";
import { SessionPage } from "../pages/Session";
import { ErrorBoundary } from "../components/ErrorBoundary";

export function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AppShell />
      </BrowserRouter>
    </ErrorBoundary>
  );
}

function AppShell() {
  const location = useLocation();
  const navItems = [
    { label: "Home", to: "/" },
    { label: "Search", to: "/search" },
    { label: "Session", to: "/session" },
    { label: "Settings", to: "/settings" },
  ];
  const path = location.pathname;
  const isActive = (to: string) => {
    if (to === "/") {
      return path === "/";
    }
    if (to === "/search") {
      return path.startsWith("/search") || path.startsWith("/collection") || path.startsWith("/release");
    }
    return path.startsWith(to);
  };

  return (
    <div className="app-shell">
      <Container size="3" px="4" pt="5" pb="6">
        <Flex direction="column" gap="5">
          <header className="top-header">
            <div className="top-header-title">
              <Text className="top-header-kicker">Now Spinning</Text>
              <Heading size="7">Vinyl Scrobbler</Heading>
            </div>
            <Text size="2" color="gray">
              Mobile first
            </Text>
          </header>

          <main className="app-main">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/search" element={<Search />} />
              <Route path="/collection" element={<Collection />} />
              <Route path="/release/:id" element={<Release />} />
              <Route path="/session" element={<SessionPage />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </main>
        </Flex>
      </Container>

      <nav className="bottom-nav" aria-label="Primary">
        <div className="bottom-nav-list">
          {navItems.map((item) => {
            const active = isActive(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className="bottom-nav-link"
                data-active={active}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
