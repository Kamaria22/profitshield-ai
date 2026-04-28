import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Mail, AlertTriangle } from 'lucide-react';

const riskColors = {
  low: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300',
  medium: 'border-amber-500/20 bg-amber-500/10 text-amber-300',
  high: 'border-red-500/20 bg-red-500/10 text-red-300'
};

export default function CustomerTable({ customers, loading, onCustomerClick, onAction }) {
  const formatCurrency = (val) => `$${(val || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    );
  }

  if (!customers?.length) {
    return (
      <div className="text-center py-12 text-slate-500">
        No customers found in this segment
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="border-white/8 hover:bg-transparent">
          <TableHead className="text-slate-300">Customer</TableHead>
          <TableHead className="text-right text-slate-300">Orders</TableHead>
          <TableHead className="text-right text-slate-300">Total Spent</TableHead>
          <TableHead className="text-right text-slate-300">Profit</TableHead>
          <TableHead className="text-center text-slate-300">Risk</TableHead>
          <TableHead className="text-right text-slate-300">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {customers.map((customer) => (
          <TableRow 
            key={customer.id} 
            className="cursor-pointer border-white/8 hover:bg-white/[0.03]"
            onClick={() => onCustomerClick?.(customer)}
          >
            <TableCell>
              <div>
                <p className="font-medium text-slate-100">{customer.name || 'Unknown'}</p>
                <p className="text-sm text-slate-400">{customer.email}</p>
              </div>
            </TableCell>
            <TableCell className="text-right font-medium">{customer.total_orders}</TableCell>
            <TableCell className="text-right">{formatCurrency(customer.total_spent)}</TableCell>
            <TableCell className="text-right">
              <span className={customer.total_profit >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                {customer.total_profit >= 0 ? '+' : ''}{formatCurrency(customer.total_profit)}
              </span>
            </TableCell>
            <TableCell className="text-center">
              <Badge className={`border ${riskColors[customer.risk_profile || 'low']}`}>
                {customer.risk_profile === 'high' && <AlertTriangle className="w-3 h-3 mr-1" />}
                {customer.risk_profile || 'low'}
              </Badge>
            </TableCell>
            <TableCell className="text-right">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={(e) => { e.stopPropagation(); onAction?.(customer, 'email'); }}
              >
                <Mail className="w-4 h-4" />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
