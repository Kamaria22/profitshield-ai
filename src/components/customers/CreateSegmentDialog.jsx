import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';

const colorOptions = [
  { value: '#6366f1', label: 'Indigo' },
  { value: '#8b5cf6', label: 'Purple' },
  { value: '#ec4899', label: 'Pink' },
  { value: '#ef4444', label: 'Red' },
  { value: '#f97316', label: 'Orange' },
  { value: '#eab308', label: 'Yellow' },
  { value: '#22c55e', label: 'Green' },
  { value: '#14b8a6', label: 'Teal' },
  { value: '#0ea5e9', label: 'Blue' },
];

export default function CreateSegmentDialog({ open, onOpenChange, onSave, saving }) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    color: '#6366f1',
    criteria: {
      min_orders: '',
      max_orders: '',
      min_spent: '',
      max_spent: '',
      risk_profile: '',
      min_profit: '',
      max_profit: ''
    }
  });

  const handleSave = () => {
    const criteria = {};
    if (formData.criteria.min_orders) criteria.min_orders = Number(formData.criteria.min_orders);
    if (formData.criteria.max_orders) criteria.max_orders = Number(formData.criteria.max_orders);
    if (formData.criteria.min_spent) criteria.min_spent = Number(formData.criteria.min_spent);
    if (formData.criteria.max_spent) criteria.max_spent = Number(formData.criteria.max_spent);
    if (formData.criteria.min_profit) criteria.min_profit = Number(formData.criteria.min_profit);
    if (formData.criteria.max_profit) criteria.max_profit = Number(formData.criteria.max_profit);
    if (formData.criteria.risk_profile) criteria.risk_profile = formData.criteria.risk_profile;

    onSave({
      name: formData.name,
      description: formData.description,
      color: formData.color,
      criteria
    });
  };

  const updateCriteria = (key, value) => {
    setFormData(prev => ({
      ...prev,
      criteria: { ...prev.criteria, [key]: value }
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Customer Segment</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-4 gap-4">
            <div className="col-span-3">
              <Label>Segment Name</Label>
              <Input 
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., VIP Customers"
              />
            </div>
            <div>
              <Label>Color</Label>
              <Select value={formData.color} onValueChange={(v) => setFormData(prev => ({ ...prev, color: v }))}>
                <SelectTrigger>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded" style={{ backgroundColor: formData.color }} />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {colorOptions.map(c => (
                    <SelectItem key={c.value} value={c.value}>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded" style={{ backgroundColor: c.value }} />
                        {c.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Description</Label>
            <Textarea 
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Describe this segment..."
              rows={2}
            />
          </div>

          <div className="border-t pt-4">
            <Label className="text-base font-semibold">Criteria</Label>
            <p className="text-sm text-slate-500 mb-3">Define rules to filter customers into this segment</p>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm">Min Orders</Label>
                <Input 
                  type="number"
                  value={formData.criteria.min_orders}
                  onChange={(e) => updateCriteria('min_orders', e.target.value)}
                  placeholder="0"
                />
              </div>
              <div>
                <Label className="text-sm">Max Orders</Label>
                <Input 
                  type="number"
                  value={formData.criteria.max_orders}
                  onChange={(e) => updateCriteria('max_orders', e.target.value)}
                  placeholder="No limit"
                />
              </div>
              <div>
                <Label className="text-sm">Min Spent ($)</Label>
                <Input 
                  type="number"
                  value={formData.criteria.min_spent}
                  onChange={(e) => updateCriteria('min_spent', e.target.value)}
                  placeholder="0"
                />
              </div>
              <div>
                <Label className="text-sm">Max Spent ($)</Label>
                <Input 
                  type="number"
                  value={formData.criteria.max_spent}
                  onChange={(e) => updateCriteria('max_spent', e.target.value)}
                  placeholder="No limit"
                />
              </div>
              <div>
                <Label className="text-sm">Min Profit ($)</Label>
                <Input 
                  type="number"
                  value={formData.criteria.min_profit}
                  onChange={(e) => updateCriteria('min_profit', e.target.value)}
                  placeholder="Any"
                />
              </div>
              <div>
                <Label className="text-sm">Risk Profile</Label>
                <Select 
                  value={formData.criteria.risk_profile} 
                  onValueChange={(v) => updateCriteria('risk_profile', v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Any" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={null}>Any</SelectItem>
                    <SelectItem value="low">Low Risk</SelectItem>
                    <SelectItem value="medium">Medium Risk</SelectItem>
                    <SelectItem value="high">High Risk</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!formData.name || saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Create Segment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}