"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, Plus, X, Check, GripVertical } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const backendBase = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

function SortableTag({ tag }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tag.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <span
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="whitespace-nowrap text-sm px-3 py-1.5 rounded-md cursor-grab active:cursor-grabbing flex items-center gap-1 border bg-background hover:bg-muted"
    >
      <GripVertical className="w-3 h-3 opacity-40" />
      {tag.name}
    </span>
  );
}

export default function TagsManager({ user }) {
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [newTag, setNewTag] = useState({ name: "", sort_order: 0, is_nav: true });
  const [editingId, setEditingId] = useState(null);
  const [editingTag, setEditingTag] = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [orderChanged, setOrderChanged] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    fetchTags();
  }, []);

  async function fetchTags() {
    setLoading(true);
    try {
      const res = await fetch(`${backendBase}/api/tags/`);
      const data = await res.json();
      setTags(data.items || []);
    } catch (err) {
      setError("Failed to load tags");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!newTag.name.trim()) return;
    setError("");
    setSuccess("");
    try {
      const res = await fetch(`${backendBase}/api/admin/tags/create/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(user ? { "X-User-Id": user.id } : {}),
        },
        body: JSON.stringify({
          name: newTag.name.trim(),
          sort_order: Number(newTag.sort_order) || 0,
          is_nav: newTag.is_nav,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create tag");
      } else {
        setSuccess("Tag created");
        setNewTag({ name: "", sort_order: 0, is_nav: true });
        fetchTags();
      }
    } catch (err) {
      setError("Failed to create tag");
    }
  }

  async function handleUpdate(id) {
    if (!editingTag.name?.trim()) return;
    setError("");
    setSuccess("");
    try {
      const res = await fetch(`${backendBase}/api/admin/tags/${id}/`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(user ? { "X-User-Id": user.id } : {}),
        },
        body: JSON.stringify({
          name: editingTag.name.trim(),
          sort_order: Number(editingTag.sort_order) || 0,
          is_nav: editingTag.is_nav,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to update tag");
      } else {
        setSuccess("Tag updated");
        setEditingId(null);
        setEditingTag({});
        fetchTags();
      }
    } catch (err) {
      setError("Failed to update tag");
    }
  }

  async function handleDelete(id, name) {
    setError("");
    setSuccess("");
    try {
      const res = await fetch(`${backendBase}/api/admin/tags/${id}/delete/`, {
        method: "DELETE",
        headers: user ? { "X-User-Id": user.id } : {},
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to delete tag");
      } else {
        setSuccess("Tag deleted");
        fetchTags();
      }
    } catch (err) {
      setError("Failed to delete tag");
    } finally {
      setDeleteConfirm(null);
    }
  }

  function startEdit(tag) {
    setEditingId(tag.id);
    setEditingTag({ ...tag });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingTag({});
  }

  const navTags = tags.filter(t => t.is_nav).sort((a, b) => a.sort_order - b.sort_order);

  function handleDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = navTags.findIndex(t => t.id === active.id);
    const newIndex = navTags.findIndex(t => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(navTags, oldIndex, newIndex);
    const updates = reordered.map((tag, idx) => ({ ...tag, sort_order: idx }));

    setTags(prev => prev.map(t => {
      const updated = updates.find(u => u.id === t.id);
      return updated ? { ...t, sort_order: updated.sort_order } : t;
    }));
    setOrderChanged(true);
  }

  async function saveOrder() {
    setError("");
    setSuccess("");
    for (const tag of navTags) {
      await fetch(`${backendBase}/api/admin/tags/${tag.id}/`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(user ? { "X-User-Id": user.id } : {}),
        },
        body: JSON.stringify({ name: tag.name, sort_order: tag.sort_order, is_nav: tag.is_nav }),
      });
    }
    setOrderChanged(false);
    setSuccess("Order saved");
  }

  return (
    <section className="bg-card border border rounded-xl p-6">
      <h2 className="text-xl font-semibold mb-2">Navigation Categories</h2>
      <p className="text-sm text-foreground opacity-60 mb-4">
        Manage the category tabs shown in the navigation bar.
      </p>

      {error && <div className="text-red-400 mb-4">{error}</div>}
      {success && <div className="text-green-400 mb-4">{success}</div>}

      <form onSubmit={handleCreate} className="grid grid-cols-12 gap-3 mb-6 items-end">
        <div className="col-span-5">
          <label className="text-xs text-foreground opacity-60">Name *</label>
          <input
            type="text"
            className="w-full mt-1 bg-popover border border rounded-lg p-2 text-foreground"
            placeholder="e.g. Politics"
            value={newTag.name}
            onChange={(e) => setNewTag({ ...newTag, name: e.target.value })}
          />
        </div>
        <div className="col-span-2">
          <label className="text-xs text-foreground opacity-60">Sort Order</label>
          <input
            type="number"
            className="w-full mt-1 bg-popover border border rounded-lg p-2 text-foreground"
            value={newTag.sort_order}
            onChange={(e) => setNewTag({ ...newTag, sort_order: e.target.value })}
          />
        </div>
        <div className="col-span-3 flex items-center gap-2 pb-2">
          <input
            type="checkbox"
            id="new-is-nav"
            checked={newTag.is_nav}
            onChange={(e) => setNewTag({ ...newTag, is_nav: e.target.checked })}
            className="w-4 h-4"
          />
          <label htmlFor="new-is-nav" className="text-sm text-foreground">Show in Nav</label>
        </div>
        <div className="col-span-2">
          <Button type="submit" disabled={!newTag.name.trim()} className="w-full">
            <Plus className="w-4 h-4 mr-1" />
            Add
          </Button>
        </div>
      </form>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-foreground opacity-80">Preview (drag to reorder):</h3>
          {orderChanged && (
            <Button size="sm" onClick={saveOrder}>
              Save Order
            </Button>
          )}
        </div>
        <div className="flex gap-2 overflow-x-auto p-3 bg-popover rounded-lg border">
          {navTags.length === 0 ? (
            <span className="text-foreground opacity-40">No navigation tags yet</span>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={navTags.map(t => t.id)} strategy={horizontalListSortingStrategy}>
                {navTags.map((tag) => (
                  <SortableTag key={tag.id} tag={tag} />
                ))}
              </SortableContext>
            </DndContext>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-foreground opacity-60">Loading...</div>
      ) : tags.length === 0 ? (
        <div className="text-foreground opacity-60">No tags yet</div>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-12 gap-3 text-xs text-foreground opacity-60 px-3">
            <div className="col-span-5">Name</div>
            <div className="col-span-2">Sort Order</div>
            <div className="col-span-3">In Nav</div>
            <div className="col-span-2">Actions</div>
          </div>
          {tags.map((tag) => (
            <div key={tag.id} className="grid grid-cols-12 gap-3 items-center p-3 bg-popover border border rounded-lg">
              {editingId === tag.id ? (
                <>
                  <div className="col-span-5">
                    <input
                      type="text"
                      className="w-full bg-background border border rounded-lg p-2 text-foreground"
                      value={editingTag.name}
                      onChange={(e) => setEditingTag({ ...editingTag, name: e.target.value })}
                      autoFocus
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="number"
                      className="w-full bg-background border border rounded-lg p-2 text-foreground"
                      value={editingTag.sort_order}
                      onChange={(e) => setEditingTag({ ...editingTag, sort_order: e.target.value })}
                    />
                  </div>
                  <div className="col-span-3">
                    <input
                      type="checkbox"
                      checked={editingTag.is_nav}
                      onChange={(e) => setEditingTag({ ...editingTag, is_nav: e.target.checked })}
                      className="w-4 h-4"
                    />
                  </div>
                  <div className="col-span-2 flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => handleUpdate(tag.id)}>
                      <Check className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={cancelEdit}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="col-span-5 text-foreground">{tag.name}</div>
                  <div className="col-span-2 text-foreground">{tag.sort_order}</div>
                  <div className="col-span-3">
                    {tag.is_nav ? (
                      <span className="text-green-400 text-sm">Yes</span>
                    ) : (
                      <span className="text-foreground opacity-40 text-sm">No</span>
                    )}
                  </div>
                  <div className="col-span-2 flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => startEdit(tag)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-400 hover:text-red-300"
                      onClick={() => setDeleteConfirm({ id: tag.id, name: tag.name })}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border rounded-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold mb-2">Delete Tag</h3>
            <p className="text-foreground opacity-70 mb-4">
              Are you sure you want to delete "{deleteConfirm.name}"?
            </p>
            <div className="flex gap-3 justify-end">
              <Button variant="ghost" onClick={() => setDeleteConfirm(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="bg-red-500 hover:bg-red-600"
                onClick={() => handleDelete(deleteConfirm.id, deleteConfirm.name)}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
