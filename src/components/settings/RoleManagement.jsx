import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Shield, Plus, Pencil, Trash2, Users, Loader2, Lock } from 'lucide-react';
import { DEFAULT_ROLE_PERMISSIONS } from '@/components/usePermissions';

const PERMISSION_GROUPS = [
  {
    name: 'Dashboard',
    permissions: [
      { key: 'dashboard_view', label: 'View Dashboard' }
    ]
  },
  {
    name: 'Orders',
    permissions: [
      { key: 'orders_view', label: 'View Orders' },
      { key: 'orders_edit', label: 'Edit Orders' }
    ]
  },
  {
    name: 'Products',
    permissions: [
      { key: 'products_view', label: 'View Products' },
      { key: 'products_edit', label: 'Edit Products' }
    ]
  },
  {
    name: 'Customers',
    permissions: [
      { key: 'customers_view', label: 'View Customers' },
      { key: 'customers_edit', label: 'Edit Customers' }
    ]
  },
  {
    name: 'Alerts',
    permissions: [
      { key: 'alerts_view', label: 'View Alerts' },
      { key: 'alerts_manage', label: 'Manage Alerts' }
    ]
  },
  {
    name: 'Risk Rules',
    permissions: [
      { key: 'risk_rules_view', label: 'View Risk Rules' },
      { key: 'risk_rules_manage', label: 'Manage Risk Rules' }
    ]
  },
  {
    name: 'Integrations',
    permissions: [
      { key: 'integrations_view', label: 'View Integrations' },
      { key: 'integrations_manage', label: 'Manage Integrations' }
    ]
  },
  {
    name: 'Settings',
    permissions: [
      { key: 'settings_view', label: 'View Settings' },
      { key: 'settings_manage', label: 'Manage Settings' }
    ]
  },
  {
    name: 'User Management',
    permissions: [
      { key: 'users_view', label: 'View Users' },
      { key: 'users_manage', label: 'Manage Users' }
    ]
  },
  {
    name: 'System',
    permissions: [
      { key: 'audit_logs_view', label: 'View Audit Logs' },
      { key: 'system_health_view', label: 'View System Health' },
      { key: 'reports_export', label: 'Export Reports' }
    ]
  }
];

const EMPTY_PERMISSIONS = Object.keys(DEFAULT_ROLE_PERMISSIONS.viewer).reduce((acc, key) => {
  acc[key] = false;
  return acc;
}, {});

export default function RoleManagement({ tenantId }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    permissions: { ...EMPTY_PERMISSIONS }
  });
  
  const queryClient = useQueryClient();

  const { data: roles = [], isLoading } = useQuery({
    queryKey: ['roles', tenantId],
    queryFn: () => base44.entities.Role.filter({ tenant_id: tenantId }),
    enabled: !!tenantId
  });

  const createRoleMutation = useMutation({
    mutationFn: (data) => base44.entities.Role.create({
      tenant_id: tenantId,
      ...data,
      is_system_role: false
    }),
    onSuccess: () => {
      queryClient.invalidateQueries(['roles']);
      toast.success('Role created');
      closeDialog();
    },
    onError: (e) => toast.error('Failed to create role: ' + e.message)
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Role.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['roles']);
      toast.success('Role updated');
      closeDialog();
    },
    onError: (e) => toast.error('Failed to update role: ' + e.message)
  });

  const deleteRoleMutation = useMutation({
    mutationFn: (id) => base44.entities.Role.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['roles']);
      toast.success('Role deleted');
    },
    onError: (e) => toast.error('Failed to delete role: ' + e.message)
  });

  const openCreateDialog = () => {
    setEditingRole(null);
    setFormData({
      name: '',
      description: '',
      permissions: { ...EMPTY_PERMISSIONS }
    });
    setDialogOpen(true);
  };

  const openEditDialog = (role) => {
    setEditingRole(role);
    setFormData({
      name: role.name,
      description: role.description || '',
      permissions: { ...EMPTY_PERMISSIONS, ...role.permissions }
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingRole(null);
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) {
      toast.error('Role name is required');
      return;
    }

    if (editingRole) {
      updateRoleMutation.mutate({ id: editingRole.id, data: formData });
    } else {
      createRoleMutation.mutate(formData);
    }
  };

  const togglePermission = (key) => {
    setFormData(prev => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [key]: !prev.permissions[key]
      }
    }));
  };

  const applyTemplate = (templateName) => {
    const template = DEFAULT_ROLE_PERMISSIONS[templateName];
    if (template) {
      setFormData(prev => ({
        ...prev,
        permissions: { ...template }
      }));
    }
  };

  const countPermissions = (perms) => {
    return Object.values(perms || {}).filter(Boolean).length;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Roles & Permissions</h3>
          <p className="text-sm text-slate-500">Define roles with specific access permissions</p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="w-4 h-4 mr-2" /> Create Role
        </Button>
      </div>

      {/* Built-in Roles Info */}
      <Card className="bg-slate-50 border-dashed">
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <Lock className="w-5 h-5 text-slate-400 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-slate-700">Built-in Roles</p>
              <p className="text-xs text-slate-500 mt-1">
                <strong>Owner/Admin:</strong> Full access • <strong>Manager:</strong> View & edit most data • <strong>Analyst:</strong> View data, export reports • <strong>Viewer:</strong> Read-only access
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Custom Roles List */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : roles.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center">
            <Shield className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">No custom roles yet</p>
            <p className="text-sm text-slate-400 mt-1">Create roles to define specific permissions for team members</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {roles.map((role) => (
            <Card key={role.id}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-100 rounded-lg">
                      <Shield className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{role.name}</p>
                        {role.is_system_role && (
                          <Badge variant="outline" className="text-xs">System</Badge>
                        )}
                      </div>
                      <p className="text-sm text-slate-500">
                        {role.description || `${countPermissions(role.permissions)} permissions`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => openEditDialog(role)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    {!role.is_system_role && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-red-600 hover:text-red-700"
                        onClick={() => deleteRoleMutation.mutate(role.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRole ? 'Edit Role' : 'Create Role'}</DialogTitle>
            <DialogDescription>
              Define role name and select permissions
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Role Name</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Support Agent"
                />
              </div>
              <div>
                <Label>Description</Label>
                <Input
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Optional description"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs text-slate-500">Apply Template</Label>
              <div className="flex gap-2 mt-1">
                {['manager', 'analyst', 'viewer'].map((t) => (
                  <Button key={t} variant="outline" size="sm" onClick={() => applyTemplate(t)}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </Button>
                ))}
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              {PERMISSION_GROUPS.map((group) => (
                <div key={group.name}>
                  <p className="text-sm font-medium text-slate-700 mb-2">{group.name}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {group.permissions.map((perm) => (
                      <div key={perm.key} className="flex items-center justify-between p-2 border rounded-lg">
                        <Label className="text-sm font-normal">{perm.label}</Label>
                        <Switch
                          checked={formData.permissions[perm.key] || false}
                          onCheckedChange={() => togglePermission(perm.key)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button 
              onClick={handleSubmit}
              disabled={createRoleMutation.isPending || updateRoleMutation.isPending}
            >
              {(createRoleMutation.isPending || updateRoleMutation.isPending) && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              {editingRole ? 'Save Changes' : 'Create Role'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}