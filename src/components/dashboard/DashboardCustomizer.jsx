import React, { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { 
  Settings, 
  GripVertical, 
  Eye, 
  EyeOff, 
  RotateCcw,
  Save,
  Sparkles
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

const DEFAULT_PANELS = [
  { id: 'profit-health', name: 'Profit Health', category: 'financial', enabled: true },
  { id: 'risk-command', name: 'Risk Intelligence', category: 'risk', enabled: true },
  { id: 'margin-leak', name: 'Margin Leaks', category: 'financial', enabled: true },
  { id: 'alerts', name: 'Alerts & Tasks', category: 'operations', enabled: true },
  { id: 'cashflow', name: 'Cashflow Projection', category: 'financial', enabled: true },
  { id: 'security', name: 'Security & Compliance', category: 'security', enabled: true },
  { id: 'advanced-analytics', name: 'Advanced Analytics', category: 'analytics', enabled: false },
  { id: 'ai-automations', name: 'AI Automations', category: 'ai', enabled: false },
  { id: 'integrations', name: 'Integrations', category: 'operations', enabled: false },
  { id: 'financial-reporting', name: 'Financial Reporting', category: 'financial', enabled: false },
  { id: 'risk-mitigation', name: 'Risk Mitigation', category: 'risk', enabled: false },
  { id: 'ceo-insights', name: 'CEO Insights', category: 'ai', enabled: false },
];

export default function DashboardCustomizer({ userId, onLayoutChange }) {
  const [open, setOpen] = useState(false);
  const [panels, setPanels] = useState(DEFAULT_PANELS);
  const [saving, setSaving] = useState(false);

  // Load saved layout
  useEffect(() => {
    loadLayout();
  }, [userId]);

  const loadLayout = async () => {
    if (!userId) return;
    
    try {
      const userPrefs = await base44.entities.User.filter({ id: userId });
      if (userPrefs.length > 0 && userPrefs[0].dashboard_layout) {
        const saved = JSON.parse(userPrefs[0].dashboard_layout);
        setPanels(saved);
      }
    } catch (e) {
      console.warn('Could not load dashboard layout:', e);
    }
  };

  const handleDragEnd = (result) => {
    if (!result.destination) return;

    const items = Array.from(panels);
    const [reordered] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reordered);

    setPanels(items);
  };

  const togglePanel = (id) => {
    setPanels(panels.map(p => 
      p.id === id ? { ...p, enabled: !p.enabled } : p
    ));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await base44.auth.updateMe({
        dashboard_layout: JSON.stringify(panels)
      });
      
      // Notify parent component
      if (onLayoutChange) {
        onLayoutChange(panels);
      }
      
      toast.success('Dashboard layout saved!');
      setOpen(false);
    } catch (e) {
      toast.error('Failed to save layout');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setPanels(DEFAULT_PANELS);
    toast.info('Layout reset to default');
  };

  const enabledCount = panels.filter(p => p.enabled).length;
  const categoryColors = {
    financial: 'bg-emerald-100 text-emerald-700',
    risk: 'bg-red-100 text-red-700',
    operations: 'bg-blue-100 text-blue-700',
    security: 'bg-purple-100 text-purple-700',
    analytics: 'bg-amber-100 text-amber-700',
    ai: 'bg-pink-100 text-pink-700'
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Settings className="w-4 h-4" />
          Customize Dashboard
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-600" />
            Customize Your Dashboard
          </DialogTitle>
          <DialogDescription>
            Drag to reorder panels and toggle visibility. Changes apply immediately after saving.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Stats */}
          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
            <div>
              <p className="text-sm font-medium text-slate-900">{enabledCount} panels visible</p>
              <p className="text-xs text-slate-500">{panels.length - enabledCount} panels hidden</p>
            </div>
            <Button variant="ghost" size="sm" onClick={handleReset}>
              <RotateCcw className="w-4 h-4 mr-2" />
              Reset to Default
            </Button>
          </div>

          {/* Drag & Drop List */}
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="panels">
              {(provided) => (
                <div 
                  {...provided.droppableProps} 
                  ref={provided.innerRef}
                  className="space-y-2"
                >
                  {panels.map((panel, index) => (
                    <Draggable key={panel.id} draggableId={panel.id} index={index}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={`
                            flex items-center gap-3 p-3 bg-white border rounded-lg
                            ${snapshot.isDragging ? 'shadow-lg border-emerald-300' : 'border-slate-200'}
                            ${!panel.enabled ? 'opacity-50' : ''}
                          `}
                        >
                          <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing">
                            <GripVertical className="w-5 h-5 text-slate-400" />
                          </div>
                          
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-slate-900">{panel.name}</p>
                              <Badge variant="outline" className={`text-xs ${categoryColors[panel.category]}`}>
                                {panel.category}
                              </Badge>
                            </div>
                          </div>

                          <button
                            onClick={() => togglePanel(panel.id)}
                            className="p-2 hover:bg-slate-100 rounded transition-colors"
                          >
                            {panel.enabled ? (
                              <Eye className="w-4 h-4 text-emerald-600" />
                            ) : (
                              <EyeOff className="w-4 h-4 text-slate-400" />
                            )}
                          </button>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>

          {/* Save Button */}
          <div className="flex gap-2 pt-4 border-t">
            <Button 
              onClick={handleSave} 
              disabled={saving}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700"
            >
              <Save className="w-4 h-4 mr-2" />
              {saving ? 'Saving...' : 'Save Layout'}
            </Button>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}