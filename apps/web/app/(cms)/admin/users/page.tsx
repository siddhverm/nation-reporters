'use client';
import { useEffect, useState } from 'react';
import { Users, UserPlus } from 'lucide-react';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

const ROLES = ['REPORTER', 'CHIEF_EDITOR', 'SOCIAL_MANAGER', 'ADMIN'];

export default function UsersAdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'REPORTER' });

  function token() { return localStorage.getItem('accessToken') ?? ''; }

  function load() {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/users`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => r.json()).then((d: User[]) => { setUsers(d); setLoading(false); });
  }

  useEffect(load, []);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: JSON.stringify(form),
    });
    setShowForm(false);
    setForm({ name: '', email: '', password: '', role: 'REPORTER' });
    load();
  }

  async function toggleActive(id: string, isActive: boolean) {
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ isActive: !isActive }),
    });
    load();
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6 text-brand" />
          <h1 className="text-2xl font-bold">Users</h1>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 bg-brand text-white px-4 py-2 rounded-lg text-sm">
          <UserPlus className="h-4 w-4" /> Add User
        </button>
      </div>

      {showForm && (
        <form onSubmit={createUser} className="border rounded-xl p-4 mb-6 bg-gray-50 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input required placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="border rounded-lg px-3 py-2 text-sm" />
            <input required type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="border rounded-lg px-3 py-2 text-sm" />
            <input required type="password" placeholder="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="border rounded-lg px-3 py-2 text-sm" />
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="border rounded-lg px-3 py-2 text-sm">
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="bg-brand text-white px-4 py-2 rounded-lg text-sm">Create</button>
            <button type="button" onClick={() => setShowForm(false)} className="border px-4 py-2 rounded-lg text-sm">Cancel</button>
          </div>
        </form>
      )}

      {loading ? <p className="text-gray-400 text-center py-12">Loading...</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-gray-500"><th className="pb-2 pr-4">Name</th><th className="pb-2 pr-4">Email</th><th className="pb-2 pr-4">Role</th><th className="pb-2 pr-4">Status</th><th className="pb-2">Actions</th></tr></thead>
            <tbody className="divide-y">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="py-2 pr-4 font-medium">{u.name}</td>
                  <td className="py-2 pr-4 text-gray-600">{u.email}</td>
                  <td className="py-2 pr-4"><span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs">{u.role}</span></td>
                  <td className="py-2 pr-4"><span className={`text-xs ${u.isActive ? 'text-green-600' : 'text-gray-400'}`}>{u.isActive ? 'Active' : 'Suspended'}</span></td>
                  <td className="py-2"><button onClick={() => toggleActive(u.id, u.isActive)} className="text-xs text-brand hover:underline">{u.isActive ? 'Suspend' : 'Activate'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
