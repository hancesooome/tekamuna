/**
 * src/pages/admin/PostTemplatesPage.tsx
 *
 * Admin page for managing post_templates.
 * Route: /admin/post-templates  (protected by AdminRoute)
 *
 * Features:
 *   - List all templates grouped by platform
 *   - Create new template (with background image upload to Supabase Storage)
 *   - Edit template name, canvas size, platform, verdict, active state
 *   - Replace background image
 *   - Delete template (with confirmation)
 *   - Toggle active/inactive per template
 */

import { useState, useEffect, useRef, useCallback } from "react";
import {
  ImagePlay, Plus, Pencil, Trash2, Loader2, AlertCircle,
  CheckCircle2, ToggleLeft, ToggleRight, ImageIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { API_BASE_URL } from "@/constants";
import { supabase } from "@/lib/supabase";
import { getPublicUrl } from "@/lib/storageUtils";
import { PageContainer } from "@/components/shared/PageContainer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogClose,
} from "@/components/ui/dialog";
import type {
  PostTemplate, TemplatePlatform, TemplateVerdict, CreateTemplatePayload,
} from "@/types/postTemplate";
import TemplateEditor from "@/components/template-editor/TemplateEditor";
import { ImageUploadField } from "@/components/template-editor/ImageUploadField";

// ── Constants ─────────────────────────────────────────────────────────────────

const PLATFORMS: { value: TemplatePlatform; label: string; size: string }[] = [
  { value: "instagram", label: "FB / IG Square Photo", size: "1080 × 1080" },
  { value: "story",     label: "Story",                size: "1080 × 1920" },
];

const VERDICTS: { value: TemplateVerdict; label: string; color: string; dot: string }[] = [
  { value: "true",        label: "Totoo",          color: "bg-emerald-100 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  { value: "false",       label: "Hindi Totoo",    color: "bg-red-100 text-red-700 border-red-200",             dot: "bg-red-500"     },
  { value: "misleading",  label: "Mapanlinlang",   color: "bg-amber-100 text-amber-700 border-amber-200",       dot: "bg-amber-500"   },
  { value: "unverified",  label: "Di Ma-verify",   color: "bg-slate-100 text-slate-600 border-slate-200",       dot: "bg-slate-400"   },
];

const DEFAULT_CANVAS: Record<TemplatePlatform, { w: number; h: number }> = {
  facebook:  { w: 1080, h: 1080 }, // kept for DB compat — maps to square
  instagram: { w: 1080, h: 1080 },
  story:     { w: 1080, h: 1920 },
};

// ── Helper: get auth token ────────────────────────────────────────────────────

async function getToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

// ── Helper: verdict badge ─────────────────────────────────────────────────────

function VerdictBadge({ verdict }: { verdict: TemplateVerdict }) {
  const v = VERDICTS.find((x) => x.value === verdict)!;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${v.color}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${v.dot}`} />
      {v.label}
    </span>
  );
}

// ── Helper: platform badge ────────────────────────────────────────────────────

function PlatformBadge({ platform }: { platform: TemplatePlatform }) {
  const p = PLATFORMS.find((x) => x.value === platform)
    ?? { label: platform === "facebook" ? "FB / IG Square Photo" : platform, size: "1080 × 1080" };
  return (
    <span className="inline-flex items-center rounded-full bg-blue-50 border border-blue-200 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
      {p.label} · {p.size}
    </span>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────

interface Toast { id: number; message: string; type: "success" | "error" }

function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(0);

  const show = useCallback((message: string, type: Toast["type"] = "success") => {
    const id = ++next.current;
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  return { toasts, show };
}


// ── ImageUploadField ──────────────────────────────────────────────────────────

// ── Main Page Component ───────────────────────────────────────────────────────

export default function PostTemplatesPage() {
  const toast = useToast();
  const [templates, setTemplates] = useState<PostTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [activePlatformTab, setActivePlatformTab] = useState<string>("all");
  const [filterVerdict, setFilterVerdict] = useState<string>("all");

  // Dialog / Modal states
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PostTemplate | null>(null);

  // Form states
  const [formName, setFormName] = useState("");
  const [formPlatform, setFormPlatform] = useState<TemplatePlatform>("instagram");
  const [formVerdict, setFormVerdict] = useState<TemplateVerdict>("true");
  const [formWidth, setFormWidth] = useState(1080);
  const [formHeight, setFormHeight] = useState(1080);
  const [formStoragePath, setFormStoragePath] = useState<string | null>(null);
  const [formIsActive, setFormIsActive] = useState(false);
  const [editTargetId, setEditTargetId] = useState<string | null>(null);

  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await getToken();
      const res = await fetch(`${API_BASE_URL}/admin/post-templates`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result = await res.json() as { data: PostTemplate[] };
      setTemplates(result.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load templates");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTemplates();
  }, [fetchTemplates]);

  // Handle Form changes
  const handlePlatformChange = (p: TemplatePlatform) => {
    setFormPlatform(p);
    const defaults = DEFAULT_CANVAS[p];
    if (defaults) {
      setFormWidth(defaults.w);
      setFormHeight(defaults.h);
    }
  };

  // Open Create Dialog
  const openCreate = () => {
    setFormName("");
    setFormPlatform("instagram");
    setFormVerdict("true");
    setFormWidth(1080);
    setFormHeight(1080);
    setFormStoragePath(null);
    setFormIsActive(false);
    setCreateOpen(true);
  };

  // Open Edit Dialog
  const openEdit = (t: PostTemplate) => {
    setEditTargetId(t.id);
    setFormName(t.name);
    setFormPlatform(t.platform);
    setFormVerdict(t.verdict);
    setFormWidth(t.canvas_width);
    setFormHeight(t.canvas_height);
    setFormStoragePath(t.storage_path);
    setFormIsActive(t.is_active);
    setEditOpen(true);
  };

  // CRUD Actions
  const handleToggleActive = async (id: string, currentActive: boolean) => {
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE_URL}/admin/post-templates/${id}/toggle`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ is_active: !currentActive }),
      });
      if (!res.ok) {
        const errData = await res.json() as { error?: string };
        throw new Error(errData.error ?? "Failed to toggle status");
      }
      toast.show(`Template ${!currentActive ? "activated" : "deactivated"} successfully.`, "success");
      setTemplates(prev => prev.map(t => t.id === id ? { ...t, is_active: !currentActive } : t));
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "Error toggling status", "error");
    }
  };

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      toast.show("Please enter a template name.", "error");
      return;
    }
    try {
      const token = await getToken();
      const payload: CreateTemplatePayload = {
        name: formName.trim(),
        platform: formPlatform,
        verdict: formVerdict,
        canvas_width: formWidth,
        canvas_height: formHeight,
        storage_path: formStoragePath,
        is_active: formIsActive,
      };
      const res = await fetch(`${API_BASE_URL}/admin/post-templates`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errData = await res.json() as { error?: string };
        throw new Error(errData.error ?? "Failed to create template");
      }
      toast.show("Template created successfully.", "success");
      setCreateOpen(false);
      void fetchTemplates();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "Error creating template", "error");
    }
  };

  const submitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTargetId) return;
    if (!formName.trim()) {
      toast.show("Please enter a template name.", "error");
      return;
    }
    try {
      const token = await getToken();
      const payload = {
        name: formName.trim(),
        platform: formPlatform,
        verdict: formVerdict,
        canvas_width: formWidth,
        canvas_height: formHeight,
        storage_path: formStoragePath,
        is_active: formIsActive,
      };
      const res = await fetch(`${API_BASE_URL}/admin/post-templates/${editTargetId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errData = await res.json() as { error?: string };
        throw new Error(errData.error ?? "Failed to update template");
      }
      toast.show("Template updated successfully.", "success");
      setEditOpen(false);
      void fetchTemplates();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "Error updating template", "error");
    }
  };

  const submitDelete = async () => {
    if (!deleteTarget) return;
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE_URL}/admin/post-templates/${deleteTarget.id}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const errData = await res.json() as { error?: string };
        throw new Error(errData.error ?? "Failed to delete template");
      }
      toast.show("Template deleted successfully.", "success");
      setTemplates(prev => prev.filter(t => t.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "Error deleting template", "error");
    }
  };

  // Filtering templates
  const filteredTemplates = templates.filter(t => {
    const platformMatch = activePlatformTab === "all" || t.platform === activePlatformTab;
    const verdictMatch = filterVerdict === "all" || t.verdict === filterVerdict;
    return platformMatch && verdictMatch;
  });

  const totalActive = templates.filter(t => t.is_active).length;

  const [selectedTemplateForDesign, setSelectedTemplateForDesign] = useState<PostTemplate | null>(null);
  const [userToken, setUserToken] = useState<string | null>(null);

  useEffect(() => {
    void getToken().then(setUserToken);
  }, []);

  if (selectedTemplateForDesign) {
    return (
      <TemplateEditor
        template={selectedTemplateForDesign}
        token={userToken}
        onBack={() => setSelectedTemplateForDesign(null)}
        onSaveSuccess={() => {
          void fetchTemplates();
        }}
      />
    );
  }

  return (
    <PageContainer className="space-y-8 py-10 pb-16">
      {/* Title Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-black tracking-tight">Post Templates</h1>
          <p className="text-muted-foreground">
            Manage templates like a CMS to generate verdict cards and share images.
          </p>
        </div>
        <Button onClick={openCreate} className="h-10 md:h-11">
          <Plus className="h-4.5 w-4.5" />
          Create Template
        </Button>
      </div>

      {/* Summary Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
              Total Templates
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-black">{templates.length}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
              Active Templates
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-black text-emerald-600">{totalActive}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
              Unique Platforms
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-black">
              {new Set(templates.map(t => t.platform)).size} / 2
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Controls & Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t">
        <Tabs value={activePlatformTab} onValueChange={setActivePlatformTab} className="w-full sm:w-auto">
          <TabsList className="grid grid-cols-3 w-full sm:w-auto">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="instagram">FB / IG</TabsTrigger>
            <TabsTrigger value="story">Story</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
            Verdict:
          </span>
          <select
            value={filterVerdict}
            onChange={(e) => setFilterVerdict(e.target.value)}
            className="flex h-10 rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">All Verdicts</option>
            <option value="true">Totoo</option>
            <option value="false">Hindi Totoo</option>
            <option value="misleading">Mapanlinlang</option>
            <option value="unverified">Di Ma-verify</option>
          </select>
        </div>
      </div>

      {/* Templates List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="h-10 w-10 text-primary animate-spin" />
          <span className="text-sm font-semibold text-muted-foreground">Loading templates...</span>
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center space-y-3">
          <AlertCircle className="h-10 w-10 text-red-500 mx-auto" />
          <h3 className="font-bold text-red-950">Failed to load templates</h3>
          <p className="text-sm text-red-700 max-w-md mx-auto">{error}</p>
          <Button variant="outline" onClick={() => void fetchTemplates()}>Try Again</Button>
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-muted-foreground/20 p-20 text-center space-y-4">
          <ImagePlay className="h-12 w-12 text-muted-foreground/35 mx-auto" />
          <h3 className="text-lg font-black">No templates found</h3>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Try resetting your filters or create a new post template to get started.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTemplates.map((t) => {
            const hasBg = !!t.storage_path;
            const bgUrl = hasBg ? getPublicUrl(t.storage_path) : null;

            return (
              <Card key={t.id} className="overflow-hidden flex flex-col group border hover:border-primary/30 transition-all duration-200 shadow-sm hover:shadow-md">
                {/* Visual Preview Area */}
                <div
                  className="relative bg-muted/40 border-b overflow-hidden flex items-center justify-center"
                  style={{ aspectRatio: "1.91/1" }}
                >
                  {bgUrl ? (
                    <img src={bgUrl} alt={t.name} className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300" />
                  ) : (
                    <div className="text-center p-4 text-muted-foreground">
                      <ImageIcon className="h-8 w-8 mx-auto opacity-30 mb-1" />
                      <span className="text-2xs font-bold uppercase tracking-wider block opacity-60">
                        No Background Image
                      </span>
                    </div>
                  )}
                  {/* Status Overlay */}
                  <div className="absolute top-3 left-3 flex flex-col gap-1.5">
                    <VerdictBadge verdict={t.verdict} />
                    <PlatformBadge platform={t.platform} />
                  </div>
                </div>

                <CardContent className="p-5 flex-1 flex flex-col justify-between">
                  <div className="space-y-2 mb-4">
                    <h3 className="font-extrabold text-base tracking-tight leading-snug truncate">
                      {t.name}
                    </h3>
                    <p className="text-2xs font-mono text-muted-foreground">
                      Canvas: {t.canvas_width} × {t.canvas_height} px
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t">
                    <button
                      type="button"
                      onClick={() => void handleToggleActive(t.id, t.is_active)}
                      className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                      title={t.is_active ? "Deactivate" : "Activate"}
                    >
                      {t.is_active ? (
                        <>
                          <ToggleRight className="h-6 w-6 text-primary" />
                          <span className="text-primary">Active</span>
                        </>
                      ) : (
                        <>
                          <ToggleLeft className="h-6 w-6" />
                          <span>Inactive</span>
                        </>
                      )}
                    </button>

                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setSelectedTemplateForDesign(t)}
                        title="Design Layout"
                        className="text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                      >
                        <ImagePlay className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(t)} title="Edit Template">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteTarget(t)}
                        title="Delete Template"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Toast Notification Container */}
      <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 max-w-sm w-full">
        {toast.toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-start gap-3 rounded-2xl border p-4 shadow-xl backdrop-blur-md transition-all duration-300 animate-in slide-in-from-bottom-5 ${
              t.type === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : "bg-red-50 border-red-200 text-red-800"
            }`}
          >
            {t.type === "success" ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            )}
            <p className="text-xs font-semibold leading-normal">{t.message}</p>
          </div>
        ))}
      </div>

      {/* CREATE MODAL */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Template</DialogTitle>
            <DialogDescription>
              Add a new post template to design custom layouts for sharing.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={submitCreate} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Template Name
              </label>
              <Input
                placeholder="e.g. FB Landscape False Verdict"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Platform
                </label>
                <select
                  value={formPlatform}
                  onChange={(e) => handlePlatformChange(e.target.value as TemplatePlatform)}
                  className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="instagram">FB / IG Square Photo (1080 × 1080)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Verdict
                </label>
                <select
                  value={formVerdict}
                  onChange={(e) => setFormVerdict(e.target.value as TemplateVerdict)}
                  className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="true">Totoo</option>
                  <option value="false">Hindi Totoo</option>
                  <option value="misleading">Mapanlinlang</option>
                  <option value="unverified">Di Ma-verify</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Canvas Width (px)
                </label>
                <Input
                  type="number"
                  value={formWidth}
                  onChange={(e) => setFormWidth(parseInt(e.target.value, 10) || 0)}
                  min={100}
                  max={8000}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Canvas Height (px)
                </label>
                <Input
                  type="number"
                  value={formHeight}
                  onChange={(e) => setFormHeight(parseInt(e.target.value, 10) || 0)}
                  min={100}
                  max={8000}
                  required
                />
              </div>
            </div>

            <ImageUploadField
              currentPath={formStoragePath}
              onUploaded={setFormStoragePath}
            />

            <div className="flex items-center gap-2 pt-2">
              <input
                id="create-active"
                type="checkbox"
                checked={formIsActive}
                onChange={(e) => setFormIsActive(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <label htmlFor="create-active" className="text-sm font-semibold select-none cursor-pointer">
                Set as active template immediately
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <DialogClose asChild>
                <Button type="button" variant="outline">Cancel</Button>
              </DialogClose>
              <Button type="submit">Create Template</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* EDIT MODAL */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Template</DialogTitle>
            <DialogDescription>
              Modify name, dimensions, or upload a new background image.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={submitEdit} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Template Name
              </label>
              <Input
                placeholder="Template Name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Platform
                </label>
                <select
                  value={formPlatform}
                  onChange={(e) => handlePlatformChange(e.target.value as TemplatePlatform)}
                  className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="instagram">FB / IG Square Photo (1080 × 1080)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Verdict
                </label>
                <select
                  value={formVerdict}
                  onChange={(e) => setFormVerdict(e.target.value as TemplateVerdict)}
                  className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="true">Totoo</option>
                  <option value="false">Hindi Totoo</option>
                  <option value="misleading">Mapanlinlang</option>
                  <option value="unverified">Di Ma-verify</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Canvas Width (px)
                </label>
                <Input
                  type="number"
                  value={formWidth}
                  onChange={(e) => setFormWidth(parseInt(e.target.value, 10) || 0)}
                  min={100}
                  max={8000}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Canvas Height (px)
                </label>
                <Input
                  type="number"
                  value={formHeight}
                  onChange={(e) => setFormHeight(parseInt(e.target.value, 10) || 0)}
                  min={100}
                  max={8000}
                  required
                />
              </div>
            </div>

            <ImageUploadField
              currentPath={formStoragePath}
              onUploaded={setFormStoragePath}
            />

            <div className="flex items-center gap-2 pt-2">
              <input
                id="edit-active"
                type="checkbox"
                checked={formIsActive}
                onChange={(e) => setFormIsActive(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <label htmlFor="edit-active" className="text-sm font-semibold select-none cursor-pointer">
                Set as active template
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <DialogClose asChild>
                <Button type="button" variant="outline">Cancel</Button>
              </DialogClose>
              <Button type="submit">Save Changes</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* DELETE CONFIRMATION DIALOG */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-5 w-5" />
              Delete Template?
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <span className="font-bold text-foreground">"{deleteTarget?.name}"</span>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={submitDelete}>Delete</Button>
          </div>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
