import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useDoubleGoodClient } from '@/hooks/useDoubleGoodClient';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Plus,
  Calendar as CalendarIcon,
  CheckCircle2,
  Circle,
  Clock,
  MoreHorizontal,
  Pencil,
  Trash2,
  ListTodo,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

type TaskStatus = 'todo' | 'in_progress' | 'complete';

interface Task {
  id: string;
  name: string;
  about: string | null;
  due_date: string | null;
  status: TaskStatus;
  created_at: string;
}

const STATUS_CONFIG: Record<TaskStatus, { label: string; icon: React.ReactNode; color: string }> = {
  todo: { label: 'To Do', icon: <Circle className="h-4 w-4" />, color: 'bg-muted text-muted-foreground' },
  in_progress: { label: 'In Progress', icon: <Clock className="h-4 w-4" />, color: 'bg-amber-500/20 text-amber-600' },
  complete: { label: 'Complete', icon: <CheckCircle2 className="h-4 w-4" />, color: 'bg-green-500/20 text-green-600' },
};

export function TasksSection() {
  const { data: client } = useDoubleGoodClient();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // Fetch tasks
  const { data: tasks, isLoading } = useQuery({
    queryKey: ['tasks', client?.id],
    queryFn: async () => {
      if (!client?.id) return [];
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('client_id', client.id)
        .order('due_date', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data as Task[];
    },
    enabled: !!client?.id,
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase.from('tasks').delete().eq('id', taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', client?.id] });
      toast({ title: 'Task deleted' });
    },
    onError: (err: any) => {
      toast({ title: 'Failed to delete', description: err.message, variant: 'destructive' });
    },
  });

  // Status update mutation
  const statusMutation = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: string; status: TaskStatus }) => {
      const { error } = await supabase.from('tasks').update({ status }).eq('id', taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', client?.id] });
    },
  });

  const handleStatusChange = (taskId: string, status: TaskStatus) => {
    statusMutation.mutate({ taskId, status });
  };

  const incompleteTasks = tasks?.filter(t => t.status !== 'complete') || [];
  const completeTasks = tasks?.filter(t => t.status === 'complete') || [];

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <ListTodo className="h-4 w-4" />
            CRM Tasks
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-14" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <ListTodo className="h-4 w-4" />
            CRM Tasks
          </CardTitle>
          <Button size="sm" onClick={() => setCreateModalOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Add Task
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {tasks?.length === 0 ? (
            <div className="text-center py-8">
              <ListTodo className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground mb-3">No tasks yet</p>
              <Button size="sm" onClick={() => setCreateModalOpen(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Add Task
              </Button>
            </div>
          ) : (
            <>
              {/* Incomplete tasks */}
              <div className="space-y-2">
                {incompleteTasks.map(task => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    onEdit={() => setEditingTask(task)}
                    onDelete={() => deleteMutation.mutate(task.id)}
                    onStatusChange={handleStatusChange}
                  />
                ))}
              </div>

              {/* Completed tasks (collapsed) */}
              {completeTasks.length > 0 && (
                <div className="pt-2 border-t">
                  <p className="text-xs text-muted-foreground mb-2">
                    Completed ({completeTasks.length})
                  </p>
                  <div className="space-y-2">
                    {completeTasks.slice(0, 3).map(task => (
                      <TaskItem
                        key={task.id}
                        task={task}
                        onEdit={() => setEditingTask(task)}
                        onDelete={() => deleteMutation.mutate(task.id)}
                        onStatusChange={handleStatusChange}
                      />
                    ))}
                    {completeTasks.length > 3 && (
                      <p className="text-xs text-muted-foreground">
                        +{completeTasks.length - 3} more completed
                      </p>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Modal */}
      <TaskModal
        open={createModalOpen || !!editingTask}
        onOpenChange={(open) => {
          if (!open) {
            setCreateModalOpen(false);
            setEditingTask(null);
          }
        }}
        task={editingTask}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['tasks', client?.id] });
          setCreateModalOpen(false);
          setEditingTask(null);
        }}
      />
    </>
  );
}

// Task Item Component
function TaskItem({
  task,
  onEdit,
  onDelete,
  onStatusChange,
}: {
  task: Task;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
}) {
  const config = STATUS_CONFIG[task.status];
  const isComplete = task.status === 'complete';

  return (
    <div className={cn(
      "flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors",
      isComplete && "opacity-60"
    )}>
      {/* Status toggle */}
      <button
        onClick={() => onStatusChange(task.id, isComplete ? 'todo' : 'complete')}
        className="mt-0.5 text-muted-foreground hover:text-primary transition-colors"
      >
        {isComplete ? (
          <CheckCircle2 className="h-5 w-5 text-green-500" />
        ) : (
          <Circle className="h-5 w-5" />
        )}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={cn("font-medium text-sm", isComplete && "line-through")}>
          {task.name}
        </p>
        {task.about && (
          <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{task.about}</p>
        )}
        <div className="flex items-center gap-2 mt-1">
          {task.due_date && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <CalendarIcon className="h-3 w-3" />
              {format(new Date(task.due_date), 'MMM d')}
            </span>
          )}
          {task.status === 'in_progress' && (
            <Badge variant="outline" className="text-xs h-5">In Progress</Badge>
          )}
        </div>
      </div>

      {/* Actions */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onEdit}>
            <Pencil className="h-4 w-4 mr-2" />
            Edit
          </DropdownMenuItem>
          {task.status !== 'in_progress' && (
            <DropdownMenuItem onClick={() => onStatusChange(task.id, 'in_progress')}>
              <Clock className="h-4 w-4 mr-2" />
              Mark In Progress
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={onDelete} className="text-destructive">
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// Task Modal (Create/Edit)
function TaskModal({
  open,
  onOpenChange,
  task,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: Task | null;
  onSuccess: () => void;
}) {
  const { data: client } = useDoubleGoodClient();
  const { user } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    about: '',
    due_date: undefined as Date | undefined,
    status: 'todo' as TaskStatus,
  });

  // Reset form when task changes
  useState(() => {
    if (task) {
      setFormData({
        name: task.name,
        about: task.about || '',
        due_date: task.due_date ? new Date(task.due_date) : undefined,
        status: task.status,
      });
    } else {
      setFormData({ name: '', about: '', due_date: undefined, status: 'todo' });
    }
  });

  // Also update when modal opens with a task
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen && task) {
      setFormData({
        name: task.name,
        about: task.about || '',
        due_date: task.due_date ? new Date(task.due_date) : undefined,
        status: task.status,
      });
    } else if (!newOpen) {
      setFormData({ name: '', about: '', due_date: undefined, status: 'todo' });
    }
    onOpenChange(newOpen);
  };

  const handleSubmit = async () => {
    if (!client?.id || !user?.id) {
      toast({ title: 'Missing context', variant: 'destructive' });
      return;
    }
    if (!formData.name.trim()) {
      toast({ title: 'Name is required', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      if (task) {
        // Update existing task
        const { error } = await supabase
          .from('tasks')
          .update({
            name: formData.name,
            about: formData.about || null,
            due_date: formData.due_date?.toISOString().split('T')[0] || null,
            status: formData.status,
          })
          .eq('id', task.id);
        if (error) throw error;
        toast({ title: 'Task updated' });
      } else {
        // Create new task
        const { error } = await supabase.from('tasks').insert({
          client_id: client.id,
          user_id: user.id,
          name: formData.name,
          about: formData.about || null,
          due_date: formData.due_date?.toISOString().split('T')[0] || null,
          status: formData.status,
        });
        if (error) throw error;
        toast({ title: 'Task created' });
      }
      onSuccess();
    } catch (err: any) {
      toast({ title: 'Failed to save', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{task ? 'Edit Task' : 'Add Task'}</DialogTitle>
          <DialogDescription>
            {task ? 'Update the task details' : 'Create a new CRM task'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Name */}
          <div className="space-y-2">
            <Label>Task Name *</Label>
            <Input
              placeholder="e.g., Review Q4 campaign performance"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            />
          </div>

          {/* Due Date */}
          <div className="space-y-2">
            <Label>Due Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn("w-full justify-start text-left", !formData.due_date && "text-muted-foreground")}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {formData.due_date ? format(formData.due_date, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={formData.due_date}
                  onSelect={(date) => setFormData(prev => ({ ...prev, due_date: date }))}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* About */}
          <div className="space-y-2">
            <Label>About</Label>
            <Textarea
              placeholder="Describe what needs to be done..."
              value={formData.about}
              onChange={(e) => setFormData(prev => ({ ...prev, about: e.target.value }))}
              rows={3}
            />
          </div>

          {/* Status (only for edit) */}
          {task && (
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={formData.status}
                onValueChange={(v) => setFormData(prev => ({ ...prev, status: v as TaskStatus }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todo">To Do</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="complete">Complete</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading || !formData.name.trim()}>
            {task ? 'Save Changes' : 'Add Task'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
