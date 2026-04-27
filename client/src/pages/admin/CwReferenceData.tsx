import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Save, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { adminApi } from '@/services/api';
import AdminNav from '@/components/admin/AdminNav';

type Row = { key: string; value: string; notes: string | null };

const SECTION_LABELS: Record<string, string> = {
  company: 'Company',
  comm: 'Communication Item Types',
  opportunity: 'Opportunity',
  agreement: 'Agreement Defaults',
  project: 'Project',
  customField: 'Custom Field IDs',
};

function sectionFor(key: string): string {
  const prefix = key.split('.')[0];
  return SECTION_LABELS[prefix] ?? prefix;
}

const CwReferenceData = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [requiredKeys, setRequiredKeys] = useState<string[]>([]);
  const [draft, setDraft] = useState<Record<string, { value: string; notes: string }>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!isAuthenticated) navigate('/admin/login');
  }, [isAuthenticated, navigate]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const data = await adminApi.getCwConfig();
      setRows(data.rows);
      setRequiredKeys(data.requiredForProvisioning);
      const next: Record<string, { value: string; notes: string }> = {};
      for (const r of data.rows) next[r.key] = { value: r.value, notes: r.notes ?? '' };
      setDraft(next);
    } catch {
      toast.error('Failed to load CW reference config');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const save = async (key: string) => {
    setSaving((s) => ({ ...s, [key]: true }));
    try {
      const { value, notes } = draft[key];
      await adminApi.setCwConfig(key, value, notes || null);
      toast.success(`Saved ${key}`);
      setRows((rs) => rs.map((r) => (r.key === key ? { ...r, value, notes: notes || null } : r)));
    } catch {
      toast.error(`Failed to save ${key}`);
    } finally {
      setSaving((s) => ({ ...s, [key]: false }));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <AdminNav />
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  // Group rows by section
  const grouped = new Map<string, Row[]>();
  for (const r of rows) {
    const s = sectionFor(r.key);
    if (!grouped.has(s)) grouped.set(s, []);
    grouped.get(s)!.push(r);
  }

  const requiredUnset = rows.filter(
    (r) => requiredKeys.includes(r.key) && (r.value === 'null' || r.value === ''),
  );

  return (
    <div className="min-h-screen bg-background">
      <AdminNav />

      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h2 className="text-3xl font-bold">ConnectWise Reference IDs</h2>
          <p className="text-muted-foreground mt-1">
            CW IDs the integration uses at runtime. Lookups documented in
            <code className="mx-1 px-1.5 py-0.5 bg-muted rounded">docs/cw-reference-ids.md</code>.
            Values stored as text; numeric ones parsed when read. Use <code className="mx-1 px-1.5 py-0.5 bg-muted rounded">null</code> for unset.
          </p>
        </div>

        {requiredUnset.length > 0 && (
          <Card className="p-4 mb-6 border-orange-300 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-800">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-orange-600 dark:text-orange-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold text-orange-900 dark:text-orange-200">
                  {requiredUnset.length} required key{requiredUnset.length === 1 ? '' : 's'} still unset
                </p>
                <p className="text-sm text-orange-800 dark:text-orange-300 mt-1">
                  CW provisioning will fail or behave incorrectly until these are filled in:
                  {' '}
                  <span className="font-mono">{requiredUnset.map((r) => r.key).join(', ')}</span>
                </p>
              </div>
            </div>
          </Card>
        )}

        <div className="space-y-6">
          {[...grouped.entries()].map(([section, items]) => (
            <Card key={section} className="p-6">
              <h3 className="text-lg font-semibold mb-4">{section}</h3>
              <div className="space-y-3">
                {items.map((r) => {
                  const isRequired = requiredKeys.includes(r.key);
                  const dirty =
                    draft[r.key]?.value !== r.value || (draft[r.key]?.notes ?? '') !== (r.notes ?? '');
                  return (
                    <div key={r.key} className="grid grid-cols-12 gap-3 items-start">
                      <div className="col-span-4">
                        <div className="flex items-center gap-2">
                          <code className="text-sm font-mono text-foreground">{r.key}</code>
                          {isRequired && (
                            <Badge variant="secondary" className="text-xs">required</Badge>
                          )}
                        </div>
                      </div>
                      <div className="col-span-3">
                        <Input
                          value={draft[r.key]?.value ?? ''}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              [r.key]: { ...d[r.key], value: e.target.value },
                            }))
                          }
                          className="font-mono"
                        />
                      </div>
                      <div className="col-span-4">
                        <Input
                          placeholder="Notes (optional)"
                          value={draft[r.key]?.notes ?? ''}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              [r.key]: { ...d[r.key], notes: e.target.value },
                            }))
                          }
                        />
                      </div>
                      <div className="col-span-1">
                        <Button
                          size="sm"
                          variant={dirty ? 'default' : 'outline'}
                          disabled={!dirty || saving[r.key]}
                          onClick={() => save(r.key)}
                        >
                          {saving[r.key] ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Save className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CwReferenceData;
