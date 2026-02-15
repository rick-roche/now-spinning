import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { Container, Flex, Heading } from "@radix-ui/themes";
import { Home } from "../pages/Home";
import { Settings } from "../pages/Settings";
import { Collection } from "../pages/Collection";
import { Search } from "../pages/Search";
import { Release } from "../pages/Release";

export function App() {
  return (
    <BrowserRouter>
      <Container size="2" px="4" py="6">
        <Flex direction="column" gap="6">
          <header>
            <Heading size="8" mb="4">
              Now Spinning
            </Heading>
            <Flex gap="4" asChild>
              <nav>
                <Link to="/">Home</Link>
                <Link to="/search">Search</Link>
                <Link to="/settings">Settings</Link>
              </nav>
            </Flex>
          </header>

          <main>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/search" element={<Search />} />
              <Route path="/collection" element={<Collection />} />
              <Route path="/release/:id" element={<Release />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </main>
        </Flex>
      </Container>
    </BrowserRouter>
  );
}
