import React, { useRef, useState, useEffect } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * LazyPanel - Intersection Observer wrapper for deferred panel loading
 * Only imports and renders panel content when visible or after idle
 */
export default function LazyPanel({ 
  loader, 
  fallback = <PanelSkeleton />, 
  rootMargin = '200px',
  ...props 
}) {
  const ref = useRef(null);
  const [isVisible, setIsVisible] = useState(false);
  const [Component, setComponent] = useState(null);

  useEffect(() => {
    if (!ref.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin }
    );

    observer.observe(ref.current);

    return () => observer.disconnect();
  }, [rootMargin]);

  useEffect(() => {
    if (isVisible && !Component) {
      loader().then(mod => setComponent(() => mod.default));
    }
  }, [isVisible, loader, Component]);

  return (
    <div ref={ref}>
      {Component ? <Component {...props} /> : fallback}
    </div>
  );
}

function PanelSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
      <Skeleton className="h-6 w-32" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

export { PanelSkeleton };