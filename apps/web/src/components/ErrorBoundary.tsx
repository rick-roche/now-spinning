import React from "react";
import { Button, Callout, Container, Flex, Heading, Text } from "@radix-ui/themes";

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary component to catch and display React errors gracefully.
 * Provides user-friendly error messages and recovery options.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
    // Reload the page to reset state
    window.location.href = "/";
  };

  handleReload = (): void => {
    window.location.reload();
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      const isDev = import.meta.env.DEV;
      
      return (
        <Container size="2" style={{ paddingTop: "2rem" }}>
          <Flex direction="column" gap="4">
            <Callout.Root color="red" size="3">
              <Callout.Text>
                <Heading size="4" mb="2">Something went wrong</Heading>
                <Text size="2">
                  The application encountered an unexpected error. 
                  This has been logged and you can try reloading the page.
                </Text>
              </Callout.Text>
            </Callout.Root>

            {isDev && this.state.error && (
              <Callout.Root color="gray" size="2">
                <Callout.Text>
                  <Text size="1" style={{ fontFamily: "monospace", wordBreak: "break-word" }}>
                    {this.state.error.message}
                    {this.state.error.stack && (
                      <pre style={{ marginTop: "0.5rem", fontSize: "0.75rem", overflow: "auto" }}>
                        {this.state.error.stack}
                      </pre>
                    )}
                  </Text>
                </Callout.Text>
              </Callout.Root>
            )}

            <Flex gap="3" justify="center">
              <Button variant="soft" onClick={this.handleReload}>
                Reload Page
              </Button>
              <Button variant="outline" onClick={this.handleReset}>
                Go to Home
              </Button>
            </Flex>
          </Flex>
        </Container>
      );
    }

    return this.props.children;
  }
}
