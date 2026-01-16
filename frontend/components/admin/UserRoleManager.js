"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";

const backendBase = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

export default function UserRoleManager({ user }) {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  useEffect(() => {
    if (user) fetchUsers();
  }, [user, page]);

  async function fetchUsers() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page, page_size: pageSize });
      if (search) params.set("search", search);
      const res = await fetch(`${backendBase}/api/admin/users/?${params}`, {
        headers: { "X-User-Id": user.id },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load users");
      setUsers(data.users || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRoleChange(userId, newRole) {
    setError("");
    setSuccess("");
    try {
      const res = await fetch(`${backendBase}/api/admin/users/${userId}/role/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": user.id,
        },
        body: JSON.stringify({ role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update role");
      setSuccess(`Role updated: ${data.old_role} → ${data.role}`);
      fetchUsers();
    } catch (err) {
      setError(err.message);
    }
  }

  function handleSearch(e) {
    e.preventDefault();
    setPage(1);
    fetchUsers();
  }

  const totalPages = Math.ceil(total / pageSize);

  return (
    <section className="bg-card border border rounded-xl p-6">
      <h2 className="text-xl font-semibold mb-4">User Role Management</h2>

      <form onSubmit={handleSearch} className="flex gap-3 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by display name..."
          className="flex-1 bg-popover border border rounded-lg px-3 py-2 text-foreground"
        />
        <Button type="submit" variant="outline">Search</Button>
        <Button type="button" variant="outline" onClick={() => { setSearch(""); setPage(1); fetchUsers(); }}>
          Reset
        </Button>
      </form>

      {error && <div className="text-red-400 mb-4">{error}</div>}
      {success && <div className="text-green-400 mb-4">{success}</div>}

      {loading ? (
        <div className="text-foreground opacity-60">Loading...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-foreground opacity-80">
              <tr className="text-left">
                <th className="p-2">Display Name</th>
                <th className="p-2">Email</th>
                <th className="p-2">Current Role</th>
                <th className="p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border">
                  <td className="p-2">{u.display_name || "-"}</td>
                  <td className="p-2 text-foreground opacity-80">{u.email || "-"}</td>
                  <td className="p-2">
                    <span className={`px-2 py-1 rounded text-xs ${
                      u.role === "superadmin" ? "bg-purple-600 text-white" :
                      u.role === "admin" ? "bg-blue-600 text-white" : "bg-popover"
                    }`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="p-2">
                    {u.role === "superadmin" ? (
                      <span className="text-foreground opacity-50 text-xs">Cannot modify</span>
                    ) : (
                      <select
                        value={u.role}
                        onChange={(e) => handleRoleChange(u.id, e.target.value)}
                        className="bg-popover border border rounded-lg px-2 py-1 text-foreground text-sm"
                      >
                        <option value="user">user</option>
                        <option value="admin">admin</option>
                      </select>
                    )}
                  </td>
                </tr>
              ))}
              {!users.length && (
                <tr>
                  <td className="p-4 text-foreground opacity-60" colSpan={4}>
                    No users found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 pt-4 border-t border">
          <div className="text-sm text-foreground opacity-60">
            Total {total} users, Page {page}/{totalPages}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
