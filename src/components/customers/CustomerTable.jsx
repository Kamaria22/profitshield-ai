import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Mail, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';

const riskColors = {
  low: 'bg-emerald-100 text-emerald-700',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-red-100 text-red-700'
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
        <TableRow>
          <TableHead>Customer</TableHead>
          <TableHead className="text-right">Orders</TableHead>
          <TableHead className="text-right">Total Spent</TableHead>
          <TableHead className="text-right">Profit</TableHead>
          <TableHead className="text-center">Risk</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {customers.map((customer) => (
          <TableRow 
            key={customer.id} 
            className="cursor-pointer hover:bg-slate-50"
            onClick={() => onCustomerClick?.(customer)}
          >
            <TableCell>
              <div>
                <p className="font-medium text-slate-900">{customer.name || 'Unknown'}</p>
                <p className="text-sm text-slate-500">{customer.email}</p>
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
              <Badge className={riskColors[customer.risk_profile || 'low']}>
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