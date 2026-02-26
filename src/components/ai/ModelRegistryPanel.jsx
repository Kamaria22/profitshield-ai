import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Package, Search, Plus, CheckCircle, Clock, AlertTriangle, Filter } from 'lucide-react';

export default function ModelRegistryPanel({ tenantId }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: models = [], isLoading } = useQuery({
    queryKey: ['modelRegistry', tenantId],
    queryFn: async () => {
      const all = await base44.entities.AIModelVersion.list();
      return all.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
    },
  });

  const registerModelMutation = useMutation({
    mutationFn: async (modelData) => {
      return await base44.entities.AIModelVersion.create(modelData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['modelRegistry']);
      setIsAddDialogOpen(false);
    },
  });

  const filteredModels = models.filter(model => {
    const matchesSearch = !searchQuery || 
      model.model_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      model.version.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesType = filterType === 'all' || model.model_type === filterType;
    const matchesStatus = filterStatus === 'all' || model.compliance_status === filterStatus;
    
    return matchesSearch && matchesType && matchesStatus;
  });

  const stats = {
    total: models.length,
    deployed: models.filter(m => m.is_deployed).length,
    approved: models.filter(m => m.compliance_status === 'approved').length,
    pending: models.filter(m => m.compliance_status === 'pending_review').length,
  };

  return (
    <div className="space-y-4">
      {/* Header with Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Total Models</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <Package className="w-8 h-8 text-slate-400" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Deployed</p>
                <p className="text-2xl font-bold text-green-600">{stats.deployed}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Approved</p>
                <p className="text-2xl font-bold text-blue-600">{stats.approved}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Pending Review</p>
                <p className="text-2xl font-bold text-amber-600">{stats.pending}</p>
              </div>
              <Clock className="w-8 h-8 text-amber-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              Model Registry
            </CardTitle>
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="w-4 h-4 mr-2" />
                  Register Model
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Register New Model</DialogTitle>
                  <DialogDescription>Add a new AI model to the registry</DialogDescription>
                </DialogHeader>
                <RegisterModelForm onSubmit={registerModelMutation.mutate} isLoading={registerModelMutation.isLoading} />
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search models..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Model Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="fraud_detection">Fraud Detection</SelectItem>
                <SelectItem value="risk_scoring">Risk Scoring</SelectItem>
                <SelectItem value="churn_prediction">Churn Prediction</SelectItem>
                <SelectItem value="pricing_optimization">Pricing</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="pending_review">Pending</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Models List */}
          <div className="space-y-2">
            {isLoading ? (
              <div className="text-center py-8 text-slate-500">Loading models...</div>
            ) : filteredModels.length === 0 ? (
              <div className="text-center py-8 text-slate-500">No models found</div>
            ) : (
              filteredModels.map(model => (
                <div key={model.id} className="border border-slate-200 rounded-lg p-4 hover:bg-slate-50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold">{model.model_name}</h3>
                        <Badge variant="outline" className="text-xs">v{model.version}</Badge>
                        {model.is_deployed && <Badge className="bg-green-500">Deployed</Badge>}
                        <Badge variant={
                          model.compliance_status === 'approved' ? 'default' :
                          model.compliance_status === 'pending_review' ? 'outline' :
                          'destructive'
                        }>
                          {model.compliance_status}
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-500 mb-2">{model.model_type}</p>
                      <div className="grid grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="text-slate-500">Drift:</span>
                          <span className={`ml-2 font-medium ${model.drift_score >= 75 ? 'text-red-600' : model.drift_score >= 50 ? 'text-amber-600' : 'text-green-600'}`}>
                            {model.drift_score || 0}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500">Bias:</span>
                          <span className={`ml-2 font-medium ${model.bias_score >= 75 ? 'text-red-600' : model.bias_score >= 50 ? 'text-amber-600' : 'text-green-600'}`}>
                            {model.bias_score || 0}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500">Precision:</span>
                          <span className="ml-2 font-medium">{model.precision ? (model.precision * 100).toFixed(1) : 'N/A'}%</span>
                        </div>
                        <div>
                          <span className="text-slate-500">F1:</span>
                          <span className="ml-2 font-medium">{model.f1_score ? model.f1_score.toFixed(3) : 'N/A'}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-slate-500">
                      {new Date(model.created_date).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function RegisterModelForm({ onSubmit, isLoading }) {
  const [formData, setFormData] = useState({
    model_name: '',
    version: '',
    model_type: 'fraud_detection',
    precision: '',
    recall: '',
    f1_score: '',
    bias_score: '',
    drift_score: '',
    changelog: '',
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      ...formData,
      precision: parseFloat(formData.precision) || 0,
      recall: parseFloat(formData.recall) || 0,
      f1_score: parseFloat(formData.f1_score) || 0,
      bias_score: parseFloat(formData.bias_score) || 0,
      drift_score: parseFloat(formData.drift_score) || 0,
      compliance_status: 'pending_review',
      evaluation_score: parseFloat(formData.precision) * 100 || 0,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label>Model Name</Label>
        <Input
          value={formData.model_name}
          onChange={(e) => setFormData({ ...formData, model_name: e.target.value })}
          placeholder="fraud_detector_v1"
          required
        />
      </div>
      <div>
        <Label>Version</Label>
        <Input
          value={formData.version}
          onChange={(e) => setFormData({ ...formData, version: e.target.value })}
          placeholder="1.0.0"
          required
        />
      </div>
      <div>
        <Label>Model Type</Label>
        <Select value={formData.model_type} onValueChange={(value) => setFormData({ ...formData, model_type: value })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fraud_detection">Fraud Detection</SelectItem>
            <SelectItem value="risk_scoring">Risk Scoring</SelectItem>
            <SelectItem value="churn_prediction">Churn Prediction</SelectItem>
            <SelectItem value="pricing_optimization">Pricing Optimization</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Precision</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            max="1"
            value={formData.precision}
            onChange={(e) => setFormData({ ...formData, precision: e.target.value })}
            placeholder="0.85"
          />
        </div>
        <div>
          <Label>Recall</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            max="1"
            value={formData.recall}
            onChange={(e) => setFormData({ ...formData, recall: e.target.value })}
            placeholder="0.80"
          />
        </div>
      </div>
      <div>
        <Label>Changelog</Label>
        <Textarea
          value={formData.changelog}
          onChange={(e) => setFormData({ ...formData, changelog: e.target.value })}
          placeholder="Initial model release"
          rows={3}
        />
      </div>
      <Button type="submit" disabled={isLoading} className="w-full">
        {isLoading ? 'Registering...' : 'Register Model'}
      </Button>
    </form>
  );
}