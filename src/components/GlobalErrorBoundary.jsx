import React from 'react';
import { AlertTriangle, RefreshCw, Copy, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { maskEmail, maskDomain } from '@/components/utils/safeLog';

/**
 * Global Error Boundary with copyable debug payload
 * Captures errors with full context for debugging
 */
class GlobalErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null, 
      errorInfo: null,
      copied: false
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    
    // Log to console with safe masking
    console.error('[GlobalErrorBoundary] Caught error:', {
      message: error?.message,
      stack: error?.stack?.slice(0, 500),
      componentStack: errorInfo?.componentStack?.slice(0, 500)
    });
  }

  getDebugPayload() {
    const { error, errorInfo } = this.state;
    const { resolverContext = {} } = this.props;
    
    return {
      timestamp: new Date().toISOString(),
      error: {
        message: error?.message || 'Unknown error',
        name: error?.name || 'Error',
        stack: error?.stack?.slice(0, 1000) || 'No stack trace'
      },
      componentStack: errorInfo?.componentStack?.slice(0, 500) || 'No component stack',
      context: {
        route: typeof window !== 'undefined' ? window.location.pathname : 'unknown',
        search: typeof window !== 'undefined' ? window.location.search : '',
        userEmail: resolverContext.userEmail ? maskEmail(resolverContext.userEmail) : 'unknown',
        platform: resolverContext.platform || 'unknown',
        storeKey: resolverContext.storeKey ? maskDomain(resolverContext.storeKey) : 'unknown',
        tenantId: resolverContext.tenantId ? `${resolverContext.tenantId.slice(0, 8)}...` : 'unknown',
        integrationId: resolverContext.integrationId ? `${resolverContext.integrationId.slice(0, 8)}...` : 'unknown',
        resolverStatus: resolverContext.status || 'unknown'
      },
      browser: typeof navigator !== 'undefined' ? {
        userAgent: navigator.userAgent,
        language: navigator.language
      } : {},
      viewport: typeof window !== 'undefined' ? {
        width: window.innerWidth,
        height: window.innerHeight
      } : {}
    };
  }

  handleCopy = async () => {
    try {
      const payload = this.getDebugPayload();
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    } catch (e) {
      console.error('Failed to copy:', e);
    }
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <Card className="max-w-lg w-full shadow-xl">
            <CardContent className="pt-8 pb-6 text-center">
              <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <AlertTriangle className="w-8 h-8 text-red-600" />
              </div>
              
              <h1 className="text-2xl font-bold text-slate-900 mb-2">
                Something went wrong
              </h1>
              <p className="text-slate-500 mb-6">
                We've encountered an unexpected error. Please try reloading the page.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-3 justify-center mb-6">
                <Button 
                  onClick={this.handleReload}
                  className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                >
                  <RefreshCw className="w-4 h-4" />
                  Reload Page
                </Button>
                <Button 
                  variant="outline" 
                  onClick={this.handleCopy}
                  className="gap-2"
                >
                  {this.state.copied ? (
                    <>
                      <CheckCircle className="w-4 h-4 text-emerald-600" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Copy Debug Info
                    </>
                  )}
                </Button>
              </div>
              
              <div className="text-left bg-slate-100 rounded-lg p-4 text-xs font-mono text-slate-600 max-h-32 overflow-auto">
                <p className="text-red-600 font-semibold mb-1">
                  {this.state.error?.message || 'Unknown error'}
                </p>
                <p className="text-slate-400">
                  {this.state.error?.stack?.split('\n')[1]?.trim() || 'No stack trace'}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

export default GlobalErrorBoundary;