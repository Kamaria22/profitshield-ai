import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Users, DollarSign, TrendingUp, MoreVertical, Mail, Tag, Trash2 } from 'lucide-react';
import { CommandCard, CommandCardContent, CommandCardHeader, CommandCardTitle } from '@/components/ui/command-card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function SegmentCard({ segment, onView, onAction, onDelete }) {
  const formatCurrency = (val) => `$${(val || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  return (
    <CommandCard className="cursor-pointer" onClick={() => onView(segment)}>
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
        {segment.description && (
          <p className="mt-1 text-sm text-slate-400">{segment.description}</p>
        )}
      </CommandCardHeader>
      <CommandCardContent>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-slate-500 mb-1">
              <Users className="w-4 h-4" />
            </div>
            <p className="text-xl font-bold text-slate-100">{segment.customer_count || 0}</p>
            <p className="text-xs text-slate-500">Customers</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-slate-500 mb-1">
              <DollarSign className="w-4 h-4" />
            </div>
            <p className="text-xl font-bold text-slate-100">{formatCurrency(segment.total_revenue)}</p>
            <p className="text-xs text-slate-500">Revenue</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-slate-500 mb-1">
              <TrendingUp className="w-4 h-4" />
            </div>
            <p className="text-xl font-bold text-emerald-600">{formatCurrency(segment.total_profit)}</p>
            <p className="text-xs text-slate-500">Profit</p>
          </div>
        </div>
        {segment.is_system && (
          <Badge variant="outline" className="mt-3 border-white/10 text-xs text-slate-300">System Segment</Badge>
        )}
      </CommandCardContent>
    </CommandCard>
  );
}
