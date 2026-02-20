import React from 'react';
import { healthAgent } from './HealthAgent';

export class HealthErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    healthAgent.report('error', 'React component crash', error?.stack || String(error), {
      source: 'react.errorBoundary',
      componentStack: String(info?.componentStack || ''),
    });
  }

  render() {
    if (this.state.hasError) return this.props.fallback ?? null;
    return this.props.children;
  }
}