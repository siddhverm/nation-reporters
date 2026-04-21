'use client';
import { useEffect, useState } from 'react';
import { Users, UserPlus, X, Check, ShieldCheck, FileText, Share2, Settings, RefreshCw, Eye, EyeOff, Edit2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

const ROLES = ['REPORTER', 'CHIEF_EDITOR', 'SOCIAL_MANAGER', 'ADMIN'] as const;

const ROLE_CFG: Record<string, { label: string; color: string; icon: React.ElementType; desc: string }> = {
  REPORTER:       { label: 'Reporter',       color: 'bg-blue-100 text-blue-800',    icon: FileText,    desc: 'Write & submit articles for review' },
  CHIEF_EDITOR:   { label: 'Chief Editor',   color: 'bg-green-100 text-green-800',  icon: ShieldCheck, desc: 'Review, approve & publish to all platforms' },
  SOCIAL_MANAGER: { label: 'Social Manager', color: 'bg-purple-100 text-purple-800',icon: Share2,      desc: 'Schedule & manage social media posts' },
  ADMIN:          { label: 'Admin',          color: 'bg-orange-100 text-orange-800', icon: Settings,    desc: 'Full access to all settings & users' },
};

const EMPTY_FORM = { name: '', email: '', password: '', role: 'REPORTER' as string };

export default function UsersAdminPage() {
  const { token } = useAuth('ADMIN');
  const [users, setUsers]         = useState<User[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [editUser, setEditUser]   = useState<User | null>(null);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [showPw, setShowPw]       = useState(false);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');
  const [success, setSuccess]     = useState('');
  const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

  function load() {
    if (!token) return;
    setLoading(true);
    fetch(`${base}/users`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d: User[]) => { setUsers(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => { load(); }, [token]);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.email || !form.password) { setError('All fields required'); return; }
    setSaving(true); setError('');
    try {
      const res = await fetch(`${base}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = await res.json();
        const msg = err.message;
        throw new Error(Array.isArray(msg) ? msg[0] : (typeof msg === 'string' ? msg : 'Failed to create user'));
      }
      setShowForm(false);
      setForm(EMPTY_FORM);
      setSuccess(`User ${form.name} created successfully`);
      setTimeout(() => setSuccess(''), 4000);
      load();
    } catch (err) {
      setError((err as Error).message ?? 'Failed to create user');
    } finally {
      setSaving(false);
    }
  }

  async function updateRole(user: User, newRole: string) {
    setSaving(true);
    try {
      await fetch(`${base}/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ role: newRole }),
      });
      setSuccess(`${user.name}'s role updated to ${ROLE_CFG[newRole]?.label}`);
      setTimeout(() => setSuccess(''), 3000);
      setEditUser(null);
      load();
    } finally { setSaving(false); }
  }

  async function toggleActive(user: User) {
    await fetch(`${base}/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ isActive: !user.isActive }),
    });
    load();
  }

  const RoleBadge = ({ role }: { role: string }) => {
    const cfg = ROLE_CFG[role];
    const Icon = cfg?.icon ?? FileText;
    return (
      <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${cfg?.color ?? 'bg-gray-100 text-gray-700'}`}>
        <Icon className="h-3 w-3" />{cfg?.label ?? role}
      </span>
    );
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="h-6 w-6 text-brand" /> User Management
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{users.length} member{users.length !== 1 ? 's' : ''} in your newsroom</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="flex items-center gap-1.5 text-sm text-navy border border-navy px-3 py-2 rounded-lg hover:bg-navy hover:text-white transition-colors">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => { setShowForm(true); setEditUser(null); setForm(EMPTY_FORM); setError(''); }}
            className="flex items-center gap-2 bg-brand text-white px-4 py-2 rounded-lg font-medium hover:bg-brand-dark transition-colors">
            <UserPlus className="h-4 w-4" /> Add Member
          </button>
        </div>
      </div>

      {/* Role overview cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {ROLES.map((role) => {
          const cfg = ROLE_CFG[role];
          const Icon = cfg.icon;
          const count = users.filter((u) => u.role === role).length;
          return (
            <div key={role} className={`rounded-xl border p-3 ${cfg.color.replace('text-', 'border-').split(' ')[0]}/20`}>
              <div className="flex items-center gap-2 mb-1">
                <Icon className="h-4 w-4" />
                <span className="text-xs font-bold">{cfg.label}</span>
              </div>
              <p className="text-2xl font-black">{count}</p>
              <p className="text-xs opacity-70 leading-tight mt-0.5">{cfg.desc}</p>
            </div>
          );
        })}
      </div>

      {/* Success/Error banners */}
      {success && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 mb-4 text-sm">
          <Check className="h-4 w-4 shrink-0" /> {success}
        </div>
      )}

      {/* Create user form */}
      {showForm && (
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-gray-900">Add New Member</h2>
            <button onClick={() => { setShowForm(false); setError(''); }} className="text-gray-400 hover:text-gray-600">
              <X className="h-5 w-5" />
            </button>
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">
              <X className="h-4 w-4 shrink-0" /> {error}
            </div>
          )}

          <form onSubmit={createUser} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Full Name</label>
                <input required placeholder="e.g. Priya Sharma" value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Email Address</label>
                <input required type="email" placeholder="priya@nationreporters.com" value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Password</label>
                <div className="relative">
                  <input required type={showPw ? 'text' : 'password'} placeholder="Min 8 characters" value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })} minLength={8}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 pr-10 text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand" />
                  <button type="button" onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Role</label>
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-brand">
                  {ROLES.map((r) => <option key={r} value={r}>{ROLE_CFG[r].label}</option>)}
                </select>
                <p className="text-xs text-gray-400 mt-1">{ROLE_CFG[form.role]?.desc}</p>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={saving}
                className="flex items-center gap-2 bg-brand text-white px-5 py-2.5 rounded-lg font-bold hover:bg-brand-dark transition-colors disabled:opacity-60">
                {saving ? <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" /> : <UserPlus className="h-4 w-4" />}
                {saving ? 'Creating…' : 'Create Account'}
              </button>
              <button type="button" onClick={() => { setShowForm(false); setError(''); }}
                className="border border-gray-200 text-gray-600 px-5 py-2.5 rounded-lg font-medium hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Users table */}
      {loading ? (
        <div className="text-center py-12"><div className="animate-spin h-8 w-8 border-4 border-brand border-t-transparent rounded-full mx-auto" /></div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Member</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Role</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Joined</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-5 py-3.5">
                    <div>
                      <p className="font-semibold text-gray-900">{u.name}</p>
                      <p className="text-xs text-gray-400">{u.email}</p>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    {editUser?.id === u.id ? (
                      <select defaultValue={u.role}
                        onChange={(e) => updateRole(u, e.target.value)}
                        className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-brand">
                        {ROLES.map((r) => <option key={r} value={r}>{ROLE_CFG[r].label}</option>)}
                      </select>
                    ) : (
                      <div className="flex items-center gap-2">
                        <RoleBadge role={u.role} />
                        <button onClick={() => setEditUser(u)} className="text-gray-300 hover:text-brand transition-colors" title="Change role">
                          <Edit2 className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${u.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${u.isActive ? 'bg-green-500' : 'bg-gray-400'}`} />
                      {u.isActive ? 'Active' : 'Suspended'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-gray-400 text-xs">
                    {new Date(u.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      {editUser?.id === u.id ? (
                        <button onClick={() => setEditUser(null)} className="text-xs text-gray-400 hover:text-gray-600">Done</button>
                      ) : (
                        <button onClick={() => toggleActive(u)}
                          className={`text-xs font-medium ${u.isActive ? 'text-red-500 hover:text-red-700' : 'text-green-600 hover:text-green-800'}`}>
                          {u.isActive ? 'Suspend' : 'Activate'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-semibold">No users yet. Add your first team member.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
