import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Loader2, Save, Plus, Trash2, AlertTriangle, Bot, BookOpen, Activity, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { adminApi } from '@/services/api';
import AdminNav from '@/components/admin/AdminNav';

const ALL_TOOLS = ['highlight_field', 'prefill_field', 'navigate', 'suggest_addon', 'suggest_package'];

const MODEL_PRESETS = [
  { value: 'anthropic/claude-sonnet-4-5', label: 'Claude Sonnet 4.5 (recommended)' },
  { value: 'anthropic/claude-opus-4-7', label: 'Claude Opus 4.7' },
  { value: 'anthropic/claude-haiku-4-5', label: 'Claude Haiku 4.5 (fast/cheap)' },
  { value: 'openai/gpt-4o', label: 'GPT-4o' },
  { value: 'openai/gpt-4o-mini', label: 'GPT-4o mini (fast/cheap)' },
  { value: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
];

const AiChatSettings = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<any | null>(null);
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [usage, setUsage] = useState<any | null>(null);
  const [kb, setKb] = useState<any[]>([]);

  useEffect(() => {
    if (!isAuthenticated) navigate('/admin/login');
  }, [isAuthenticated, navigate]);

  const refresh = async () => {
    setLoading(true);
    try {
      const [c, u, k] = await Promise.all([
        adminApi.getAiConfig(),
        adminApi.getAiUsage(),
        adminApi.listAiKb(),
      ]);
      setConfig(c.config);
      setApiKeyConfigured(c.apiKeyConfigured);
      setUsage(u);
      setKb(k.docs);
    } catch {
      toast.error('Failed to load AI chat settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const update = (patch: any) => setConfig((c: any) => ({ ...c, ...patch }));

  const save = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const allowedToolsCsv = Array.isArray(config.allowedTools)
        ? config.allowedTools.join(',')
        : config.allowedTools;
      const payload = {
        enabled: config.enabled,
        primaryModel: config.primaryModel,
        fallbackModel: config.fallbackModel,
        temperature: Number(config.temperature),
        maxTokens: Number(config.maxTokens),
        requestTimeoutMs: Number(config.requestTimeoutMs),
        systemPrompt: config.systemPrompt,
        greeting: config.greeting,
        disclaimer: config.disclaimer,
        perSessionUsdCap: Number(config.perSessionUsdCap),
        dailyUsdCap: Number(config.dailyUsdCap),
        idleTimeoutMs: Number(config.idleTimeoutMs),
        absoluteTimeoutMs: Number(config.absoluteTimeoutMs),
        ratePerMin: Number(config.ratePerMin),
        allowedTools: allowedToolsCsv,
      };
      const r = await adminApi.updateAiConfig(payload);
      setConfig(r.config);
      toast.success('AI chat settings saved');
    } catch (e: any) {
      toast.error(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !config) {
    return (
      <div className="min-h-screen bg-background">
        <AdminNav />
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  const allowedSet = new Set(
    (typeof config.allowedTools === 'string' ? config.allowedTools : '').split(',').map((s: string) => s.trim()).filter(Boolean),
  );
  const toggleTool = (name: string) => {
    const next = new Set(allowedSet);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    update({ allowedTools: Array.from(next).join(',') });
  };

  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-3xl font-bold flex items-center gap-2">
              <Bot className="w-7 h-7 text-primary" /> AI Chat Assistant
            </h2>
            <p className="text-muted-foreground mt-1">
              Configure the customer-facing AI agent that walks visitors through the quote.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge
              variant="secondary"
              className={config.enabled ? 'bg-green-100 text-green-800' : 'bg-muted text-muted-foreground'}
            >
              {config.enabled ? 'Live' : 'Disabled'}
            </Badge>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Save
            </Button>
          </div>
        </div>

        {!apiKeyConfigured && (
          <Card className="p-4 bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-amber-900 dark:text-amber-200">
                  OpenRouter API key not set
                </p>
                <p className="text-amber-800 dark:text-amber-300 mt-1">
                  Add <code className="font-mono">OPENROUTER_API_KEY</code> in{' '}
                  <button
                    type="button"
                    className="underline font-medium"
                    onClick={() => navigate('/admin/integrations')}
                  >
                    Integrations
                  </button>{' '}
                  before flipping the switch on. The chat will refuse to start until the key is present.
                </p>
              </div>
            </div>
          </Card>
        )}

        <Tabs defaultValue="general" className="w-full">
          <TabsList className="grid grid-cols-2 md:grid-cols-4 w-full">
            <TabsTrigger value="general"><Settings className="w-4 h-4 mr-2" />General</TabsTrigger>
            <TabsTrigger value="prompt"><Bot className="w-4 h-4 mr-2" />Prompt + Tools</TabsTrigger>
            <TabsTrigger value="kb"><BookOpen className="w-4 h-4 mr-2" />Knowledge base</TabsTrigger>
            <TabsTrigger value="usage"><Activity className="w-4 h-4 mr-2" />Usage</TabsTrigger>
          </TabsList>

          {/* GENERAL */}
          <TabsContent value="general" className="space-y-4 mt-4">
            <Card className="p-6 space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base font-semibold">Enable assistant</Label>
                  <p className="text-sm text-muted-foreground">Master kill switch — chat widget hides when off.</p>
                </div>
                <Switch checked={!!config.enabled} onCheckedChange={(v) => update({ enabled: v })} />
              </div>
            </Card>

            <Card className="p-6 space-y-5">
              <h3 className="font-semibold">Models</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Primary model</Label>
                  <ModelInput value={config.primaryModel} onChange={(v) => update({ primaryModel: v })} />
                </div>
                <div className="space-y-2">
                  <Label>Fallback model</Label>
                  <ModelInput value={config.fallbackModel} onChange={(v) => update({ fallbackModel: v })} />
                  <p className="text-xs text-muted-foreground">
                    Used on 5xx, 429, or timeout. The user sees a small "switched to backup" badge.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Temperature</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    max="2"
                    value={config.temperature}
                    onChange={(e) => update({ temperature: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Max tokens / response</Label>
                  <Input
                    type="number"
                    value={config.maxTokens}
                    onChange={(e) => update({ maxTokens: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Request timeout (ms)</Label>
                  <Input
                    type="number"
                    value={config.requestTimeoutMs}
                    onChange={(e) => update({ requestTimeoutMs: e.target.value })}
                  />
                </div>
              </div>
            </Card>

            <Card className="p-6 space-y-5">
              <h3 className="font-semibold">Cost &amp; rate limits</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Per-session cap (USD)</Label>
                  <Input
                    type="number"
                    step="0.5"
                    value={config.perSessionUsdCap}
                    onChange={(e) => update({ perSessionUsdCap: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">Refuses further messages once a single session hits this.</p>
                </div>
                <div className="space-y-2">
                  <Label>Daily global cap (USD)</Label>
                  <Input
                    type="number"
                    step="1"
                    value={config.dailyUsdCap}
                    onChange={(e) => update({ dailyUsdCap: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">Disables chat for everyone once total daily spend hits this.</p>
                </div>
                <div className="space-y-2">
                  <Label>Messages / min / session</Label>
                  <Input
                    type="number"
                    value={config.ratePerMin}
                    onChange={(e) => update({ ratePerMin: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Idle timeout (ms)</Label>
                  <Input
                    type="number"
                    value={config.idleTimeoutMs}
                    onChange={(e) => update({ idleTimeoutMs: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">{(config.idleTimeoutMs / 60000).toFixed(0)} min</p>
                </div>
                <div className="space-y-2">
                  <Label>Absolute timeout (ms)</Label>
                  <Input
                    type="number"
                    value={config.absoluteTimeoutMs}
                    onChange={(e) => update({ absoluteTimeoutMs: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">{(config.absoluteTimeoutMs / 3600000).toFixed(1)} hr</p>
                </div>
              </div>
            </Card>

            <Card className="p-6 space-y-5">
              <h3 className="font-semibold">Customer-facing copy</h3>
              <div className="space-y-2">
                <Label>Greeting (first message shown)</Label>
                <Textarea
                  rows={2}
                  value={config.greeting}
                  onChange={(e) => update({ greeting: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Disclaimer (header banner)</Label>
                <Input value={config.disclaimer} onChange={(e) => update({ disclaimer: e.target.value })} />
              </div>
            </Card>
          </TabsContent>

          {/* PROMPT */}
          <TabsContent value="prompt" className="space-y-4 mt-4">
            <Card className="p-6 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="font-semibold">System prompt</h3>
                <p className="text-xs text-muted-foreground">
                  Defines the agent's role, tone, and hard rules. KB docs and the live page snapshot are appended automatically.
                </p>
              </div>
              <Textarea
                rows={20}
                value={config.systemPrompt}
                onChange={(e) => update({ systemPrompt: e.target.value })}
                className="font-mono text-xs"
              />
            </Card>

            <Card className="p-6 space-y-4">
              <h3 className="font-semibold">Allowed UI tools</h3>
              <p className="text-sm text-muted-foreground">
                Tools available to the agent. All are UI-only — none can write to the database.
                Final actions (terms checkbox, e-sign, payment) are <strong>always</strong> user-click only.
              </p>
              <div className="space-y-2">
                {ALL_TOOLS.map((tool) => (
                  <label key={tool} className="flex items-start gap-3 p-3 rounded border border-border cursor-pointer hover:bg-secondary/40">
                    <Switch checked={allowedSet.has(tool)} onCheckedChange={() => toggleTool(tool)} />
                    <div>
                      <code className="font-mono text-sm">{tool}</code>
                      <p className="text-xs text-muted-foreground mt-0.5">{TOOL_DESCRIPTIONS[tool]}</p>
                    </div>
                  </label>
                ))}
              </div>
            </Card>
          </TabsContent>

          {/* KB */}
          <TabsContent value="kb" className="space-y-4 mt-4">
            <KbEditor docs={kb} onChange={refresh} />
          </TabsContent>

          {/* USAGE */}
          <TabsContent value="usage" className="space-y-4 mt-4">
            <UsageDashboard usage={usage} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

const TOOL_DESCRIPTIONS: Record<string, string> = {
  highlight_field: 'Visually highlight a form field. No data changes.',
  prefill_field: 'Pre-fill a form field with a value the user gave in chat. User can still edit.',
  navigate: 'Suggest moving to next/previous wizard step. User has to confirm.',
  suggest_package: 'Recommend one of the visible packages.',
  suggest_addon: 'Recommend one of the visible add-ons.',
};

function ModelInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const isPreset = MODEL_PRESETS.some((p) => p.value === value);
  return (
    <div className="space-y-1">
      <select
        value={isPreset ? value : '__custom'}
        onChange={(e) => {
          if (e.target.value === '__custom') return;
          onChange(e.target.value);
        }}
        className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
      >
        {MODEL_PRESETS.map((p) => (
          <option key={p.value} value={p.value}>{p.label}</option>
        ))}
        <option value="__custom">Custom…</option>
      </select>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="provider/model-id" className="font-mono text-xs" />
    </div>
  );
}

function KbEditor({ docs, onChange }: { docs: any[]; onChange: () => void }) {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ title: '', content: '', active: true });
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState<any>({});

  const create = async () => {
    if (!draft.title.trim() || !draft.content.trim()) {
      toast.error('Title and content required');
      return;
    }
    try {
      await adminApi.createAiKb(draft);
      toast.success('Doc created');
      setDraft({ title: '', content: '', active: true });
      setCreating(false);
      onChange();
    } catch (e: any) {
      toast.error(e?.message || 'Create failed');
    }
  };

  const startEdit = (d: any) => {
    setEditing(d.id);
    setEdit({ title: d.title, content: d.content, active: d.active, sortOrder: d.sortOrder });
  };

  const saveEdit = async () => {
    if (!editing) return;
    try {
      await adminApi.updateAiKb(editing, edit);
      toast.success('Saved');
      setEditing(null);
      onChange();
    } catch (e: any) {
      toast.error(e?.message || 'Save failed');
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this knowledge-base doc?')) return;
    try {
      await adminApi.deleteAiKb(id);
      toast.success('Deleted');
      onChange();
    } catch (e: any) {
      toast.error(e?.message || 'Delete failed');
    }
  };

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="font-semibold">Knowledge base</h3>
          <p className="text-sm text-muted-foreground">
            Markdown docs concatenated into the system prompt. Use these for FAQs, package descriptions, terms summaries — anything you want the agent to know without inventing.
          </p>
        </div>
        {!creating && (
          <Button onClick={() => setCreating(true)} size="sm">
            <Plus className="w-4 h-4 mr-2" /> New doc
          </Button>
        )}
      </div>

      {creating && (
        <Card className="p-4 space-y-3 bg-secondary/30">
          <Input
            placeholder="Title (e.g. 'Refund policy')"
            value={draft.title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          />
          <Textarea
            rows={8}
            placeholder="Markdown content the agent will use as authoritative reference"
            value={draft.content}
            onChange={(e) => setDraft((d) => ({ ...d, content: e.target.value }))}
            className="font-mono text-xs"
          />
          <div className="flex items-center gap-2">
            <Switch checked={draft.active} onCheckedChange={(v) => setDraft((d) => ({ ...d, active: v }))} />
            <Label className="text-sm">Active</Label>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
            <Button onClick={create}>Create</Button>
          </div>
        </Card>
      )}

      {docs.length === 0 && !creating && (
        <p className="text-sm text-muted-foreground py-6 text-center">No docs yet. Add one to ground the agent in your real policies.</p>
      )}

      <div className="space-y-2">
        {docs.map((d) =>
          editing === d.id ? (
            <Card key={d.id} className="p-4 space-y-3 bg-secondary/30">
              <Input value={edit.title} onChange={(e) => setEdit((s: any) => ({ ...s, title: e.target.value }))} />
              <Textarea
                rows={10}
                value={edit.content}
                onChange={(e) => setEdit((s: any) => ({ ...s, content: e.target.value }))}
                className="font-mono text-xs"
              />
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <Switch checked={edit.active} onCheckedChange={(v) => setEdit((s: any) => ({ ...s, active: v }))} />
                  <Label className="text-sm">Active</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-sm">Sort</Label>
                  <Input
                    type="number"
                    className="w-20 h-8"
                    value={edit.sortOrder ?? 0}
                    onChange={(e) => setEdit((s: any) => ({ ...s, sortOrder: parseInt(e.target.value) || 0 }))}
                  />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                <Button onClick={saveEdit}>Save</Button>
              </div>
            </Card>
          ) : (
            <Card key={d.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-semibold truncate">{d.title}</h4>
                    {!d.active && <Badge variant="secondary">Inactive</Badge>}
                    <Badge variant="outline" className="text-xs">order {d.sortOrder}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{d.content.slice(0, 240)}</p>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => startEdit(d)}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(d.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ),
        )}
      </div>
    </Card>
  );
}

function UsageDashboard({ usage }: { usage: any }) {
  if (!usage) return <Card className="p-6"><Loader2 className="w-5 h-5 animate-spin" /></Card>;
  const fmtUsd = (n: number) => `$${n.toFixed(4)}`;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Today (USD)" value={fmtUsd(usage.today.usdCost)} />
        <StatCard label="Today (msgs)" value={String(usage.today.messages)} />
        <StatCard label="Last 30d (USD)" value={fmtUsd(usage.last30.usdCost)} />
        <StatCard label="Total sessions" value={String(usage.totalSessions)} />
      </div>
      <Card className="p-6">
        <h3 className="font-semibold mb-3">Recent sessions</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-border">
                <th className="py-2 pr-4">Started</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Msgs</th>
                <th className="py-2 pr-4">USD</th>
                <th className="py-2 pr-4">Quote</th>
                <th className="py-2 pr-4">IP</th>
              </tr>
            </thead>
            <tbody>
              {usage.recentSessions.map((s: any) => (
                <tr key={s.id} className="border-b border-border/50">
                  <td className="py-2 pr-4">{new Date(s.createdAt).toLocaleString()}</td>
                  <td className="py-2 pr-4">
                    <Badge variant="secondary" className="text-xs">{s.status}</Badge>
                    {s.usingFallback && <Badge variant="outline" className="ml-1 text-xs">fallback</Badge>}
                  </td>
                  <td className="py-2 pr-4">{s._count.messages}</td>
                  <td className="py-2 pr-4">{fmtUsd(s.usdSpent)}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{s.quoteId?.slice(0, 8) ?? '—'}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{s.ipAddress ?? '—'}</td>
                </tr>
              ))}
              {usage.recentSessions.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-muted-foreground">No sessions yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </Card>
  );
}

export default AiChatSettings;
