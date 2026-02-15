import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronRight, TrendingUp, TrendingDown, AlertTriangle, Package } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

export default function ProductsTable({ products, loading, onProductClick }) {
  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-slate-200">
        <div className="animate-pulse p-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex gap-4 py-4 border-b border-slate-100 last:border-0">
              <div className="w-12 h-12 bg-slate-200 rounded" />
              <div className="flex-1">
                <div className="h-4 bg-slate-200 rounded w-48 mb-2" />
                <div className="h-3 bg-slate-200 rounded w-24" />
              </div>
              <div className="h-4 bg-slate-200 rounded w-20" />
              <div className="h-4 bg-slate-200 rounded w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!products || products.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-12 text-center">
        <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500">No products found</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50">
            <TableHead className="font-semibold">Product</TableHead>
            <TableHead className="font-semibold text-right">Revenue</TableHead>
            <TableHead className="font-semibold text-right">Profit</TableHead>
            <TableHead className="font-semibold text-right">Margin</TableHead>
            <TableHead className="font-semibold text-right">Units Sold</TableHead>
            <TableHead className="font-semibold text-right">Return Rate</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((product) => {
            const isProfitable = (product.total_profit || 0) >= 0;
            const isHighReturnRate = (product.return_rate || 0) > 10;
            const isNegativeMargin = (product.avg_margin_pct || 0) < 0;
            
            return (
              <TableRow 
                key={product.id} 
                className="cursor-pointer hover:bg-slate-50 transition-colors"
                onClick={() => onProductClick?.(product)}
              >
                <TableCell>
                  <div className="flex items-center gap-3">
                    {product.image_url ? (
                      <img 
                        src={product.image_url} 
                        alt={product.title}
                        className="w-12 h-12 rounded-lg object-cover border border-slate-200"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center">
                        <Package className="w-6 h-6 text-slate-400" />
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-slate-900 line-clamp-1">{product.title}</p>
                      <p className="text-sm text-slate-500">{product.vendor}</p>
                    </div>
                    {(isNegativeMargin || isHighReturnRate) && (
                      <AlertTriangle className="w-4 h-4 text-amber-500 ml-1" />
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right font-medium">
                  ${product.total_revenue?.toLocaleString(undefined, { maximumFractionDigits: 0 }) || '0'}
                </TableCell>
                <TableCell className={`text-right font-semibold ${isProfitable ? 'text-emerald-600' : 'text-red-600'}`}>
                  {isProfitable ? '+' : ''}${product.total_profit?.toLocaleString(undefined, { maximumFractionDigits: 0 }) || '0'}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <span className={`font-medium ${isProfitable ? 'text-emerald-600' : 'text-red-600'}`}>
                      {product.avg_margin_pct?.toFixed(1) || '0.0'}%
                    </span>
                    {isProfitable ? (
                      <TrendingUp className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <TrendingDown className="w-4 h-4 text-red-500" />
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right font-medium">
                  {product.total_units_sold?.toLocaleString() || '0'}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Progress 
                      value={Math.min(product.return_rate || 0, 100)} 
                      className={`w-16 h-2 ${isHighReturnRate ? '[&>div]:bg-red-500' : '[&>div]:bg-slate-400'}`}
                    />
                    <span className={`text-sm font-medium ${isHighReturnRate ? 'text-red-600' : 'text-slate-600'}`}>
                      {product.return_rate?.toFixed(1) || '0.0'}%
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}