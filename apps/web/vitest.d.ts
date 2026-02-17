/* eslint-disable @typescript-eslint/no-explicit-any */
import "@testing-library/jest-dom";

declare global {
  interface Assertion {
    toBeInTheDocument(): void;
    toHaveAttribute(attr: string, value?: string): void;
    toBeVisible(): void;
    toBeDisabled(): void;
    toBeEnabled(): void;
    toBeEmpty(): void;
    toContainElement(element: Element | null): void;
    toContainHTML(html: string): void;
    toHaveClass(className: string): void;
    toHaveFormValues(values: Record<string, any>): void;
    toHaveStyle(style: string | Record<string, any>): void;
    toHaveTextContent(text: string | RegExp): void;
    toHaveValue(value: string | number | boolean): void;
    toBeChecked(): void;
    toBePartiallyChecked(): void;
    toHaveFocus(): void;
    toBeRequired(): void;
    toBeInvalid(): void;
    toBeValid(): void;
  }
}

export {};
