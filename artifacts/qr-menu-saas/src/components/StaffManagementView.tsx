import React, { useEffect, useState } from "react";
import {
  Users,
  UserPlus,
  Shield,
  Trash2,
  CheckCircle2,
  RefreshCw,
  Copy,
  Check,
  Clock,
  Ban,
  Sliders,
  Send,
  Link,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getIdToken } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { TablelineLoader } from "./TablelineLoading";

interface StaffManagementViewProps {
  slug: string;
}

export interface StaffMember {
  uid: string;
  name: string | null;
  email: string;
  role: "owner" | "manager" | "captain" | "kitchen" | "staff";
  status: "invited" | "active" | "suspended" | "deactivated";
  permissions: {
    dashboard: boolean;
    orders: boolean;
    kitchen: boolean;
    menu: boolean;
    tables: boolean;
    staff: boolean;
    settings: boolean;
  };
  active: boolean;
  inviteLink: string | null;
  lastSignIn: string | null;
  createdAt: string | null;
}

const DEFAULT_ROLE_PERMS = {
  kitchen: { dashboard: false, orders: true, kitchen: true, menu: false, tables: false, staff: false, settings: false },
  captain: { dashboard: false, orders: true, kitchen: false, menu: false, tables: true, staff: false, settings: false },
  staff: { dashboard: false, orders: true, kitchen: false, menu: false, tables: true, staff: false, settings: false },
  manager: { dashboard: true, orders: true, kitchen: true, menu: true, tables: true, staff: true, settings: false },
  owner: { dashboard: true, orders: true, kitchen: true, menu: true, tables: true, staff: true, settings: true },
};

export function StaffManagementView({ slug }: StaffManagementViewProps) {
  const { toast } = useToast();
  const [members, setMembers] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Invite Modal State
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"captain" | "kitchen" | "manager" | "staff">("captain");
  const [invitePermissions, setInvitePermissions] = useState(DEFAULT_ROLE_PERMS.captain);
  const [submittingInvite, setSubmittingInvite] = useState(false);
  const [createdInvite, setCreatedInvite] = useState<{ email: string; inviteLink: string | null } | null>(null);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);

  // Edit Permissions Modal
  const [editingMember, setEditingMember] = useState<StaffMember | null>(null);
  const [editPermissions, setEditPermissions] = useState(DEFAULT_ROLE_PERMS.captain);
  const [editRole, setEditRole] = useState<"captain" | "kitchen" | "manager" | "staff">("captain");
  const [savingEdit, setSavingEdit] = useState(false);

  // Revoke Member Confirmation State
  const [memberToDelete, setMemberToDelete] = useState<StaffMember | null>(null);
  const [deletingMember, setDeletingMember] = useState(false);

  const fetchMembers = async () => {
    try {
      const token = await getIdToken();
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`/api/restaurants/${slug}/members`, { headers });
      if (res.ok) {
        const list = await res.json();
        setMembers(Array.isArray(list) ? list : []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, [slug]);

  const handleRoleChange = (role: "manager" | "kitchen" | "staff") => {
    setInviteRole(role);
    setInvitePermissions(DEFAULT_ROLE_PERMS[role]);
  };

  const handleToggleInvitePerm = (key: keyof typeof DEFAULT_ROLE_PERMS.staff) => {
    setInvitePermissions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleToggleEditPerm = (key: keyof typeof DEFAULT_ROLE_PERMS.staff) => {
    setEditPermissions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteName.trim() || !inviteEmail.trim()) {
      toast({ variant: "destructive", title: "Missing fields", description: "Name and email are required." });
      return;
    }
    setSubmittingInvite(true);
    setCreatedInvite(null);

    try {
      const token = await getIdToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`/api/restaurants/${slug}/members`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: inviteName.trim(),
          email: inviteEmail.trim(),
          role: inviteRole,
          permissions: invitePermissions,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setCreatedInvite({
          email: inviteEmail.trim(),
          inviteLink: data.inviteLink || null,
        });
        toast({
          title: "Invitation created!",
          description: "Share the activation link with your staff member.",
        });
        setInviteName("");
        setInviteEmail("");
        fetchMembers();
      } else {
        toast({
          variant: "destructive",
          title: "Failed to invite staff",
          description: data.message || "Please check the entered email address.",
        });
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Network error",
        description: err.message || "Could not complete request.",
      });
    } finally {
      setSubmittingInvite(false);
    }
  };

  const handleToggleSuspension = async (member: StaffMember) => {
    const isCurrentlySuspended = member.status === "suspended";
    const nextStatus = isCurrentlySuspended ? "active" : "suspended";
    setActionLoadingId(member.uid);

    try {
      const token = await getIdToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`/api/restaurants/${slug}/members/${member.uid}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ status: nextStatus }),
      });

      if (res.ok) {
        toast({
          title: isCurrentlySuspended ? "Staff member reactivated" : "Staff access suspended",
          description: isCurrentlySuspended
            ? "They can now access their designated portals again."
            : "Their access to all restaurant portals has been temporarily blocked.",
        });
        fetchMembers();
      } else {
        toast({ variant: "destructive", title: "Could not update status" });
      }
    } catch {
      toast({ variant: "destructive", title: "Network error updating status" });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleResendInvite = async (member: StaffMember) => {
    setActionLoadingId(member.uid);
    try {
      const token = await getIdToken();
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`/api/restaurants/${slug}/members/${member.uid}/resend-invite`, {
        method: "POST",
        headers,
      });

      const data = await res.json();
      if (res.ok) {
        toast({
          title: "New invitation link generated",
          description: "Click Copy Link on their card to share it directly.",
        });
        fetchMembers();
      } else {
        toast({ variant: "destructive", title: "Could not regenerate invite link" });
      }
    } catch {
      toast({ variant: "destructive", title: "Network error" });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDeleteMember = (member: StaffMember) => {
    setMemberToDelete(member);
  };

  const handleConfirmDeleteMember = async () => {
    if (!memberToDelete) return;
    setDeletingMember(true);
    setActionLoadingId(memberToDelete.uid);
    try {
      const token = await getIdToken();
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`/api/restaurants/${slug}/members/${memberToDelete.uid}`, {
        method: "DELETE",
        headers,
      });

      if (res.ok) {
        toast({ title: "Staff member removed", description: `Access revoked for ${memberToDelete.name || memberToDelete.email}.` });
        setMembers((prev) => prev.filter((m) => m.uid !== memberToDelete.uid));
        setMemberToDelete(null);
      } else {
        toast({ variant: "destructive", title: "Failed to remove staff member" });
      }
    } catch {
      toast({ variant: "destructive", title: "Network error" });
    } finally {
      setActionLoadingId(null);
      setDeletingMember(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingMember) return;
    setSavingEdit(true);
    try {
      const token = await getIdToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`/api/restaurants/${slug}/members/${editingMember.uid}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          role: editRole,
          permissions: editPermissions,
        }),
      });

      if (res.ok) {
        toast({ title: "Permissions updated successfully" });
        setEditingMember(null);
        fetchMembers();
      } else {
        toast({ variant: "destructive", title: "Could not save permissions" });
      }
    } catch {
      toast({ variant: "destructive", title: "Network error" });
    } finally {
      setSavingEdit(false);
    }
  };

  const handleCopyLink = (linkText: string, id: string) => {
    navigator.clipboard.writeText(linkText);
    setCopiedLinkId(id);
    setTimeout(() => setCopiedLinkId(null), 2500);
    toast({ title: "Activation link copied to clipboard!" });
  };

  const PERMISSION_LABELS: Record<string, { label: string; desc: string }> = {
    dashboard: { label: "Dashboard", desc: "View sales overview & daily performance" },
    orders: { label: "Live Orders", desc: "View, approve, and manage live dining orders" },
    kitchen: { label: "Kitchen Display (KDS)", desc: "Kitchen order pass & cooking status updates" },
    menu: { label: "Menu Catalog", desc: "Edit dishes, categories, and live availability" },
    tables: { label: "Tables & QR", desc: "Manage floor layout and generate QR codes" },
    staff: { label: "Staff Management", desc: "Invite and coordinate floor & kitchen staff" },
    settings: { label: "Restaurant Settings", desc: "Billing, taxes, and core restaurant profile" },
  };

  return (
    <div className="space-y-6" id="staff-management-view">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border/70 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Staff & Permissions
            </h1>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Invite managers, service waiters, and kitchen cooks with distinct role-based access.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => {
              setCreatedInvite(null);
              setInviteRole("staff");
              setInvitePermissions(DEFAULT_ROLE_PERMS.staff);
              setShowInviteModal(true);
            }}
            className="rounded-xl font-semibold gap-1.5"
            id="button-add-staff"
          >
            <UserPlus className="h-4 w-4" />
            Invite Staff Member
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={fetchMembers}
            className="rounded-xl h-8 text-xs"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            Refresh
          </Button>
        </div>
      </div>

      {loading ? (
        <TablelineLoader
          variant="card"
          message="Loading team & shifts…"
          subtext="Fetching staff roster and role permissions…"
          onRetry={fetchMembers}
        />
      ) : members.length === 0 ? (
        <div className="flex min-h-[200px] flex-col items-center justify-center rounded-2xl border border-dashed border-border p-8 text-center bg-card/40">
          <Users className="h-10 w-10 text-muted-foreground opacity-60" />
          <h3 className="mt-3 font-display text-lg font-bold">No Staff Members Added Yet</h3>
          <p className="mt-1 text-xs text-muted-foreground max-w-md">
            Invite your managers, kitchen staff, or waitstaff. Each member receives a personal link to securely set their password.
          </p>
          <Button
            size="sm"
            onClick={() => setShowInviteModal(true)}
            className="mt-4 rounded-xl font-semibold"
          >
            <UserPlus className="h-4 w-4 mr-1.5" /> Invite First Staff Member
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {members.map((member) => {
            const role = member.role || "staff";
            const isOwner = role === "owner";
            const isSuspended = member.status === "suspended";
            const isInvited = member.status === "invited";
            const roleDisplay =
              role === "captain"
                ? "Floor Waiter"
                : role === "kitchen"
                ? "Kitchen"
                : role === "manager"
                ? "Manager"
                : role === "owner"
                ? "Owner Admin"
                : "Staff";

            return (
              <div
                key={member.uid}
                className={`flex flex-col justify-between rounded-2xl border bg-card p-5 shadow-xs transition-all ${
                  isSuspended
                    ? "border-amber-500/30 bg-amber-500/[0.02] opacity-80"
                    : "border-border hover:border-border/90"
                }`}
                id={`staff-card-${member.uid}`}
              >
                <div>
                  {/* Top: Name, Email & Role */}
                  <div className="space-y-1 pb-3 border-b border-border/60">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-semibold text-base text-foreground truncate">
                        {member.name || member.email?.split("@")[0] || "Staff Member"}
                      </h4>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${
                          isOwner
                            ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                            : role === "manager"
                            ? "bg-purple-500/10 text-purple-700 dark:text-purple-300"
                            : role === "captain"
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                            : role === "kitchen"
                            ? "bg-blue-500/10 text-blue-700 dark:text-blue-300"
                            : "bg-secondary text-secondary-foreground"
                        }`}
                      >
                        {roleDisplay}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                  </div>

                  {/* Status Indicator: ● Active / ● Disabled */}
                  <div className="mt-3.5 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-medium">
                      {isInvited ? (
                        <span className="inline-flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-semibold">
                          <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                          Invited (Pending Setup)
                        </span>
                      ) : isSuspended ? (
                        <span className="inline-flex items-center gap-1.5 text-red-600 dark:text-red-400 font-semibold">
                          <span className="h-2 w-2 rounded-full bg-red-500" />
                          Disabled
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold">
                          <span className="h-2 w-2 rounded-full bg-emerald-500" />
                          Active
                        </span>
                      )}
                    </div>

                    {isInvited && member.inviteLink && (
                      <button
                        type="button"
                        onClick={() => handleCopyLink(member.inviteLink!, `card-${member.uid}`)}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                      >
                        {copiedLinkId === `card-${member.uid}` ? (
                          <>
                            <Check className="h-3 w-3 text-emerald-600" /> Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" /> Copy Link
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* Card Action Controls: [Edit] [Disable / Enable] */}
                {!isOwner && (
                  <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingMember(member);
                          setEditRole(role as any);
                          setEditPermissions(member.permissions || DEFAULT_ROLE_PERMS[role as keyof typeof DEFAULT_ROLE_PERMS] || DEFAULT_ROLE_PERMS.captain);
                        }}
                        className="h-8 px-3 text-xs rounded-xl font-medium"
                      >
                        Edit
                      </Button>

                      <Button
                        variant={isSuspended ? "default" : "outline"}
                        size="sm"
                        disabled={actionLoadingId === member.uid}
                        onClick={() => handleToggleSuspension(member)}
                        className={`h-8 px-3 text-xs rounded-xl font-medium ${
                          isSuspended
                            ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                            : "text-red-700 dark:text-red-300 border-red-200 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-950/30"
                        }`}
                      >
                        {isSuspended ? "Enable" : "Disable"}
                      </Button>
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={actionLoadingId === member.uid}
                      onClick={() => handleDeleteMember(member)}
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl"
                      title="Remove staff"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ADD STAFF MODAL */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 sm:p-7 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-border/70 pb-3">
              <div>
                <h3 className="font-display text-xl font-bold text-foreground">+ Add Staff</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Create an individual Firebase account for your restaurant staff.
                </p>
              </div>
              <button
                onClick={() => setShowInviteModal(false)}
                className="text-muted-foreground hover:text-foreground text-sm font-semibold p-1"
              >
                ✕
              </button>
            </div>

            {createdInvite ? (
              <div className="space-y-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-sm">
                <div className="flex items-start gap-2.5 text-emerald-800 dark:text-emerald-300 font-bold text-base">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 mt-0.5" />
                  <div>
                    <div>✓ Staff account created</div>
                    <p className="text-xs font-normal text-muted-foreground mt-1.5 leading-relaxed">
                      A secure password setup email has been sent to <strong className="text-foreground font-semibold">{createdInvite.email}</strong>.
                    </p>
                  </div>
                </div>

                {createdInvite.inviteLink && (
                  <div className="space-y-2 rounded-xl bg-background p-3.5 border border-border mt-3">
                    <span className="text-[11px] font-semibold text-muted-foreground block">
                      Direct Password Setup Link (Optional Quick Share):
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCopyLink(createdInvite.inviteLink!, "modal-invite")}
                      className="rounded-xl text-xs w-full gap-1.5 font-semibold"
                    >
                      {copiedLinkId === "modal-invite" ? (
                        <>
                          <Check className="h-4 w-4 text-emerald-600" /> Copied Link!
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4" /> Copy Password Setup Link
                        </>
                      )}
                    </Button>
                  </div>
                )}

                <div className="flex justify-end pt-2">
                  <Button
                    size="sm"
                    onClick={() => setShowInviteModal(false)}
                    className="rounded-xl text-xs font-semibold px-6"
                  >
                    Done
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSendInvite} className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-foreground">Full Name</label>
                  <Input
                    type="text"
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    placeholder="e.g. Rahul Patel"
                    required
                    className="rounded-xl mt-1 text-sm h-10"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-foreground">Email</label>
                  <Input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="e.g. staff@restaurant.com"
                    required
                    className="rounded-xl mt-1 text-sm h-10"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-foreground">Role</label>
                  <div className="grid grid-cols-2 gap-2 mt-1.5">
                    {[
                      { key: "captain", label: "Floor Waiter", desc: "Floor orders, tables & service" },
                      { key: "kitchen", label: "Kitchen", desc: "Live KDS prep tickets" },
                      { key: "manager", label: "Manager", desc: "Full floor & menu control" },
                      { key: "staff", label: "Staff", desc: "General dining & service" },
                    ].map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => handleRoleChange(item.key as any)}
                        className={`rounded-2xl border p-3 text-left transition-all ${
                          inviteRole === item.key
                            ? "border-primary bg-primary/10 text-primary font-bold shadow-xs ring-1 ring-primary/40"
                            : "border-border hover:bg-secondary/60 text-muted-foreground"
                        }`}
                      >
                        <div className="text-xs font-bold text-foreground">{item.label}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{item.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/70">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowInviteModal(false)}
                    className="rounded-xl text-xs h-9 px-4"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={submittingInvite}
                    className="rounded-xl text-xs font-semibold h-9 px-5"
                  >
                    {submittingInvite ? "Creating Account…" : "Create Staff"}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* EDIT PERMISSIONS MODAL */}
      {editingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border/70 pb-3">
              <div>
                <h3 className="font-display text-lg font-bold text-foreground">Edit Staff Permissions</h3>
                <p className="text-xs text-muted-foreground">
                  {editingMember.name || editingMember.email}
                </p>
              </div>
              <button
                onClick={() => setEditingMember(null)}
                className="text-muted-foreground hover:text-foreground text-sm font-semibold p-1"
              >
                ✕
              </button>
            </div>

            <div>
              <label className="text-xs font-medium text-foreground">Role</label>
              <select
                value={editRole}
                onChange={(e) => {
                  const newRole = e.target.value as any;
                  setEditRole(newRole);
                  setEditPermissions(DEFAULT_ROLE_PERMS[newRole as keyof typeof DEFAULT_ROLE_PERMS] || DEFAULT_ROLE_PERMS.captain);
                }}
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm mt-1"
              >
                <option value="captain">Floor Waiter (Floor & Tables)</option>
                <option value="kitchen">Kitchen (KDS Pass)</option>
                <option value="manager">Manager (Floor & Menu)</option>
                <option value="staff">Staff (Floor Service)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-foreground mb-2 block">
                Accessible Portals
              </label>
              <div className="divide-y divide-border/60 rounded-xl border border-border bg-secondary/30 p-2 text-xs space-y-1">
                {Object.entries(PERMISSION_LABELS).map(([key, info]) => {
                  if (key === "settings") return null;
                  const checked = editPermissions[key as keyof typeof DEFAULT_ROLE_PERMS.staff] ?? false;
                  return (
                    <label
                      key={key}
                      className="flex items-center justify-between py-2 px-2 cursor-pointer hover:bg-secondary/50 rounded-lg"
                    >
                      <div>
                        <span className="font-semibold text-foreground block">{info.label}</span>
                        <span className="text-[11px] text-muted-foreground">{info.desc}</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => handleToggleEditPerm(key as keyof typeof DEFAULT_ROLE_PERMS.staff)}
                        className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                      />
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/70">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditingMember(null)}
                className="rounded-xl text-xs"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={savingEdit}
                onClick={handleSaveEdit}
                className="rounded-xl text-xs font-semibold"
              >
                {savingEdit ? "Saving…" : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Revoke Member Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(memberToDelete)}
        onOpenChange={(open) => {
          if (!open && !deletingMember) setMemberToDelete(null);
        }}
        title={`Revoke access for ${memberToDelete?.name || memberToDelete?.email || "this member"}?`}
        description="This will immediately revoke their dashboard access and permissions. This action cannot be undone."
        confirmLabel="Revoke Access"
        isDestructive={true}
        isLoading={deletingMember}
        onConfirm={handleConfirmDeleteMember}
      />
    </div>
  );
}
