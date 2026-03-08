import React from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { invokeSelfHealSafe } from "@/lib/safeApi";

export class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    try {
      invokeSelfHealSafe({
        action: "publish_incident",
        subsystem: "frontend",
        error: String(error?.message || error),
        stack: error?.stack,
        componentStack: info?.componentStack,
      }).catch(() => {});
    } catch {}
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
          <div className="max-w-md w-full">
            <div className="rounded-lg border border-red-200 bg-red-50 p-6">
              <div className="flex items-start gap-3 mb-4">
                <AlertTriangle className="w-5 h-5 mt-0.5 text-red-600 flex-shrink-0" />
                <div>
                  <h2 className="font-semibold text-red-900 mb-1">Something went wrong</h2>
                  <p className="text-sm text-red-700 mb-4">
                    We're recovering automatically. Refresh the page if the problem persists.
                  </p>
                  {process.env.NODE_ENV === "development" && this.state.error && (
                    <details className="text-xs text-red-600 mt-2 p-2 bg-red-100 rounded cursor-pointer">
                      <summary className="font-mono">Error details</summary>
                      <pre className="mt-2 overflow-auto">{this.state.error.toString()}</pre>
                    </details>
                  )}
                  <Button
                    onClick={this.handleReload}
                    className="bg-red-600 hover:bg-red-700 gap-2"
                  >
                    <RotateCw className="w-4 h-4" />
                    Reload Page
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
