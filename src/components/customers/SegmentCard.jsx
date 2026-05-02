import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Users, DollarSign, TrendingUp, MoreVertical, Mail, Tag, Trash2, ArrowUpRight, Sparkles, Eye } from 'lucide-react';
import { CommandCard, CommandCardContent, CommandCardHeader, CommandCardTitle } from '@/components/ui/command-card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function SegmentCard({ segment, onView, onAction, onDelete }) {
  const formatCurrency = (val) => `$${(val || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  const previewCustomers = Array.isArray(segment.preview_customers) ? segment.preview_customers.slice(0, 2) : [];
  const trendLabel = segment.total_profit > 0 ? 'Revenue ready' : segment.total_profit < 0 ? 'Margin pressure' : 'Monitor';
  const trendTone = segment.total_profit > 0 ? 'text-emerald-300' : segment.total_profit < 0 ? 'text-red-300' : 'text-amber-300';

  return (
    <CommandCard
      className="group cursor-pointer transition-all duration-150 hover:border-cyan-400/30 hover:bg-white/[0.05] hover:shadow-[0_8px_24px_rgba(14,165,233,0.12)]"
      onClick={() => onView(segment)}
    >
      <CommandCardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div 
              className="w-3 h-3 rounded-full" 
              style={{ backgroundColor: segment.color || '#6366f1' }}
            />
            <CommandCardTitle className="text-base">{segment.name}</CommandCardTitle>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onAction(segment, 'email'); }}>
                <Mail className="w-4 h-4 mr-2" /> Send Email Campaign
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onAction(segment, 'discount'); }}>
                <Tag className="w-4 h-4 mr-2" /> Create Discount Code
              </DropdownMenuItem>
              {!segment.is_system && (
                <DropdownMenuItem 
                  className="text-red-600"
                  onClick={(e) => { e.stopPropagation(); onDelete(segment); }}
                >
                  <Trash2 className="w-4 h-4 mr-2" /> Delete Segment
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3">
          {segment.description ? (
            <p className="text-sm text-slate-400">{segment.description}</p>
          ) : (
            <p className="text-sm text-slate-400">Customer segment ready for activation.</p>
          )}
          <div className={`inline-flex items-center gap-1 text-xs font-medium ${trendTone}`}>
            <ArrowUpRight className="h-3.5 w-3.5" />
            {trendLabel}
          </div>
        </div>
      </CommandCardHeader>
      <CommandCardContent>
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-[10px] border border-white/10 bg-white/[0.03] px-3 py-2 text-center">
            <div className="mb-1 flex items-center justify-center gap-1 text-slate-500">
              <Users className="w-4 h-4" />
            </div>
            <p className="text-lg font-bold text-slate-100">{segment.customer_count || 0}</p>
            <p className="text-xs text-slate-500">Customers</p>
          </div>
          <div className="rounded-[10px] border border-white/10 bg-white/[0.03] px-3 py-2 text-center">
            <div className="mb-1 flex items-center justify-center gap-1 text-slate-500">
              <DollarSign className="w-4 h-4" />
            </div>
            <p className="text-lg font-bold text-slate-100">{formatCurrency(segment.total_revenue)}</p>
            <p className="text-xs text-slate-500">Revenue</p>
          </div>
          <div className="rounded-[10px] border border-white/10 bg-white/[0.03] px-3 py-2 text-center">
            <div className="mb-1 flex items-center justify-center gap-1 text-slate-500">
              <TrendingUp className="w-4 h-4" />
            </div>
            <p className={`text-lg font-bold ${segment.total_profit >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{formatCurrency(segment.total_profit)}</p>
            <p className="text-xs text-slate-500">Profit</p>
          </div>
        </div>

        <div className="mt-3 grid gap-2">
          {previewCustomers.length > 0 ? (
            <div className="rounded-[10px] border border-white/10 bg-white/[0.02] px-3 py-2">
              <div className="mb-2 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                <Eye className="h-3.5 w-3.5" />
                Customer Preview
              </div>
              <div className="space-y-1.5">
                {previewCustomers.map((customer) => (
                  <div key={customer.id || customer.email} className="flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <p className="truncate text-slate-200">{customer.name || 'Unknown'}</p>
                      <p className="truncate text-slate-500">{customer.email || 'No email'}</p>
                    </div>
                    <span className="shrink-0 text-slate-400">{formatCurrency(customer.total_spent || 0)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-[10px] border border-white/10 bg-white/[0.02] px-3 py-2 text-xs text-slate-500">
              No preview customers available yet.
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
          <Button size="sm" variant="outline" className="border-white/10 bg-white/[0.03] text-slate-100 hover:bg-white/[0.05]" onClick={() => onView(segment)}>
            View Customers
          </Button>
          <Button size="sm" variant="outline" className="border-white/10 bg-white/[0.03] text-slate-100 hover:bg-white/[0.05]" onClick={() => onAction(segment, 'email')}>
            Launch Campaign
          </Button>
          <Button size="sm" className="bg-cyan-500 text-slate-950 hover:bg-cyan-400" onClick={() => onAction(segment, 'analyze')}>
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            Analyze
          </Button>
        </div>

        {segment.is_system && (
          <Badge variant="outline" className="mt-3 border-white/10 text-xs text-slate-300">System Segment</Badge>
        )}
      </CommandCardContent>
    </CommandCard>
  );
}
