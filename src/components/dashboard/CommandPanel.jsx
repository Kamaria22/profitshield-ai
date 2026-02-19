import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { createPageUrl } from '@/components/platformContext';

export default function CommandPanel({ 
  title, 
  icon: Icon, 
  iconColor = 'emerald',
  children, 
  ctaLabel = 'View Details',
  ctaPage,
  lastUpdated,
  loading = false,
  className = ''
}) {
  const iconColors = {
    emerald: 'from-emerald-500 to-teal-600',
    blue: 'from-blue-500 to-indigo-600',
    amber: 'from-amber-500 to-orange-600',
    red: 'from-red-500 to-rose-600',
    violet: 'from-violet-500 to-purple-600',
    slate: 'from-slate-500 to-slate-700'
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      transition={{ type: 'spring', stiffness: 300 }}
      className={className}
    >
      <Card className="h-full bg-white border-slate-200/80 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
        <CardContent className="p-4 h-full flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className={`p-1.5 rounded-lg bg-gradient-to-br ${iconColors[iconColor]} shadow-sm`}>
                <Icon className="w-4 h-4 text-white" />
              </div>
              <h3 className="font-semibold text-sm text-slate-800">{title}</h3>
            </div>
            {lastUpdated && (
              <span className="text-[10px] text-slate-400">
                {lastUpdated}
              </span>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-h-0">
            {loading ? (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
              </div>
            ) : (
              children
            )}
          </div>

          {/* CTA */}
          {ctaPage && (
            <Link to={createPageUrl(ctaPage)} className="mt-3 block">
              <Button 
                variant="ghost" 
                size="sm" 
                className="w-full justify-between text-xs text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 h-8"
              >
                {ctaLabel}
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

// Skeleton loader for panels
export function CommandPanelSkeleton() {
  return (
    <Card className="h-full bg-white border-slate-200/80 animate-pulse">
      <CardContent className="p-4 h-full">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg bg-slate-200" />
          <div className="w-24 h-4 rounded bg-slate-200" />
        </div>
        <div className="space-y-2">
          <div className="w-full h-6 rounded bg-slate-100" />
          <div className="w-3/4 h-4 rounded bg-slate-100" />
          <div className="w-1/2 h-4 rounded bg-slate-100" />
        </div>
      </CardContent>
    </Card>
  );
}