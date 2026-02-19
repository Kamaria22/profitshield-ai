import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { Bell, Plus, Trash2, Edit, TrendingDown, AlertTriangle, DollarSign } from 'lucide-react';
import { toast } from 'sonner';

const ALERT_TYPES = [
  { value: 'profit_drop', label: 'Profit Drop', icon: TrendingDown, color: 'text-red-600' },
  { value: 'margin_leak', label: 'Margin Leak Detected', icon: DollarSign, color: 'text-amber-600' },
  { value: 'high_risk_order', label: 'High Risk Order', icon: AlertTriangle, color: 'text-orange-600' },
  { value: 'fraud_spike', label: 'Fraud Score Spike', icon: AlertTriangle, color: 'text-red-600' },
];

export default function CustomAlerts({ tenantId, userId }) {
  const [alerts, setAlerts] = useState([]);
  const [open, setOpen] = useState(false);
  const [editingAlert, setEditingAlert] = useState(null);

  const [formData, setFormData] = useState({
    name: '',
    type: 'profit_drop',
    threshold: '',
    enabled: true,
    notify_email: true,
    notify_push: true
  });

  useEffect(() => {
    loadAlerts();
  }, [tenantId]);

  const loadAlerts = async () => {
    if (!tenantId) return;
    try {
      const saved = await base44.entities.AlertRule.filter({ tenant_id: tenantId });
      setAlerts(saved);
    } catch (e) {
      console.warn('Could not load custom alerts:', e);
    }
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.threshold) {
      toast.error('Please fill all required fields');
      return;
    }

    try {
      if (editingAlert) {
        await base44.entities.AlertRule.update(editingAlert.id, {
          ...formData,
          threshold: parseFloat(formData.threshold)
        });
        toast.success('Alert updated!');
      } else {
        await base44.entities.AlertRule.create({
          tenant_id: tenantId,
          ...formData,
          threshold: parseFloat(formData.threshold),
          created_by: userId
        });
        toast.success('Alert created!');
      }
      
      loadAlerts();
      setOpen(false);
      resetForm();
    } catch (e) {
      toast.error('Failed to save alert');
    }
  };

  const handleDelete = async (id) => {
    try {
      await base44.entities.AlertRule.delete(id);
      toast.success('Alert deleted');
      loadAlerts();
    } catch (e) {
      toast.error('Failed to delete alert');
    }
  };

  const handleToggle = async (alert) => {
    try {
      await base44.entities.AlertRule.update(alert.id, {
        enabled: !alert.enabled
      });
      loadAlerts();
    } catch (e) {
      toast.error('Failed to update alert');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      type: 'profit_drop',
      threshold: '',
      enabled: true,
      notify_email: true,
      notify_push: true
    });
    setEditingAlert(null);
  };

  const handleEdit = (alert) => {
    setFormData({
      name: alert.name,
      type: alert.type,
      threshold: alert.threshold.toString(),
      enabled: alert.enabled,
      notify_email: alert.notify_email ?? true,
      notify_push: alert.notify_push ?? true
    });
    setEditingAlert(alert);
    setOpen(true);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5" />
              Custom Alerts
            </CardTitle>
            <CardDescription>
              Get notified when important metrics cross your thresholds
            </CardDescription>
          </div>
          <Dialog open={open} onOpenChange={(val) => { setOpen(val); if (!val) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="w-4 h-4 mr-2" />
                New Alert
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingAlert ? 'Edit Alert' : 'Create Custom Alert'}</DialogTitle>
                <DialogDescription>
                  Set up automated notifications for key business metrics
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div>
                  <Label>Alert Name</Label>
                  <Input
                    placeholder="e.g., Daily Profit Below $1000"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>

                <div>
                  <Label>Alert Type</Label>
                  <Select value={formData.type} onValueChange={(val) => setFormData({ ...formData, type: val })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ALERT_TYPES.map(type => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Threshold Value</Label>
                  <Input
                    type="number"
                    placeholder="e.g., 1000"
                    value={formData.threshold}
                    onChange={(e) => setFormData({ ...formData, threshold: e.target.value })}
                  />
                </div>

                <div className="space-y-3 pt-2 border-t">
                  <Label>Notification Channels</Label>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Email Notifications</span>
                    <Switch
                      checked={formData.notify_email}
                      onCheckedChange={(val) => setFormData({ ...formData, notify_email: val })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Push Notifications</span>
                    <Switch
                      checked={formData.notify_push}
                      onCheckedChange={(val) => setFormData({ ...formData, notify_push: val })}
                    />
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={handleSubmit}>
                  {editingAlert ? 'Update' : 'Create'} Alert
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <Bell className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p className="text-sm">No custom alerts yet</p>
            <p className="text-xs">Create your first alert to get started</p>
          </div>
        ) : (
          <div className="space-y-2">
            {alerts.map(alert => {
              const alertType = ALERT_TYPES.find(t => t.type === alert.type);
              const Icon = alertType?.icon || Bell;
              
              return (
                <div key={alert.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                  <Icon className={`w-5 h-5 ${alertType?.color || 'text-slate-600'}`} />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-900">{alert.name}</p>
                    <p className="text-xs text-slate-500">
                      Threshold: {alert.threshold} • {alertType?.label}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={alert.enabled}
                      onCheckedChange={() => handleToggle(alert)}
                    />
                    <Button size="sm" variant="ghost" onClick={() => handleEdit(alert)}>
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(alert.id)}>
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}