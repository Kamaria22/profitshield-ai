import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Package, DollarSign, Save, Loader2, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

export default function ProductCostEditor({ product, variants = [], costMappings = [], tenantId, open, onOpenChange }) {
  const [editedCosts, setEditedCosts] = useState({});
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open && variants.length > 0) {
      const initialCosts = {};
      variants.forEach(v => {
        const mapping = costMappings.find(m => m.sku === v.sku);
        initialCosts[v.sku] = mapping?.cost_per_unit?.toString() || v.cost?.toString() || '';
      });
      setEditedCosts(initialCosts);
    }
  }, [open, variants, costMappings]);

  const saveCostsMutation = useMutation({
    mutationFn: async () => {
      const updates = [];
      for (const [sku, costStr] of Object.entries(editedCosts)) {
        const cost = parseFloat(costStr);
        if (isNaN(cost) || cost < 0) continue;
        
        const existingMapping = costMappings.find(m => m.sku === sku);
        const variant = variants.find(v => v.sku === sku);
        
        if (existingMapping) {
          updates.push(
            base44.entities.CostMapping.update(existingMapping.id, { cost_per_unit: cost })
          );
        } else {
          updates.push(
            base44.entities.CostMapping.create({
              tenant_id: tenantId,
              sku,
              product_title: product?.title || '',
              variant_title: variant?.title || '',
              cost_per_unit: cost,
              source: 'manual'
            })
          );
        }
        
        // Also update ProductVariant if it exists
        if (variant) {
          updates.push(
            base44.entities.ProductVariant.update(variant.id, { cost })
          );
        }
      }
      
      await Promise.all(updates);
    },
    onSuccess: () => {
      toast.success('Costs updated successfully');
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['variants'] });
      queryClient.invalidateQueries({ queryKey: ['costMappings'] });
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error('Failed to update costs: ' + error.message);
    }
  });

  const handleCostChange = (sku, value) => {
    setEditedCosts(prev => ({ ...prev, [sku]: value }));
  };

  const calculateMargin = (price, cost) => {
    const p = parseFloat(price) || 0;
    const c = parseFloat(cost) || 0;
    if (p === 0) return 0;
    return ((p - c) / p) * 100;
  };

  const totalRevenue = product?.total_revenue || 0;
  const totalProfit = product?.total_profit || 0;
  const avgMargin = product?.avg_margin_pct || 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {product?.image_url ? (
              <img src={product.image_url} alt="" className="w-10 h-10 rounded-lg object-cover" />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
                <Package className="w-5 h-5 text-slate-400" />
              </div>
            )}
            <span className="line-clamp-1">{product?.title || 'Product'}</span>
          </SheetTitle>
          <SheetDescription>
            Edit cost of goods sold (COGS) for each variant
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Product Summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-xs text-slate-500">Revenue</p>
              <p className="text-lg font-semibold text-slate-900">
                ${totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
            </div>
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-xs text-slate-500">Profit</p>
              <p className={`text-lg font-semibold ${totalProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                ${totalProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
            </div>
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-xs text-slate-500">Margin</p>
              <p className={`text-lg font-semibold ${avgMargin >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {avgMargin.toFixed(1)}%
              </p>
            </div>
          </div>

          <Separator />

          {/* Variants Cost Editor */}
          <div className="space-y-4">
            <h4 className="font-medium text-slate-900">Variant Costs</h4>
            
            {variants.length === 0 ? (
              <div className="text-center py-6 text-slate-500">
                <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-amber-400" />
                <p>No variants found for this product</p>
                <p className="text-sm">Sync your Shopify data to import variants</p>
              </div>
            ) : (
              <div className="space-y-3">
                {variants.map((variant) => {
                  const currentCost = editedCosts[variant.sku] || '';
                  const margin = calculateMargin(variant.price, currentCost);
                  const hasWarning = margin < 0 || (currentCost && margin < 10);
                  
                  return (
                    <div key={variant.id} className="border border-slate-200 rounded-lg p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-900 text-sm line-clamp-1">
                            {variant.title || 'Default'}
                          </p>
                          <p className="text-xs text-slate-500">SKU: {variant.sku || 'N/A'}</p>
                          <p className="text-xs text-slate-500">Price: ${variant.price?.toFixed(2) || '0.00'}</p>
                        </div>
                        <Badge variant="outline" className="text-xs shrink-0">
                          {variant.total_units_sold || 0} sold
                        </Badge>
                      </div>
                      
                      <div className="mt-3 flex items-center gap-3">
                        <div className="flex-1">
                          <Label className="text-xs text-slate-500">COGS per unit</Label>
                          <div className="relative mt-1">
                            <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="0.00"
                              value={currentCost}
                              onChange={(e) => handleCostChange(variant.sku, e.target.value)}
                              className="pl-7 h-9"
                            />
                          </div>
                        </div>
                        <div className="text-right">
                          <Label className="text-xs text-slate-500">Margin</Label>
                          <div className={`flex items-center gap-1 mt-1 ${hasWarning ? 'text-amber-600' : margin >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {margin >= 0 ? (
                              <TrendingUp className="w-4 h-4" />
                            ) : (
                              <TrendingDown className="w-4 h-4" />
                            )}
                            <span className="font-semibold">{margin.toFixed(1)}%</span>
                          </div>
                        </div>
                      </div>
                      
                      {hasWarning && currentCost && (
                        <div className="mt-2 flex items-center gap-1 text-xs text-amber-600">
                          <AlertTriangle className="w-3 h-3" />
                          {margin < 0 ? 'Negative margin - consider raising price' : 'Low margin warning'}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Save Button */}
          {variants.length > 0 && (
            <Button 
              className="w-full gap-2" 
              onClick={() => saveCostsMutation.mutate()}
              disabled={saveCostsMutation.isPending}
            >
              {saveCostsMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Save Costs
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}