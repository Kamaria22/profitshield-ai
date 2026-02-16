import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  MoreHorizontal,
  Play,
  User,
  ExternalLink,
  Loader2
} from 'lucide-react';
import { format, formatDistanceToNow, isPast } from 'date-fns';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

const statusConfig = {
  pending: { label: 'Pending', icon: Clock, color: 'bg-amber-100 text-amber-700' },
  in_progress: { label: 'In Progress', icon: Loader2, color: 'bg-blue-100 text-blue-700' },
  completed: { label: 'Completed', icon: CheckCircle2, color: 'bg-emerald-100 text-emerald-700' },
  cancelled: { label: 'Cancelled', icon: XCircle, color: 'bg-slate-100 text-slate-700' }
};

const priorityConfig = {
  urgent: { label: 'Urgent', color: 'bg-red-100 text-red-700 border-red-200' },
  high: { label: 'High', color: 'bg-orange-100 text-orange-700 border-orange-200' },
  medium: { label: 'Medium', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  low: { label: 'Low', color: 'bg-slate-100 text-slate-600 border-slate-200' }
};

export default function TasksTable({ tasks, users, isLoading, onTaskSelect, onTaskUpdate }) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-slate-500">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
          Loading tasks...
        </CardContent>
      </Card>
    );
  }

  if (tasks.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Clock className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">No tasks found</p>
          <p className="text-sm text-slate-400">Tasks will appear here when created manually or from alert rules</p>
        </CardContent>
      </Card>
    );
  }

  const getUserName = (email) => {
    const user = users.find(u => u.email === email);
    return user?.full_name || email || 'Unassigned';
  };

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Task</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Assigned To</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead>Related</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.map((task) => {
              const status = statusConfig[task.status] || statusConfig.pending;
              const priority = priorityConfig[task.priority] || priorityConfig.medium;
              const StatusIcon = status.icon;
              const isOverdue = task.due_date && isPast(new Date(task.due_date)) && task.status !== 'completed';

              return (
                <TableRow 
                  key={task.id} 
                  className="cursor-pointer hover:bg-slate-50"
                  onClick={() => onTaskSelect(task)}
                >
                  <TableCell>
                    <div>
                      <p className="font-medium text-slate-900">{task.title}</p>
                      {task.description && (
                        <p className="text-sm text-slate-500 truncate max-w-xs">{task.description}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={`${status.color} gap-1`}>
                      <StatusIcon className="w-3 h-3" />
                      {status.label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={priority.color}>
                      {priority.label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center">
                        <User className="w-3 h-3 text-slate-500" />
                      </div>
                      <span className="text-sm">{getUserName(task.assigned_to)}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {task.due_date ? (
                      <div className={`text-sm ${isOverdue ? 'text-red-600 font-medium' : 'text-slate-600'}`}>
                        {isOverdue && <AlertCircle className="w-3 h-3 inline mr-1" />}
                        {format(new Date(task.due_date), 'MMM d, yyyy')}
                        <p className="text-xs text-slate-400">
                          {formatDistanceToNow(new Date(task.due_date), { addSuffix: true })}
                        </p>
                      </div>
                    ) : (
                      <span className="text-sm text-slate-400">No due date</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {task.related_entity_type && task.related_entity_id && (
                      <Link 
                        to={`${createPageUrl(task.related_entity_type === 'order' ? 'Orders' : 'Alerts')}?id=${task.related_entity_id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-sm text-emerald-600 hover:underline flex items-center gap-1"
                      >
                        {task.related_entity_type}
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {task.status === 'pending' && (
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onTaskUpdate(task.id, { status: 'in_progress' }); }}>
                            <Play className="w-4 h-4 mr-2" />
                            Start Task
                          </DropdownMenuItem>
                        )}
                        {task.status !== 'completed' && (
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onTaskUpdate(task.id, { status: 'completed', completed_at: new Date().toISOString() }); }}>
                            <CheckCircle2 className="w-4 h-4 mr-2" />
                            Mark Complete
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onTaskUpdate(task.id, { status: 'cancelled' }); }}>
                          <XCircle className="w-4 h-4 mr-2" />
                          Cancel Task
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}