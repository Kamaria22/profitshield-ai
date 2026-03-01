/**
 * TwoWaySyncPanel
 * 
 * UI for managing two-way Shopify synchronization:
 *   - Push inventory levels to Shopify
 *   - Fulfill orders in Shopify from ProfitShield
 */

import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  RefreshCw, Package, Truck, CheckCircle, AlertCircle,
  ChevronDown, ChevronUp, Loader2, ArrowUpDown
} from 'lucide-react';

export default function TwoWaySyncPanel({ tenantId, integrationId }) {
  const [fulfillForm, setFulfillForm] = useState({});
  const [expandedOrder, setExpandedOrder] = useState(null);
  const [notifyCustomer, setNotifyCustomer] = useState(true);
  const [toast, setToast] = useState(null);
  const qc = useQueryClient();

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Load unfulfilled orders
  const { data: orders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ['unfulfilled-orders', tenantId],
    queryFn: () => base44.entities.Order.filter(
      { tenant_id: tenantId, fulfillment_status: 'unfulfilled' },
      '-order_date',
      25
    ),
    enabled: !!tenantId
  });

  // Load products with inventory
  const { data: variants = [], isLoading: variantsLoading } = useQuery({
    queryKey: ['product-variants', tenantId],
    queryFn: () => base44.entities.ProductVariant.filter({ tenant_id: tenantId }, 'sku', 50),
    enabled: !!tenantId
  });

  // Fulfill order mutation
  const fulfillMutation = useMutation({
    mutationFn: async ({ order, trackingNumber, trackingUrl, trackingCompany }) => {
      const { data } = await base44.functions.invoke('shopifyTwoWaySync', {
        action: 'fulfill_order',
        tenant_id: tenantId,
        order_id: order.id,
        platform_order_id: order.platform_order_id,
        tracking_number: trackingNumber || undefined,
        tracking_url: trackingUrl || undefined,
        tracking_company: trackingCompany || undefined,
        notify_customer: notifyCustomer
      });
      if (!data.success) throw new Error(data.error || 'Fulfillment failed');
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['unfulfilled-orders', tenantId] });
      showToast(`Order ${vars.order.order_number} fulfilled in Shopify`);
      setExpandedOrder(null);
      setFulfillForm({});
    },
    onError: (err) => showToast(err.message, 'error')
  });

  // Bulk inventory sync mutation
  const bulkSyncMutation = useMutation({
    mutationFn: async () => {
      const { data } = await base44.functions.invoke('shopifyTwoWaySync', {
        action: 'bulk_sync_inventory',
        tenant_id: tenantId
      });
      if (!data.success) throw new Error(data.error || 'Sync failed');
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['product-variants', tenantId] });
      showToast(`${data.synced}/${data.total} inventory levels synced to Shopify`);
    },
    onError: (err) => showToast(err.message, 'error')
  });

  // Single variant inventory sync
  const singleSyncMutation = useMutation({
    mutationFn: async ({ variant, quantity }) => {
      const { data } = await base44.functions.invoke('shopifyTwoWaySync', {
        action: 'sync_inventory',
        tenant_id: tenantId,
        variant_id: variant.platform_variant_id,
        quantity
      });
      if (!data.success) throw new Error(data.error || 'Sync failed');
      return data;
    },
    onSuccess: (_, { variant }) => showToast(`Inventory synced for SKU: ${variant.sku}`),
    onError: (err) => showToast(err.message, 'error')
  });

  const [inventoryEdits, setInventoryEdits] = useState({});

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 text-sm font-medium
          ${toast.type === 'error' ? 'bg-red-900 text-red-200 border border-red-700' : 'bg-emerald-900 text-emerald-200 border border-emerald-700'}`}>
          {toast.type === 'error' ? <AlertCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* ── Inventory Sync ─────────────────────────────────────────────────── */}
      <div className="bg-slate-900 border border-white/8 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-violet-500/15 flex items-center justify-center">
              <Package className="w-4 h-4 text-violet-400" />
            </div>
            <div>
              <h3 className="font-semibold text-white text-sm">Inventory Sync</h3>
              <p className="text-xs text-slate-500">Push ProfitShield inventory levels → Shopify</p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => bulkSyncMutation.mutate()}
            disabled={bulkSyncMutation.isPending || variantsLoading}
            className="bg-violet-600 hover:bg-violet-700 text-white h-8 text-xs gap-1.5"
          >
            {bulkSyncMutation.isPending
              ? <><Loader2 className="w-3 h-3 animate-spin" /> Syncing...</>
              : <><ArrowUpDown className="w-3 h-3" /> Sync All ({variants.length})</>}
          </Button>
        </div>

        {variantsLoading ? (
          <div className="flex items-center gap-2 text-slate-500 text-sm py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading variants...
          </div>
        ) : variants.length === 0 ? (
          <p className="text-slate-500 text-sm py-2">No product variants found. Sync products from Shopify first.</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {variants.filter(v => v.platform_variant_id).slice(0, 20).map(variant => {
              const editQty = inventoryEdits[variant.id];
              const currentQty = editQty !== undefined ? editQty : (variant.inventory_quantity || 0);
              return (
                <div key={variant.id} className="flex items-center gap-3 bg-slate-800/50 rounded-lg px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{variant.title || variant.sku}</p>
                    <p className="text-xs text-slate-500">SKU: {variant.sku || '—'}</p>
                  </div>
                  <Input
                    type="number"
                    value={currentQty}
                    onChange={e => setInventoryEdits(prev => ({ ...prev, [variant.id]: parseInt(e.target.value) || 0 }))}
                    className="w-20 h-7 text-sm bg-slate-700 border-slate-600 text-white text-center"
                    min="0"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => singleSyncMutation.mutate({ variant, quantity: currentQty })}
                    disabled={singleSyncMutation.isPending}
                    className="h-7 text-xs border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700 px-2"
                  >
                    <RefreshCw className="w-3 h-3" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Order Fulfillment ──────────────────────────────────────────────── */}
      <div className="bg-slate-900 border border-white/8 rounded-xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-lg bg-indigo-500/15 flex items-center justify-center">
            <Truck className="w-4 h-4 text-indigo-400" />
          </div>
          <div>
            <h3 className="font-semibold text-white text-sm">Order Fulfillment</h3>
            <p className="text-xs text-slate-500">Mark orders as fulfilled and push to Shopify</p>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-4 p-3 bg-slate-800/50 rounded-lg">
          <Switch checked={notifyCustomer} onCheckedChange={setNotifyCustomer} />
          <span className="text-sm text-slate-300">Notify customer by email on fulfillment</span>
        </div>

        {ordersLoading ? (
          <div className="flex items-center gap-2 text-slate-500 text-sm py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading orders...
          </div>
        ) : orders.length === 0 ? (
          <div className="flex items-center gap-2 text-slate-400 text-sm py-4">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            All orders are fulfilled.
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {orders.map(order => {
              const form = fulfillForm[order.id] || {};
              const isExpanded = expandedOrder === order.id;
              return (
                <div key={order.id} className="bg-slate-800/50 rounded-lg overflow-hidden">
                  <button
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-700/50 transition-colors"
                    onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white">#{order.order_number}</span>
                        <Badge className="text-[10px] bg-amber-500/20 text-amber-400 border-0">
                          {order.fulfillment_status || 'unfulfilled'}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-500 truncate">{order.customer_name || order.customer_email}</p>
                    </div>
                    <span className="text-xs text-slate-400">${(order.total_revenue || 0).toFixed(2)}</span>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                  </button>

                  {isExpanded && (
                    <div className="px-3 pb-3 space-y-2 border-t border-white/5 pt-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-slate-400 block mb-1">Tracking Number</label>
                          <Input
                            placeholder="1Z999AA1..."
                            value={form.trackingNumber || ''}
                            onChange={e => setFulfillForm(prev => ({ ...prev, [order.id]: { ...form, trackingNumber: e.target.value } }))}
                            className="h-8 text-xs bg-slate-700 border-slate-600 text-white"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-400 block mb-1">Carrier</label>
                          <Input
                            placeholder="UPS, FedEx, USPS..."
                            value={form.trackingCompany || ''}
                            onChange={e => setFulfillForm(prev => ({ ...prev, [order.id]: { ...form, trackingCompany: e.target.value } }))}
                            className="h-8 text-xs bg-slate-700 border-slate-600 text-white"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-slate-400 block mb-1">Tracking URL (optional)</label>
                        <Input
                          placeholder="https://track.carrier.com/..."
                          value={form.trackingUrl || ''}
                          onChange={e => setFulfillForm(prev => ({ ...prev, [order.id]: { ...form, trackingUrl: e.target.value } }))}
                          className="h-8 text-xs bg-slate-700 border-slate-600 text-white"
                        />
                      </div>
                      <Button
                        className="w-full bg-indigo-600 hover:bg-indigo-700 h-8 text-xs gap-1.5"
                        onClick={() => fulfillMutation.mutate({
                          order,
                          trackingNumber: form.trackingNumber,
                          trackingUrl: form.trackingUrl,
                          trackingCompany: form.trackingCompany
                        })}
                        disabled={fulfillMutation.isPending}
                      >
                        {fulfillMutation.isPending
                          ? <><Loader2 className="w-3 h-3 animate-spin" /> Fulfilling...</>
                          : <><Truck className="w-3 h-3" /> Fulfill in Shopify</>}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}