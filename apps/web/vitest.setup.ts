import "@testing-library/jest-dom";
import packageJson from "../../package.json" with { type: "json" };

// Provide __APP_VERSION__ for tests (normally injected by Vite's define)
(globalThis as Record<string, unknown>).__APP_VERSION__ = `${packageJson.version}+development`;
