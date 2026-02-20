import "@testing-library/jest-dom";

// Provide __APP_VERSION__ for tests (normally injected by Vite's define)
(globalThis as Record<string, unknown>).__APP_VERSION__ = "1.2.0";
