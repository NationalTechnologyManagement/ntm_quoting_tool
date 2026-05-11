import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { adminApi } from '@/services/api';
import AdminNav from '@/components/admin/AdminNav';

interface SiteContentForm {
  quoteBuilderHeading: string;
  quoteBuilderSubheading: string;
  quoteBuilderExplainerTitle: string;
  quoteBuilderExplainerBody: string;
}

const SiteContentManagement = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [form, setForm] = useState<SiteContentForm | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) navigate('/admin/login');
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    adminApi
      .getSiteContent()
      .then((data) => setForm(data))
      .catch(() => toast.error('Failed to load site content'));
  }, []);

  const updateField = (key: keyof SiteContentForm, value: string) => {
    if (!form) return;
    setForm({ ...form, [key]: value });
  };

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      await adminApi.updateSiteContent(form);
      toast.success('Site copy saved');
    } catch (e: any) {
      toast.error(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-muted/30">
      <AdminNav />
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h2 className="text-3xl font-bold text-foreground">Site Copy</h2>
          <p className="text-muted-foreground mt-1">
            Edit the customer-facing wording on the package picker. Changes are live as soon as you
            save.
          </p>
        </div>

        {!form ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Card className="p-6 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="heading">Page heading</Label>
              <Input
                id="heading"
                value={form.quoteBuilderHeading}
                onChange={(e) => updateField('quoteBuilderHeading', e.target.value)}
                maxLength={200}
              />
              <p className="text-xs text-muted-foreground">
                Big title above the package cards.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sub">Subheading</Label>
              <textarea
                id="sub"
                value={form.quoteBuilderSubheading}
                onChange={(e) => updateField('quoteBuilderSubheading', e.target.value)}
                maxLength={2000}
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <p className="text-xs text-muted-foreground">
                One or two sentences under the heading.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="explainer-title">Explainer popover title</Label>
              <Input
                id="explainer-title"
                value={form.quoteBuilderExplainerTitle}
                onChange={(e) => updateField('quoteBuilderExplainerTitle', e.target.value)}
                maxLength={200}
              />
              <p className="text-xs text-muted-foreground">
                Title for the (i) popover next to "Desktop Users".
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="explainer-body">Explainer body</Label>
              <textarea
                id="explainer-body"
                value={form.quoteBuilderExplainerBody}
                onChange={(e) => updateField('quoteBuilderExplainerBody', e.target.value)}
                maxLength={5000}
                rows={8}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Plain text. Use a blank line to separate paragraphs. Customer sees this in the (i)
                popover next to "Desktop Users".
              </p>
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={save} disabled={saving}>
                {saving ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Save Site Copy
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};

export default SiteContentManagement;
