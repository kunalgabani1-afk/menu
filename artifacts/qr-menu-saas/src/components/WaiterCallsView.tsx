import React, { useEffect, useState } from "react";
import {
  Bell,
  CheckCircle2,
  Clock,
  Droplets,
  Receipt,
  Utensils,
  Sparkles,
  RefreshCw,
  Plus,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getIdToken } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { orderAudioAlert } from "@/lib/orderAudioAlert";
import { AudioAlertBanner } from "./AudioAlertBanner";
import { TablelineLoader } from "./TablelineLoading";

interface WaiterCallsViewProps {
  slug: string;
}

export function WaiterCallsView({ slug }: WaiterCallsViewProps) {
  const { toast } = useToast();
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  // New request form modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTableNum, setNewTableNum] = useState("1");
  const [newType, setNewType] = useState("CALL_WAITER");
  const [newNotes, setNewNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isInitialWaiterFetchRef = React.useRef(true);

  const fetchRequests = async () => {
    try {
      const token = await getIdToken();
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`/api/restaurants/${slug}/waiter-requests`, { headers });
      if (res.ok) {
        const data = await res.json();
        const list = data.items || [];
        if (isInitialWaiterFetchRef.current) {
          orderAudioAlert.markInitialRecordsSeen(undefined, list);
          isInitialWaiterFetchRef.current = false;
        }
        setRequests(list);
      }
    } catch {
      // Graceful fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    orderAudioAlert.setActiveWorkspace("waiter-calls");
    orderAudioAlert.connect(slug);
    fetchRequests();

    const unsubRefresh = orderAudioAlert.onDataRefresh(() => {
      fetchRequests();
    });

    const unsubWaiter = orderAudioAlert.onWaiterCall(() => {
      fetchRequests();
    });

    const interval = setInterval(fetchRequests, 8000);
    return () => {
      clearInterval(interval);
      unsubRefresh();
      unsubWaiter();
      orderAudioAlert.setActiveWorkspace("all");
    };
  }, [slug]);

  const handleResolve = async (requestId: string, status: "ACKNOWLEDGED" | "COMPLETED") => {
    setResolvingId(requestId);
    try {
      const token = await getIdToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`/api/restaurants/${slug}/waiter-requests/${requestId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ status }),
      });

      if (res.ok) {
        toast({
          title: status === "COMPLETED" ? "Request resolved" : "Request acknowledged",
        });
        setRequests((prev) =>
          prev.map((r) => (r.id === requestId ? { ...r, status } : r))
        );
      }
    } catch {
      toast({ variant: "destructive", title: "Could not update request" });
    } finally {
      setResolvingId(null);
    }
  };

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(`/api/restaurants/${slug}/waiter-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tableNumber: newTableNum.trim(),
          serviceType: newType,
          notes: newNotes.trim(),
        }),
      });

      if (res.ok) {
        orderAudioAlert.playWaiterCallAlert();
        toast({ title: "Service request dispatched!" });
        setShowAddModal(false);
        setNewNotes("");
        fetchRequests();
      }
    } catch {
      toast({ variant: "destructive", title: "Failed to dispatch request" });
    } finally {
      setSubmitting(false);
    }
  };

  const getServiceBadge = (type: string) => {
    switch (type) {
      case "WATER":
        return { icon: Droplets, label: "Water Refill", color: "bg-blue-500/10 text-blue-700 dark:text-blue-300" };
      case "BILL":
        return { icon: Receipt, label: "Bill / Check", color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" };
      case "CUTLERY":
        return { icon: Utensils, label: "Extra Cutlery", color: "bg-purple-500/10 text-purple-700 dark:text-purple-300" };
      case "CLEAN_TABLE":
        return { icon: Sparkles, label: "Clean Table", color: "bg-amber-500/10 text-amber-700 dark:text-amber-300" };
      default:
        return { icon: Bell, label: "Call Waiter", color: "bg-red-500/10 text-red-700 dark:text-red-300" };
    }
  };

  const pendingRequests = requests.filter((r) => r.status !== "COMPLETED");
  const completedRequests = requests.filter((r) => r.status === "COMPLETED");

  return (
    <div className="space-y-6" id="waiter-calls-view">
      <AudioAlertBanner />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border/70 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Bell className="h-6 w-6 text-primary" />
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Waiter Call System
            </h1>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Diner service requests from digital QR menus (water, bill, server assistance, cutlery).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => setShowAddModal(true)}
            className="rounded-xl font-semibold gap-1.5"
            id="button-trigger-call"
          >
            <Plus className="h-4 w-4" />
            New Service Call
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={fetchRequests}
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
          message="Loading service requests…"
          subtext="Listening for table calls & assistance alerts…"
          onRetry={fetchRequests}
        />
      ) : pendingRequests.length === 0 ? (
        <div className="flex min-h-[200px] flex-col items-center justify-center rounded-2xl border border-dashed border-border p-8 text-center bg-card/40">
          <CheckCircle2 className="h-10 w-10 text-emerald-500 opacity-80" />
          <h3 className="mt-3 font-display text-lg font-bold">All Tables Serviced</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            No active diner requests pending. Tables are happy and dining smoothly.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {pendingRequests.map((req) => {
            const badge = getServiceBadge(req.serviceType);
            const Icon = badge.icon;
            const isAcknowledged = req.status === "ACKNOWLEDGED";

            return (
              <div
                key={req.id}
                className="flex flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-xs"
                id={`waiter-req-${req.id}`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 border-b border-border/60 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="rounded-xl bg-secondary px-3 py-1 font-mono font-bold text-sm text-foreground">
                        Table {req.tableNumber || "—"}
                      </span>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.color}`}>
                        <Icon className="h-3.5 w-3.5" />
                        {badge.label}
                      </span>
                    </div>

                    <span className="text-[11px] text-muted-foreground font-mono">
                      {req.createdAt ? new Date(req.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Now"}
                    </span>
                  </div>

                  {req.notes && (
                    <div className="mt-3 rounded-xl bg-secondary/50 p-2.5 text-xs text-foreground">
                      <p className="font-semibold text-[11px] text-muted-foreground">Diner Note:</p>
                      <p className="mt-0.5 italic">"{req.notes}"</p>
                    </div>
                  )}
                </div>

                <div className="mt-4 flex items-center gap-2 border-t border-border/60 pt-3">
                  {!isAcknowledged && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleResolve(req.id, "ACKNOWLEDGED")}
                      disabled={resolvingId === req.id}
                      className="flex-1 rounded-xl text-xs font-semibold"
                    >
                      Acknowledge
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={() => handleResolve(req.id, "COMPLETED")}
                    disabled={resolvingId === req.id}
                    className="flex-1 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                    Mark Resolved
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Manual Request Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl space-y-4">
            <h3 className="font-display text-lg font-bold text-foreground">Create Service Request</h3>
            <form onSubmit={handleCreateRequest} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-foreground">Table Number</label>
                <Input
                  value={newTableNum}
                  onChange={(e) => setNewTableNum(e.target.value)}
                  placeholder="e.g. 1"
                  required
                  className="rounded-xl mt-1"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-foreground">Service Type</label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value)}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm mt-1"
                >
                  <option value="CALL_WAITER">🔔 Call Waiter / Server Assistance</option>
                  <option value="WATER">💧 Water Refill</option>
                  <option value="BILL">🧾 Bill / Request Check</option>
                  <option value="CUTLERY">🍴 Extra Cutlery / Napkins</option>
                  <option value="CLEAN_TABLE">✨ Table Cleaning</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-foreground">Special Request Note (optional)</label>
                <Input
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="e.g. Room temperature water, extra spicy sauce"
                  className="rounded-xl mt-1"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-xl text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={submitting}
                  className="rounded-xl text-xs font-semibold"
                >
                  {submitting ? "Dispatching…" : "Dispatch Call"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
