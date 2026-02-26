import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app/App";
import "./styles.css";

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  state = { hasError: false, error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <div style={{ padding: "2rem", fontFamily: "system-ui", color: "#e5e7eb", background: "#020617", minHeight: "100vh" }}>
          <h1 style={{ color: "#f87171" }}>Something went wrong</h1>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: "0.9rem" }}>{this.state.error.message}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

