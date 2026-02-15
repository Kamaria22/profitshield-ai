import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { 
  Search, 
  Download,
  Package,
  TrendingUp,
  TrendingDown,
  AlertTriangle
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import ProductsTable from '../components/products/ProductsTable';

export default function Products() {
  const [user, setUser] = useState(null);
  const [tenant, setTenant] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('profit_desc');

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      
      if (currentUser?.tenant_id) {
        const tenants = await base44.entities.Tenant.filter({ id: currentUser.tenant_id });
        if (tenants.length > 0) setTenant(tenants[0]);
      }
    } catch (e) {
      console.log('Error loading user:', e);
    }
  };

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      return base44.entities.Product.filter({ 
        tenant_id: tenant.id 
      }, '-total_revenue', 500);
    },
    enabled: !!tenant?.id
  });

  // Filter and sort products
  const filteredProducts = React.useMemo(() => {
    let result = [...products];

    // Search
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(p => 
        p.title?.toLowerCase().includes(term) ||
        p.vendor?.toLowerCase().includes(term)
      );
    }

    // Sort
    switch (sortBy) {
      case 'profit_desc':
        result.sort((a, b) => (b.total_profit || 0) - (a.total_profit || 0));
        break;
      case 'profit_asc':
        result.sort((a, b) => (a.total_profit || 0) - (b.total_profit || 0));
        break;
      case 'revenue_desc':
        result.sort((a, b) => (b.total_revenue || 0) - (a.total_revenue || 0));
        break;
      case 'margin_desc':
        result.sort((a, b) => (b.avg_margin_pct || 0) - (a.avg_margin_pct || 0));
        break;
      case 'margin_asc':
        result.sort((a, b) => (a.avg_margin_pct || 0) - (b.avg_margin_pct || 0));
        break;
      case 'return_rate':
        result.sort((a, b) => (b.return_rate || 0) - (a.return_rate || 0));
        break;
      default:
        break;
    }

    return result;
  }, [products, searchTerm, sortBy]);

  // Calculate stats
  const stats = React.useMemo(() => {
    const totalRevenue = products.reduce((sum, p) => sum + (p.total_revenue || 0), 0);
    const totalProfit = products.reduce((sum, p) => sum + (p.total_profit || 0), 0);
    const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    const unprofitableCount = products.filter(p => (p.avg_margin_pct || 0) < 0).length;
    const highReturnCount = products.filter(p => (p.return_rate || 0) > 10).length;
    
    return { totalRevenue, totalProfit, avgMargin, unprofitableCount, highReturnCount };
  }, [products]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Products</h1>
        <p className="text-slate-500">Analyze profitability by product and SKU</p>
      </div>

      {/* Stats */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Total Products</p>
                <p className="text-2xl font-bold text-slate-900">{products.length}</p>
              </div>
              <Package className="w-8 h-8 text-slate-200" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Total Revenue</p>
                <p className="text-2xl font-bold text-slate-900">
                  ${stats.totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
              </div>
              <TrendingUp className="w-8 h-8 text-blue-200" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Total Profit</p>
                <p className={`text-2xl font-bold ${stats.totalProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  ${stats.totalProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
              </div>
              {stats.totalProfit >= 0 ? (
                <TrendingUp className="w-8 h-8 text-emerald-200" />
              ) : (
                <TrendingDown className="w-8 h-8 text-red-200" />
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Unprofitable</p>
                <p className={`text-2xl font-bold ${stats.unprofitableCount > 0 ? 'text-red-600' : 'text-slate-900'}`}>
                  {stats.unprofitableCount}
                </p>
              </div>
              <AlertTriangle className={`w-8 h-8 ${stats.unprofitableCount > 0 ? 'text-red-200' : 'text-slate-200'}`} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">High Return Rate</p>
                <p className={`text-2xl font-bold ${stats.highReturnCount > 0 ? 'text-amber-600' : 'text-slate-900'}`}>
                  {stats.highReturnCount}
                </p>
              </div>
              <Package className={`w-8 h-8 ${stats.highReturnCount > 0 ? 'text-amber-200' : 'text-slate-200'}`} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search products..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="profit_desc">Highest Profit</SelectItem>
            <SelectItem value="profit_asc">Lowest Profit</SelectItem>
            <SelectItem value="revenue_desc">Highest Revenue</SelectItem>
            <SelectItem value="margin_desc">Highest Margin</SelectItem>
            <SelectItem value="margin_asc">Lowest Margin</SelectItem>
            <SelectItem value="return_rate">Highest Return Rate</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="outline" className="gap-2">
          <Download className="w-4 h-4" />
          Export
        </Button>
      </div>

      {/* Products Table */}
      <ProductsTable 
        products={filteredProducts} 
        loading={isLoading}
      />
    </div>
  );
}