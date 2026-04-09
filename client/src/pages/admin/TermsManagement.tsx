import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useQuote, TermsContent } from '@/contexts/QuoteContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { History, Eye, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { adminApi } from '@/services/api';
import AdminNav from '@/components/admin/AdminNav';

const TermsManagement = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { termsContent, setTermsContent, termsHistory } = useQuote();
  
  const [version, setVersion] = useState(termsContent.version);
  const [content, setContent] = useState(termsContent.content);
  const [loading, setLoading] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<TermsContent | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/admin/login');
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    setVersion(termsContent.version);
    setContent(termsContent.content);
  }, [termsContent]);

  useEffect(() => {
    const changed = version !== termsContent.version || content !== termsContent.content;
    setHasChanges(changed);
  }, [version, content, termsContent]);

  const handleSave = async () => {
    if (!content.trim()) {
      toast.error('Terms content cannot be empty');
      return;
    }
    if (!version.trim()) {
      toast.error('Version number is required');
      return;
    }

    // Check if version already exists in history (excluding current)
    const versionExists = termsHistory.some(t => t.version === version.trim());
    if (versionExists && version.trim() !== termsContent.version) {
      toast.error(`Version ${version.trim()} already exists. Please use a different version number.`);
      return;
    }

    setLoading(true);
    try {
      const termsData = {
        version: version.trim(),
        content: content.trim(),
      };

      if (version.trim() === termsContent.version) {
        // Update existing version
        await adminApi.updateTerms(termsContent.id, termsData);
      } else {
        // Create new version
        await adminApi.createTerms(termsData);
      }

      // Update local context state
      setTermsContent({
        id: termsContent.id,
        version: version.trim(),
        content: content.trim(),
        lastUpdated: new Date().toISOString(),
      });
      toast.success('Terms & Conditions saved successfully!');
      setHasChanges(false);
    } catch (error) {
      toast.error('Failed to save terms');
    } finally {
      setLoading(false);
    }
  };

  const handleDiscard = () => {
    setVersion(termsContent.version);
    setContent(termsContent.content);
    setHasChanges(false);
    toast.info('Changes discarded');
  };

  const handleViewVersion = (historyItem: TermsContent) => {
    setSelectedHistoryItem(historyItem);
    setViewDialogOpen(true);
  };

  const handleRestoreVersion = (historyItem: TermsContent) => {
    const newVersion = prompt(
      `Enter new version number for restored content (restoring v${historyItem.version}):`,
      `${parseFloat(termsContent.version) + 0.1}`
    );
    
    if (newVersion && newVersion.trim()) {
      // Check if version already exists
      const versionExists = termsHistory.some(t => t.version === newVersion.trim()) || 
                           termsContent.version === newVersion.trim();
      
      if (versionExists) {
        toast.error(`Version ${newVersion.trim()} already exists. Please use a different version number.`);
        return;
      }

      setVersion(newVersion.trim());
      setContent(historyItem.content);
      setHasChanges(true);
      setViewDialogOpen(false);
      toast.success(`Restored v${historyItem.version} content. Update version and save to apply.`);
    }
  };

  if (!isAuthenticated) return null;

  const charCount = content.length;
  const wordCount = content.trim().split(/\s+/).filter(Boolean).length;
  const lastUpdated = new Date(termsContent.lastUpdated).toLocaleString();

  return (
    <div className="min-h-screen bg-muted/30">
      <AdminNav />

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h2 className="text-3xl font-bold text-foreground">Terms & Conditions Management</h2>
          <p className="text-muted-foreground mt-1">Edit the terms and conditions displayed to customers</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Editor Section */}
          <div className="lg:col-span-2">
            <Card className="p-6 shadow-card">
              <Tabs defaultValue="edit" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-4">
                  <TabsTrigger value="edit">Edit</TabsTrigger>
                  <TabsTrigger value="preview">Preview</TabsTrigger>
                </TabsList>

                <TabsContent value="edit" className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="version">Version Number</Label>
                    <Input
                      id="version"
                      value={version}
                      onChange={(e) => setVersion(e.target.value)}
                      placeholder="1.0"
                      className="max-w-xs"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="content">Terms Content</Label>
                      <div className="text-xs text-muted-foreground">
                        {charCount.toLocaleString()} characters • {wordCount.toLocaleString()} words
                      </div>
                    </div>
                    <Textarea
                      id="content"
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      placeholder="Enter your terms and conditions here..."
                      className="min-h-[500px] font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      Plain text format. Line breaks will be preserved.
                    </p>
                  </div>

                  <div className="flex gap-3 pt-4">
                    <Button onClick={handleSave} disabled={loading || !hasChanges} className="flex-1">
                      {loading ? 'Saving...' : 'Save Changes'}
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={handleDiscard} 
                      disabled={!hasChanges}
                      className="flex-1"
                    >
                      Discard Changes
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="preview" className="space-y-4">
                  <div className="bg-background rounded-lg border p-6 min-h-[500px] max-h-[600px] overflow-y-auto">
                    <div className="mb-6 pb-4 border-b">
                      <h1 className="text-3xl font-bold mb-2">Terms and Conditions</h1>
                      <p className="text-sm text-muted-foreground">
                        Version {version} • Last updated: {lastUpdated}
                      </p>
                    </div>
                    <div className="prose prose-sm max-w-none dark:prose-invert">
                      <div className="whitespace-pre-wrap">{content || 'No content yet...'}</div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </Card>
          </div>

          {/* Info Sidebar */}
          <div className="space-y-6">
            <Card className="p-6 shadow-card">
              <h3 className="text-lg font-semibold mb-4">Information</h3>
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Current Version</p>
                  <p className="font-semibold text-foreground">{termsContent.version}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Last Updated</p>
                  <p className="font-semibold text-foreground">{lastUpdated}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <p className="font-semibold text-foreground">
                    {hasChanges ? (
                      <span className="text-orange-500">Unsaved Changes</span>
                    ) : (
                      <span className="text-green-500">Saved</span>
                    )}
                  </p>
                </div>
              </div>
            </Card>

            <Card className="p-6 shadow-card">
              <h3 className="text-lg font-semibold mb-4">Guidelines</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>• Update version number for each change</li>
                <li>• Include all legal requirements</li>
                <li>• Specify agreement duration</li>
                <li>• Define cancellation policy</li>
                <li>• Outline payment terms</li>
                <li>• Include liability disclaimers</li>
              </ul>
            </Card>

            <Card className="p-6 shadow-card bg-primary/5 border-primary/20">
              <h3 className="text-lg font-semibold mb-2 text-primary">Legal Notice</h3>
              <p className="text-xs text-muted-foreground">
                Version tracking ensures customers agree to specific terms. The version number is captured 
                when customers sign and is included in payment metadata for audit purposes.
              </p>
            </Card>

            {/* Version History */}
            <Card className="p-6 shadow-card">
              <div className="flex items-center gap-2 mb-4">
                <History className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-semibold">Version History</h3>
              </div>
              
              {termsHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No previous versions
                </p>
              ) : (
                <ScrollArea className="h-96">
                  <div className="space-y-3 pr-4">
                    {termsHistory.map((historyItem) => {
                      const date = new Date(historyItem.lastUpdated).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      });
                      
                      return (
                        <div 
                          key={historyItem.id} 
                          className="border rounded-lg p-3 space-y-2 hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-foreground">v{historyItem.version}</span>
                            <span className="text-xs text-muted-foreground">{date}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {historyItem.content.length.toLocaleString()} characters
                          </p>
                          <div className="flex gap-2">
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="flex-1"
                              onClick={() => handleViewVersion(historyItem)}
                            >
                              <Eye className="w-3 h-3 mr-1" />
                              View
                            </Button>
                            <Button 
                              size="sm" 
                              variant="secondary" 
                              className="flex-1"
                              onClick={() => handleRestoreVersion(historyItem)}
                            >
                              <RotateCcw className="w-3 h-3 mr-1" />
                              Restore
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </Card>
          </div>
        </div>
      </div>

      {/* View Historical Version Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Version {selectedHistoryItem?.version}</DialogTitle>
            <DialogDescription>
              Last updated: {selectedHistoryItem && new Date(selectedHistoryItem.lastUpdated).toLocaleString()}
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="h-96 w-full rounded-md border p-4">
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <div className="whitespace-pre-wrap text-sm">
                {selectedHistoryItem?.content}
              </div>
            </div>
          </ScrollArea>
          
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setViewDialogOpen(false)}>
              Close
            </Button>
            <Button 
              onClick={() => selectedHistoryItem && handleRestoreVersion(selectedHistoryItem)}
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Restore This Version
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TermsManagement;
