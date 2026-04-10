import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { 
  Ruler, 
  Smartphone, 
  Monitor, 
  Tablet, 
  Watch,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Mail,
  Bell,
  MessageSquare,
  Type,
  Save
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import {
  DEFAULT_CLIENT_COPY_RULES,
  parseClientCopyRules,
  type ClientCopyRule,
} from '@/lib/copyRules';

type CopyRule = ClientCopyRule;

interface RulesTabProps {
  clientId: string;
  /** Loaded from `clients.copy_rules`; CRM Copilot reads the saved row. */
  initialCopyRules?: Json | null;
  onPersist?: () => void;
}

const CHANNEL_ICONS = {
  email: Mail,
  push: Bell,
  sms: MessageSquare,
  in_app: Smartphone,
};

const CHANNEL_LABELS = {
  email: 'Email',
  push: 'Push',
  sms: 'SMS',
  in_app: 'In-App',
};

const DEVICE_ICONS = {
  mobile: Smartphone,
  tablet: Tablet,
  desktop: Monitor,
  watch: Watch,
};

export function RulesTab({ clientId, initialCopyRules, onPersist }: RulesTabProps) {
  const rulesStorageKey = useMemo(() => JSON.stringify(initialCopyRules ?? null), [initialCopyRules]);

  const [rules, setRules] = useState<CopyRule[]>(
    () => parseClientCopyRules(initialCopyRules ?? null) ?? DEFAULT_CLIENT_COPY_RULES,
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const parsed = parseClientCopyRules(initialCopyRules ?? null);
    if (parsed) setRules(parsed);
  }, [rulesStorageKey]);

  const persistRules = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('clients')
        .update({
          copy_rules: rules as unknown as Json,
          updated_at: new Date().toISOString(),
        })
        .eq('id', clientId);
      if (error) throw error;
      toast.success('Copy rules saved to workspace');
      onPersist?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save copy rules');
    } finally {
      setSaving(false);
    }
  };
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<CopyRule>>({});
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newRule, setNewRule] = useState<Partial<CopyRule>>({
    channel: 'email',
    element: '',
    minChars: 20,
    maxChars: 100,
    deviceTypes: ['mobile', 'desktop'],
    isActive: true,
  });

  const startEditing = (rule: CopyRule) => {
    setEditingId(rule.id);
    setEditForm(rule);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditForm({});
  };

  const saveEdit = () => {
    if (!editingId) return;
    setRules((prev) => prev.map((r) => r.id === editingId ? { ...r, ...editForm } as CopyRule : r));
    setEditingId(null);
    setEditForm({});
  };

  const toggleRule = (id: string) => {
    setRules((prev) => prev.map((r) => r.id === id ? { ...r, isActive: !r.isActive } : r));
  };

  const deleteRule = (id: string) => {
    setRules((prev) => prev.filter((r) => r.id !== id));
    toast.success('Rule deleted');
  };

  const addNewRule = () => {
    if (!newRule.element || !newRule.channel) {
      toast.error('Please fill in all required fields');
      return;
    }
    const rule: CopyRule = {
      id: crypto.randomUUID(),
      channel: newRule.channel as CopyRule['channel'],
      element: newRule.element,
      minChars: newRule.minChars || 20,
      maxChars: newRule.maxChars || 100,
      deviceTypes: newRule.deviceTypes || ['mobile', 'desktop'],
      isActive: true,
    };
    setRules((prev) => [...prev, rule]);
    setIsAddingNew(false);
    setNewRule({
      channel: 'email',
      element: '',
      minChars: 20,
      maxChars: 100,
      deviceTypes: ['mobile', 'desktop'],
      isActive: true,
    });
    toast.success('Rule added');
  };

  const toggleDeviceType = (device: CopyRule['deviceTypes'][number], isEdit = false) => {
    if (isEdit) {
      const current = editForm.deviceTypes || [];
      const updated = current.includes(device)
        ? current.filter((d) => d !== device)
        : [...current, device];
      setEditForm((prev) => ({ ...prev, deviceTypes: updated }));
    } else {
      const current = newRule.deviceTypes || [];
      const updated = current.includes(device)
        ? current.filter((d) => d !== device)
        : [...current, device];
      setNewRule((prev) => ({ ...prev, deviceTypes: updated }));
    }
  };

  const groupedRules = rules.reduce((acc, rule) => {
    if (!acc[rule.channel]) acc[rule.channel] = [];
    acc[rule.channel].push(rule);
    return acc;
  }, {} as Record<string, CopyRule[]>);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-cyan-500/10 flex items-center justify-center">
            <Ruler className="h-5 w-5 text-cyan-500" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Copy Rules</h2>
            <p className="text-sm text-muted-foreground">Character limits and device-specific guidelines</p>
            <p className="text-xs text-muted-foreground mt-1">
              Click Save so CRM Copilot uses these limits on the next chat request.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="default" onClick={() => void persistRules()} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Saving…' : 'Save copy rules'}
          </Button>
          <Button onClick={() => setIsAddingNew(true)} disabled={isAddingNew} variant="outline">
            <Plus className="h-4 w-4 mr-2" />
            Add Rule
          </Button>
        </div>
      </div>

      {/* Add New Rule Form */}
      {isAddingNew && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">New Copy Rule</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Channel</Label>
                <div className="flex gap-2">
                  {(['email', 'push', 'sms', 'in_app'] as const).map((channel) => {
                    const Icon = CHANNEL_ICONS[channel];
                    return (
                      <Button
                        key={channel}
                        type="button"
                        variant={newRule.channel === channel ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setNewRule((prev) => ({ ...prev, channel }))}
                      >
                        <Icon className="h-4 w-4 mr-1" />
                        {CHANNEL_LABELS[channel]}
                      </Button>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Element Name</Label>
                <Input
                  placeholder="e.g., Subject Line, CTA Button"
                  value={newRule.element || ''}
                  onChange={(e) => setNewRule((prev) => ({ ...prev, element: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Min Characters</Label>
                <Input
                  type="number"
                  value={newRule.minChars || 20}
                  onChange={(e) => setNewRule((prev) => ({ ...prev, minChars: parseInt(e.target.value) || 0 }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Max Characters</Label>
                <Input
                  type="number"
                  value={newRule.maxChars || 100}
                  onChange={(e) => setNewRule((prev) => ({ ...prev, maxChars: parseInt(e.target.value) || 0 }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Device Types</Label>
              <div className="flex gap-2">
                {(['mobile', 'tablet', 'desktop', 'watch'] as const).map((device) => {
                  const Icon = DEVICE_ICONS[device];
                  const isSelected = newRule.deviceTypes?.includes(device);
                  return (
                    <Button
                      key={device}
                      type="button"
                      variant={isSelected ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => toggleDeviceType(device)}
                    >
                      <Icon className="h-4 w-4 mr-1" />
                      {device.charAt(0).toUpperCase() + device.slice(1)}
                    </Button>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={addNewRule}>
                <Check className="h-4 w-4 mr-1" />
                Add Rule
              </Button>
              <Button variant="outline" onClick={() => setIsAddingNew(false)}>
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rules by Channel */}
      {Object.entries(groupedRules).map(([channel, channelRules]) => {
        const ChannelIcon = CHANNEL_ICONS[channel as keyof typeof CHANNEL_ICONS];
        return (
          <Card key={channel}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ChannelIcon className="h-4 w-4" />
                {CHANNEL_LABELS[channel as keyof typeof CHANNEL_LABELS]}
              </CardTitle>
              <CardDescription>
                {channelRules.filter((r) => r.isActive).length} active rules
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {channelRules.map((rule) => (
                  <div key={rule.id}>
                    {editingId === rule.id ? (
                      <div className="p-4 border rounded-lg bg-muted/50 space-y-4">
                        <div className="grid sm:grid-cols-3 gap-4">
                          <div className="space-y-1">
                            <Label className="text-xs">Element</Label>
                            <Input
                              value={editForm.element || ''}
                              onChange={(e) => setEditForm((prev) => ({ ...prev, element: e.target.value }))}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Min Chars</Label>
                            <Input
                              type="number"
                              value={editForm.minChars || 0}
                              onChange={(e) => setEditForm((prev) => ({ ...prev, minChars: parseInt(e.target.value) || 0 }))}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Max Chars</Label>
                            <Input
                              type="number"
                              value={editForm.maxChars || 0}
                              onChange={(e) => setEditForm((prev) => ({ ...prev, maxChars: parseInt(e.target.value) || 0 }))}
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Device Types</Label>
                          <div className="flex gap-2">
                            {(['mobile', 'tablet', 'desktop', 'watch'] as const).map((device) => {
                              const Icon = DEVICE_ICONS[device];
                              const isSelected = editForm.deviceTypes?.includes(device);
                              return (
                                <Button
                                  key={device}
                                  type="button"
                                  variant={isSelected ? 'default' : 'outline'}
                                  size="sm"
                                  onClick={() => toggleDeviceType(device, true)}
                                >
                                  <Icon className="h-3 w-3" />
                                </Button>
                              );
                            })}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={saveEdit}>
                            <Check className="h-4 w-4 mr-1" />
                            Save
                          </Button>
                          <Button size="sm" variant="outline" onClick={cancelEditing}>
                            <X className="h-4 w-4 mr-1" />
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className={`flex items-center justify-between p-3 border rounded-lg ${!rule.isActive ? 'opacity-50' : ''}`}>
                        <div className="flex items-center gap-4">
                          <Switch
                            checked={rule.isActive}
                            onCheckedChange={() => toggleRule(rule.id)}
                          />
                          <div>
                            <div className="flex items-center gap-2">
                              <Type className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium text-sm">{rule.element}</span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              {rule.minChars}–{rule.maxChars} characters
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex gap-1">
                            {rule.deviceTypes.map((device) => {
                              const Icon = DEVICE_ICONS[device];
                              return (
                                <Badge key={device} variant="outline" className="h-6 w-6 p-0 flex items-center justify-center">
                                  <Icon className="h-3 w-3" />
                                </Badge>
                              );
                            })}
                          </div>
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" onClick={() => startEditing(rule)}>
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteRule(rule.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* Quick Reference */}
      <Card className="border-amber-500/20 bg-amber-500/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Quick Reference</CardTitle>
          <CardDescription>Industry-standard character limits</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <div className="p-3 bg-background rounded-lg">
              <p className="font-medium flex items-center gap-2">
                <Mail className="h-4 w-4" /> Email Subject
              </p>
              <p className="text-muted-foreground text-xs mt-1">41 chars (mobile) / 70 chars (desktop)</p>
            </div>
            <div className="p-3 bg-background rounded-lg">
              <p className="font-medium flex items-center gap-2">
                <Bell className="h-4 w-4" /> iOS Push
              </p>
              <p className="text-muted-foreground text-xs mt-1">Title: 50 chars / Body: 150 chars</p>
            </div>
            <div className="p-3 bg-background rounded-lg">
              <p className="font-medium flex items-center gap-2">
                <Bell className="h-4 w-4" /> Android Push
              </p>
              <p className="text-muted-foreground text-xs mt-1">Title: 65 chars / Body: 240 chars</p>
            </div>
            <div className="p-3 bg-background rounded-lg">
              <p className="font-medium flex items-center gap-2">
                <MessageSquare className="h-4 w-4" /> SMS
              </p>
              <p className="text-muted-foreground text-xs mt-1">160 chars (single) / 306 chars (multi)</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
