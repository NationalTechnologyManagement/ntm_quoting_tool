import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Loader2,
  UserPlus,
  Trash2,
  RefreshCw,
  Mail,
  ShieldCheck,
  ShieldOff,
} from 'lucide-react';
import { toast } from 'sonner';
import { usersApi } from '@/services/api';
import AdminNav from '@/components/admin/AdminNav';

type User = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  active: boolean;
  twoFactorMethod: string | null;
  lastLoginAt: string | null;
  createdAt: string;
};

type Invite = {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
  invitedBy: { id: string; email: string; name: string | null } | null;
};

const Users = () => {
  const navigate = useNavigate();
  const { isAuthenticated, user: currentUser } = useAuth();

  const [users, setUsers] = useState<User[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'sales_rep'>('sales_rep');
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/admin/login');
      return;
    }
    if (currentUser && currentUser.role !== 'admin') {
      toast.error('Only admins can manage users');
      navigate('/admin/packages');
    }
  }, [isAuthenticated, currentUser, navigate]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [u, i] = await Promise.all([usersApi.list(), usersApi.listInvites()]);
      setUsers(u.users);
      setInvites(i.invites);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const handleInvite = async () => {
    if (!inviteEmail) return;
    setInviting(true);
    try {
      await usersApi.invite(inviteEmail, inviteRole);
      toast.success(`Invite sent to ${inviteEmail}`);
      setInviteOpen(false);
      setInviteEmail('');
      setInviteRole('sales_rep');
      await fetchAll();
    } catch (e: any) {
      toast.error(e?.message || 'Could not send invite');
    } finally {
      setInviting(false);
    }
  };

  const toggleActive = async (u: User) => {
    try {
      await usersApi.setActive(u.id, !u.active);
      toast.success(`${u.email} ${!u.active ? 'activated' : 'deactivated'}`);
      await fetchAll();
    } catch (e: any) {
      toast.error(e?.message || 'Could not update user');
    }
  };

  const changeRole = async (u: User, role: 'admin' | 'sales_rep') => {
    try {
      await usersApi.setRole(u.id, role);
      toast.success(`${u.email} is now ${role === 'admin' ? 'Admin' : 'Sales Rep'}`);
      await fetchAll();
    } catch (e: any) {
      toast.error(e?.message || 'Could not change role');
    }
  };

  const reset2fa = async (u: User) => {
    if (!confirm(`Reset 2FA for ${u.email}? They'll need to re-enroll on next login.`)) return;
    try {
      await usersApi.reset2fa(u.id);
      toast.success(`2FA reset — ${u.email} will enroll again on next login`);
      await fetchAll();
    } catch (e: any) {
      toast.error(e?.message || 'Could not reset 2FA');
    }
  };

  const removeUser = async (u: User) => {
    if (!confirm(`Delete ${u.email}? This cannot be undone.`)) return;
    try {
      await usersApi.remove(u.id);
      toast.success(`${u.email} removed`);
      await fetchAll();
    } catch (e: any) {
      toast.error(e?.message || 'Could not remove user');
    }
  };

  const revokeInvite = async (i: Invite) => {
    if (!confirm(`Revoke invite for ${i.email}?`)) return;
    try {
      await usersApi.revokeInvite(i.id);
      toast.success('Invite revoked');
      await fetchAll();
    } catch (e: any) {
      toast.error(e?.message || 'Could not revoke invite');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AdminNav />

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite a teammate</DialogTitle>
            <DialogDescription>
              They'll get an email with a one-time link to set their password and turn on 2FA.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="newrep@trustntm.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>
            <div>
              <Label>Role</Label>
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as 'admin' | 'sales_rep')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sales_rep">Sales Rep</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Admins manage settings + users. Sales Reps view/create/send quotes.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)} disabled={inviting}>
              Cancel
            </Button>
            <Button onClick={handleInvite} disabled={inviting || !inviteEmail}>
              {inviting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Mail className="w-4 h-4 mr-2" />}
              Send invite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Users</h1>
            <p className="text-sm text-muted-foreground">
              Manage who can access the admin portal.
            </p>
          </div>
          <Button onClick={() => setInviteOpen(true)}>
            <UserPlus className="w-4 h-4 mr-2" /> Invite teammate
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <Card className="p-0 overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left">
                    <th className="px-4 py-2 font-medium">Email</th>
                    <th className="px-4 py-2 font-medium">Name</th>
                    <th className="px-4 py-2 font-medium">Role</th>
                    <th className="px-4 py-2 font-medium">2FA</th>
                    <th className="px-4 py-2 font-medium">Last login</th>
                    <th className="px-4 py-2 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-t">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {u.email}
                          {!u.active && <Badge variant="secondary">Disabled</Badge>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{u.name || '—'}</td>
                      <td className="px-4 py-3">
                        <Select
                          value={u.role}
                          onValueChange={(v) => changeRole(u, v as 'admin' | 'sales_rep')}
                          disabled={u.id === currentUser?.id}
                        >
                          <SelectTrigger className="w-[140px] h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="sales_rep">Sales Rep</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-4 py-3">
                        {u.twoFactorMethod ? (
                          <Badge variant="outline" className="gap-1">
                            <ShieldCheck className="w-3 h-3" /> {u.twoFactorMethod.toUpperCase()}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="gap-1">
                            <ShieldOff className="w-3 h-3" /> Not set
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never'}
                      </td>
                      <td className="px-4 py-3 text-right space-x-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => reset2fa(u)}
                          title="Reset 2FA"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => toggleActive(u)}
                          title={u.active ? 'Deactivate' : 'Reactivate'}
                          disabled={u.id === currentUser?.id}
                        >
                          {u.active ? <ShieldOff className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => removeUser(u)}
                          title="Delete user"
                          disabled={u.id === currentUser?.id}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            <Card className="p-0 overflow-hidden">
              <div className="px-4 py-3 border-b bg-muted/30">
                <h2 className="font-medium">Pending invites</h2>
                <p className="text-xs text-muted-foreground">
                  Sent but not yet accepted. Tokens are single-use.
                </p>
              </div>
              {invites.filter((i) => !i.acceptedAt).length === 0 ? (
                <div className="px-4 py-6 text-sm text-muted-foreground">
                  No pending invites. Click "Invite teammate" to send one.
                </div>
              ) : (
                <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-muted/50">
                    <tr className="text-left">
                      <th className="px-4 py-2 font-medium">Email</th>
                      <th className="px-4 py-2 font-medium">Role</th>
                      <th className="px-4 py-2 font-medium">Invited by</th>
                      <th className="px-4 py-2 font-medium">Expires</th>
                      <th className="px-4 py-2 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invites
                      .filter((i) => !i.acceptedAt)
                      .map((i) => (
                        <tr key={i.id} className="border-t">
                          <td className="px-4 py-3">{i.email}</td>
                          <td className="px-4 py-3 capitalize">{i.role.replace('_', ' ')}</td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {i.invitedBy?.email || '—'}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {new Date(i.expiresAt).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => revokeInvite(i)}
                              title="Revoke invite"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </div>
  );
};

export default Users;
