import React from 'react';
import { healthAgent } from './HealthAgent';
import { publishIncident, SUBSYSTEMS } from '@/components/selfheal/IncidentBus';

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
    publishIncident({
      subsystem: SUBSYSTEMS.GENERAL,
      issue_code: 'REACT_ERROR_BOUNDARY_HIT',
      severity: 'high',
      tenant_id: healthAgent?.resolverContext?.tenantId,
      context: {
        source: 'react.errorBoundary',
        message: error?.message || String(error),
      }
    });
  }

  render() {
    if (this.state.hasError) return this.props.fallback ?? null;
    return this.props.children;
  }
}
