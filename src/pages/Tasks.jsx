import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryDefaults } from '@/components/utils/queryDefaults';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ClipboardList,
  Plus,
  Search,
  Filter,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Loader2
} from 'lucide-react';
import { usePlatformResolver, RESOLVER_STATUS, requireResolved, canQueryTenant, getTenantFilter, buildQueryKey } from '@/components/usePlatformResolver';
import TasksTable from '../components/tasks/TasksTable';
import TaskDetailPanel from '../components/tasks/TaskDetailPanel';
import CreateTaskDialog from '../components/tasks/CreateTaskDialog';

export default function Tasks() {
  // SINGLE SOURCE OF TRUTH: Platform Resolver
  const resolver = usePlatformResolver();
  const resolverCheck = requireResolved(resolver);
  
  const canQuery = canQueryTenant(resolverCheck);
  const queryFilter = getTenantFilter(resolverCheck);
  const tasksQueryKey = buildQueryKey('tasks', resolverCheck);
  
  const [user, setUser] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [filters, setFilters] = useState({
    status: 'all',
    priority: 'all',
    assigned_to: 'all',
    search: ''
  });

  const queryClient = useQueryClient();

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: tasksQueryKey,
    queryFn: () => base44.entities.Task.filter({ tenant_id: queryFilter.tenant_id }, '-created_date'),
    enabled: canQuery,
    ...queryDefaults.standard
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
    ...queryDefaults.config // Users list rarely changes
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Task.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tasksQueryKey });
    }
  });

  // Filter tasks
  const filteredTasks = tasks.filter(task => {
    if (filters.status !== 'all' && task.status !== filters.status) return false;
    if (filters.priority !== 'all' && task.priority !== filters.priority) return false;
    if (filters.assigned_to !== 'all' && task.assigned_to !== filters.assigned_to) return false;
    if (filters.search && !task.title.toLowerCase().includes(filters.search.toLowerCase())) return false;
    return true;
  });

  // Task stats
  const stats = {
    pending: tasks.filter(t => t.status === 'pending').length,
    in_progress: tasks.filter(t => t.status === 'in_progress').length,
    completed: tasks.filter(t => t.status === 'completed').length,
    overdue: tasks.filter(t => t.status !== 'completed' && t.due_date && new Date(t.due_date) < new Date()).length
  };

  const handleTaskSelect = useCallback((task) => {
    setSelectedTask(task);
  }, []);

  const handleTaskUpdate = useCallback((id, data) => {
    updateTaskMutation.mutate({ id, data });
    if (selectedTask?.id === id) {
      setSelectedTask({ ...selectedTask, ...data });
    }
  }, [updateTaskMutation, selectedTask]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <ClipboardList className="w-7 h-7 text-emerald-400" />
            Tasks
          </h1>
          <p className="text-slate-400 mt-1">Manage and track action items across your store</p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          Create Task
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="glass-card border-white/5 cursor-pointer transition-colors" onClick={() => setFilters({ ...filters, status: 'pending' })}>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Pending</p>
                <p className="text-2xl font-bold text-amber-400">{stats.pending}</p>
              </div>
              <Clock className="w-8 h-8 text-amber-500/20" />
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card border-white/5 cursor-pointer transition-colors" onClick={() => setFilters({ ...filters, status: 'in_progress' })}>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">In Progress</p>
                <p className="text-2xl font-bold text-blue-400">{stats.in_progress}</p>
              </div>
              <Loader2 className="w-8 h-8 text-blue-500/20" />
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card border-white/5 cursor-pointer transition-colors" onClick={() => setFilters({ ...filters, status: 'completed' })}>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Completed</p>
                <p className="text-2xl font-bold text-emerald-400">{stats.completed}</p>
              </div>
              <CheckCircle2 className="w-8 h-8 text-emerald-500/20" />
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card border-white/5 cursor-pointer transition-colors" onClick={() => setFilters({ ...filters, status: 'all' })}>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Overdue</p>
                <p className="text-2xl font-bold text-red-400">{stats.overdue}</p>
              </div>
              <AlertCircle className="w-8 h-8 text-red-500/20" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search tasks..."
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                className="pl-9"
              />
            </div>
            <Select value={filters.status} onValueChange={(v) => setFilters({ ...filters, status: v })}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filters.priority} onValueChange={(v) => setFilters({ ...filters, priority: v })}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priority</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filters.assigned_to} onValueChange={(v) => setFilters({ ...filters, assigned_to: v })}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Assigned To" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Users</SelectItem>
                {users.map(u => (
                  <SelectItem key={u.email} value={u.email}>{u.full_name || u.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(filters.status !== 'all' || filters.priority !== 'all' || filters.assigned_to !== 'all' || filters.search) && (
              <Button variant="ghost" onClick={() => setFilters({ status: 'all', priority: 'all', assigned_to: 'all', search: '' })}>
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tasks Table */}
      <TasksTable
        tasks={filteredTasks}
        users={users}
        isLoading={isLoading}
        onTaskSelect={handleTaskSelect}
        onTaskUpdate={handleTaskUpdate}
      />

      {/* Task Detail Panel */}
      <TaskDetailPanel
        task={selectedTask}
        users={users}
        isOpen={!!selectedTask}
        onClose={() => setSelectedTask(null)}
        onUpdate={handleTaskUpdate}
      />

      {/* Create Task Dialog */}
      <CreateTaskDialog
        tenantId={resolverCheck.tenantId}
        users={users}
        isOpen={isCreateDialogOpen}
        onClose={() => setIsCreateDialogOpen(false)}
      />
    </div>
  );
}