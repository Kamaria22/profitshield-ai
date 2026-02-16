import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Users, DollarSign, TrendingUp, MoreVertical, Mail, Tag, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function SegmentCard({ segment, onView, onAction, onDelete }) {
  const formatCurrency = (val) => `$${(val || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  return (
    <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => onView(segment)}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div 
              className="w-3 h-3 rounded-full" 
              style={{ backgroundColor: segment.color || '#6366f1' }}
            />
            <CardTitle className="text-base">{segment.name}</CardTitle>
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
          <p className="text-sm text-slate-500 mt-1">{segment.description}</p>
        )}
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-slate-500 mb-1">
              <Users className="w-4 h-4" />
            </div>
            <p className="text-xl font-bold text-slate-900">{segment.customer_count || 0}</p>
            <p className="text-xs text-slate-500">Customers</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-slate-500 mb-1">
              <DollarSign className="w-4 h-4" />
            </div>
            <p className="text-xl font-bold text-slate-900">{formatCurrency(segment.total_revenue)}</p>
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
          <Badge variant="outline" className="mt-3 text-xs">System Segment</Badge>
        )}
      </CardContent>
    </Card>
  );
}