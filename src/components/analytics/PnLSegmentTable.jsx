import React, { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ChevronRight, Search, ArrowUpDown, TrendingUp, TrendingDown } from 'lucide-react';

const formatCurrency = (value) => {
  if (Math.abs(value) >= 1000) {
    return `$${(value / 1000).toFixed(1)}K`;
  }
  return `$${value.toFixed(2)}`;
};

export default function PnLSegmentTable({ data, segmentBy, onDrilldown }) {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('revenue');
  const [sortDir, setSortDir] = useState('desc');

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortDir('desc');
    }
  };

  const filteredData = data
    .filter(item => item.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const modifier = sortDir === 'asc' ? 1 : -1;
      return (a[sortBy] - b[sortBy]) * modifier;
    });

  const segmentLabels = {
    product: 'Product',
    customer: 'Customer',
    tags: 'Tag'
  };

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          placeholder={`Search ${segmentLabels[segmentBy].toLowerCase()}s...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="w-[250px]">{segmentLabels[segmentBy]}</TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-slate-100"
                onClick={() => handleSort('revenue')}
              >
                <div className="flex items-center gap-1">
                  Revenue
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-slate-100"
                onClick={() => handleSort('cogs')}
              >
                <div className="flex items-center gap-1">
                  COGS
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-slate-100"
                onClick={() => handleSort('profit')}
              >
                <div className="flex items-center gap-1">
                  Profit
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-slate-100"
                onClick={() => handleSort('margin')}
              >
                <div className="flex items-center gap-1">
                  Margin
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-slate-100"
                onClick={() => handleSort('orders')}
              >
                <div className="flex items-center gap-1">
                  Orders
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                  No data found
                </TableCell>
              </TableRow>
            ) : (
              filteredData.slice(0, 20).map((item, idx) => (
                <TableRow key={idx} className="hover:bg-slate-50">
                  <TableCell>
                    <div>
                      <p className="font-medium text-slate-900 truncate max-w-[220px]">
                        {item.name}
                      </p>
                      {item.customerName && (
                        <p className="text-xs text-slate-500">{item.customerName}</p>
                      )}
                      {item.units && (
                        <p className="text-xs text-slate-500">{item.units} units sold</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">
                    {formatCurrency(item.revenue)}
                  </TableCell>
                  <TableCell className="text-slate-600">
                    {formatCurrency(item.cogs)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {item.profit >= 0 ? (
                        <TrendingUp className="w-3 h-3 text-emerald-500" />
                      ) : (
                        <TrendingDown className="w-3 h-3 text-red-500" />
                      )}
                      <span className={item.profit >= 0 ? 'text-emerald-600 font-medium' : 'text-red-600 font-medium'}>
                        {formatCurrency(item.profit)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant="outline"
                      className={
                        item.margin >= 30 ? 'border-emerald-200 text-emerald-700 bg-emerald-50' :
                        item.margin >= 15 ? 'border-amber-200 text-amber-700 bg-amber-50' :
                        'border-red-200 text-red-700 bg-red-50'
                      }
                    >
                      {item.margin.toFixed(1)}%
                    </Badge>
                  </TableCell>
                  <TableCell className="text-slate-600">
                    {item.orders}
                  </TableCell>
                  <TableCell>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => onDrilldown(item)}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {filteredData.length > 20 && (
        <p className="text-sm text-slate-500 text-center">
          Showing top 20 of {filteredData.length} {segmentLabels[segmentBy].toLowerCase()}s
        </p>
      )}
    </div>
  );
}