import React, { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  User,
  Calendar,
  Link as LinkIcon,
  FileText,
  Bell,
  Play,
  Loader2,
  Save
} from 'lucide-react';
import { format, isPast } from 'date-fns';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { toast } from 'sonner';

const statusConfig = {
  pending: { label: 'Pending', icon: Clock, color: 'bg-amber-100 text-amber-700' },
  in_progress: { label: 'In Progress', icon: Loader2, color: 'bg-blue-100 text-blue-700' },
  completed: { label: 'Completed', icon: CheckCircle2, color: 'bg-emerald-100 text-emerald-700' },
  cancelled: { label: 'Cancelled', icon: XCircle, color: 'bg-slate-100 text-slate-700' }
};

const priorityConfig = {
  urgent: { label: 'Urgent', color: 'bg-red-100 text-red-700' },
  high: { label: 'High', color: 'bg-orange-100 text-orange-700' },
  medium: { label: 'Medium', color: 'bg-yellow-100 text-yellow-700' },
  low: { label: 'Low', color: 'bg-slate-100 text-slate-600' }
};

export default function TaskDetailPanel({ task, users, isOpen, onClose, onUpdate }) {
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (task) {
      setFormData({
        status: task.status,
        priority: task.priority,
        assigned_to: task.assigned_to || '',
        due_date: task.due_date ? task.due_date.split('T')[0] : '',
        notes: task.notes || ''
      });
      setEditMode(false);
    }
  }, [task]);

  if (!task) return null;

  const status = statusConfig[task.status] || statusConfig.pending;
  const priority = priorityConfig[task.priority] || priorityConfig.medium;
  const StatusIcon = status.icon;
  const isOverdue = task.due_date && isPast(new Date(task.due_date)) && task.status !== 'completed';

  const handleSave = async () => {
    setIsSaving(true);
    const updateData = { ...formData };
    
    if (updateData.due_date) {
      updateData.due_date = new Date(updateData.due_date).toISOString();
    }
    
    if (updateData.status === 'completed' && task.status !== 'completed') {
      updateData.completed_at = new Date().toISOString();
    }

    onUpdate(task.id, updateData);
    toast.success('Task updated');
    setIsSaving(false);
    setEditMode(false);
  };

  const handleQuickStatusChange = (newStatus) => {
    const updateData = { status: newStatus };
    if (newStatus === 'completed') {
      updateData.completed_at = new Date().toISOString();
    }
    onUpdate(task.id, updateData);
    setFormData({ ...formData, status: newStatus });
    toast.success(`Task marked as ${newStatus.replace('_', ' ')}`);
  };

  const getUserName = (email) => {
    const user = users.find(u => u.email === email);
    return user?.full_name || email || 'Unassigned';
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-emerald-600" />
            Task Details
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Title & Description */}
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{task.title}</h2>
            {task.description && (
              <p className="mt-2 text-slate-600">{task.description}</p>
            )}
          </div>

          {/* Quick Actions */}
          {!editMode && task.status !== 'completed' && (
            <div className="flex gap-2">
              {task.status === 'pending' && (
                <Button size="sm" variant="outline" onClick={() => handleQuickStatusChange('in_progress')}>
                  <Play className="w-4 h-4 mr-1" />
                  Start
                </Button>
              )}
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => handleQuickStatusChange('completed')}>
                <CheckCircle2 className="w-4 h-4 mr-1" />
                Complete
              </Button>
            </div>
          )}

          <Separator />

          {/* Status & Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-slate-500">Status</Label>
              {editMode ? (
                <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <div className="mt-1">
                  <Badge className={`${status.color} gap-1`}>
                    <StatusIcon className="w-3 h-3" />
                    {status.label}
                  </Badge>
                </div>
              )}
            </div>
            <div>
              <Label className="text-slate-500">Priority</Label>
              {editMode ? (
                <Select value={formData.priority} onValueChange={(v) => setFormData({ ...formData, priority: v })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="urgent">Urgent</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <div className="mt-1">
                  <Badge className={priority.color}>
                    {priority.label}
                  </Badge>
                </div>
              )}
            </div>
          </div>

          {/* Assigned To */}
          <div>
            <Label className="text-slate-500 flex items-center gap-1">
              <User className="w-4 h-4" />
              Assigned To
            </Label>
            {editMode ? (
              <Select value={formData.assigned_to || 'unassigned'} onValueChange={(v) => setFormData({ ...formData, assigned_to: v === 'unassigned' ? '' : v })}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select user" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {users.map(u => (
                    <SelectItem key={u.email} value={u.email}>{u.full_name || u.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="mt-1 text-slate-900">{getUserName(task.assigned_to)}</p>
            )}
          </div>

          {/* Due Date */}
          <div>
            <Label className="text-slate-500 flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              Due Date
            </Label>
            {editMode ? (
              <Input
                type="date"
                value={formData.due_date}
                onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                className="mt-1"
              />
            ) : (
              <p className={`mt-1 ${isOverdue ? 'text-red-600 font-medium' : 'text-slate-900'}`}>
                {isOverdue && <AlertCircle className="w-4 h-4 inline mr-1" />}
                {task.due_date ? format(new Date(task.due_date), 'MMMM d, yyyy') : 'No due date'}
              </p>
            )}
          </div>

          {/* Notes */}
          <div>
            <Label className="text-slate-500">Notes</Label>
            {editMode ? (
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Add notes..."
                className="mt-1"
                rows={3}
              />
            ) : (
              <p className="mt-1 text-slate-900 whitespace-pre-wrap">
                {task.notes || <span className="text-slate-400">No notes</span>}
              </p>
            )}
          </div>

          <Separator />

          {/* Related Entity */}
          {task.related_entity_type && task.related_entity_id && (
            <div>
              <Label className="text-slate-500 flex items-center gap-1">
                <LinkIcon className="w-4 h-4" />
                Related {task.related_entity_type}
              </Label>
              <Link
                to={`${createPageUrl(task.related_entity_type === 'order' ? 'Orders' : 'Alerts')}?id=${task.related_entity_id}`}
                className="mt-1 inline-flex items-center gap-1 text-emerald-600 hover:underline"
              >
                View {task.related_entity_type}
                <LinkIcon className="w-3 h-3" />
              </Link>
            </div>
          )}

          {/* Source Alert */}
          {task.source_alert_id && (
            <div>
              <Label className="text-slate-500 flex items-center gap-1">
                <Bell className="w-4 h-4" />
                Created from Alert
              </Label>
              <Link
                to={`${createPageUrl('Alerts')}?id=${task.source_alert_id}`}
                className="mt-1 inline-flex items-center gap-1 text-emerald-600 hover:underline"
              >
                View source alert
                <LinkIcon className="w-3 h-3" />
              </Link>
            </div>
          )}

          {/* Timestamps */}
          <div className="text-xs text-slate-400 space-y-1">
            <p>Created: {format(new Date(task.created_date), 'MMM d, yyyy h:mm a')}</p>
            {task.completed_at && (
              <p>Completed: {format(new Date(task.completed_at), 'MMM d, yyyy h:mm a')}</p>
            )}
          </div>

          <Separator />

          {/* Actions */}
          <div className="flex gap-2">
            {editMode ? (
              <>
                <Button variant="outline" onClick={() => setEditMode(false)} className="flex-1">
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={isSaving} className="flex-1">
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
                  Save
                </Button>
              </>
            ) : (
              <Button variant="outline" onClick={() => setEditMode(true)} className="w-full">
                Edit Task
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}