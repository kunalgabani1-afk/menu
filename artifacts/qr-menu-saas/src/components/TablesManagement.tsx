import React, { useEffect, useState, useMemo } from "react";
import QRCode from "qrcode";
import {
  QrCode,
  Plus,
  Printer,
  Download,
  Trash2,
  ExternalLink,
  AlertTriangle,
  RotateCw,
  CheckCircle2,
  Clock,
  Edit2,
  DoorClosed,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { getIdToken } from "@/lib/firebase";
import { TablelineLoader } from "./TablelineLoading";
import { formatTableName } from "@/lib/formatters";
import {
  useListTables,
  useCreateTable,
  useUpdateTable,
  useGetRestaurantDashboard,
  getListTablesQueryKey,
  getGetRestaurantDashboardQueryKey,
} from "@workspace/api-client-react";
import type { Table } from "@workspace/api-client-react";
import { getPlanLimits, normalizePlanId } from "@/lib/plans";
import { useQueryClient } from "@tanstack/react-query";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { printTableQr, printAllTablesQr } from "@/lib/qrPrinter";

interface TablesManagementProps {
  slug: string;
  restaurantName?: string;
  tagline?: string;
  logoUrl?: string;
}

interface TableWithQr extends Table {
  qrDataUrl?: string;
  destinationUrl: string;
  status?: "AVAILABLE" | "OCCUPIED" | "DEACTIVATED";
  location?: string | null;
  qrToken?: string;
  activeSession?: {
    id: string;
    createdAt: string;
    updatedAt?: string;
  } | null;
  activeOrdersCount?: number;
  sessionDurationMinutes?: number;
}

export function TablesManagement({
  slug,
  restaurantName = "Restaurant",
  tagline,
  logoUrl,
}: TablesManagementProps) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: rawTablesData, isLoading } = useListTables(slug);
  const { data: dashboard } = useGetRestaurantDashboard(slug);
  const rawTables = useMemo(() => (Array.isArray(rawTablesData) ? (rawTablesData as TableWithQr[]) : []), [rawTablesData]);
  const createTable = useCreateTable();
  const updateTable = useUpdateTable();

  const activeTablesCount = rawTables.filter((t) => t.active !== false).length;
  const currentPlan = normalizePlanId((dashboard as any)?.plan || (dashboard as any)?.restaurant?.plan);
  const planLimits = (dashboard as any)?.planLimits || getPlanLimits(currentPlan);
  const maxTables = planLimits.maxTables ?? 5;
  const isAtOrOverLimit = maxTables < 999999 && activeTablesCount >= maxTables;
  const isOverLimit = maxTables < 999999 && activeTablesCount > maxTables;

  const [tablesWithQr, setTablesWithQr] = useState<TableWithQr[]>([]);
  const [newTableNumber, setNewTableNumber] = useState("");
  const [newTableLocation, setNewTableLocation] = useState("");
  const [addingTable, setAddingTable] = useState(false);

  // Table Dialogs
  const [tableToDelete, setTableToDelete] = useState<TableWithQr | null>(null);
  const [deletingTable, setDeletingTable] = useState(false);

  const [tableToRegenerateQr, setTableToRegenerateQr] = useState<TableWithQr | null>(null);
  const [regeneratingQr, setRegeneratingQr] = useState(false);

  const [tableToCloseSession, setTableToCloseSession] = useState<TableWithQr | null>(null);
  const [closingSession, setClosingSession] = useState(false);
  const [settlementPaymentMethod, setSettlementPaymentMethod] = useState<"COUNTER" | "CASH" | "CARD" | "UPI">("COUNTER");

  const [tableToEdit, setTableToEdit] = useState<TableWithQr | null>(null);
  const [editTableNumber, setEditTableNumber] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [updatingTable, setUpdatingTable] = useState(false);

  // Stand preview modal
  const [selectedTableForStand, setSelectedTableForStand] = useState<TableWithQr | null>(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: getListTablesQueryKey(slug) });
    qc.invalidateQueries({ queryKey: getGetRestaurantDashboardQueryKey(slug) });
  };

  const tablesKey = useMemo(() => {
    return rawTables.map((t) => `${t.id}:${t.slug || ""}:${t.tableNumber || ""}:${t.qrToken || ""}:${t.status || ""}:${t.activeOrdersCount || 0}`).join("|");
  }, [rawTables]);

  // Generate QR codes with secure qrToken binding
  useEffect(() => {
    let cancelled = false;
    if (rawTables.length === 0) {
      setTablesWithQr((prev) => (prev.length === 0 ? prev : []));
      return;
    }

    async function generateQrs() {
      const origin = window.location.origin;
      const updated: TableWithQr[] = await Promise.all(
        rawTables.map(async (t) => {
          const destinationUrl = `${origin}/menu/${slug}/table/${t.qrToken || t.slug || t.id}`;
          try {
            const qrDataUrl = await QRCode.toDataURL(destinationUrl, {
              width: 360,
              margin: 2,
              color: {
                dark: "#1c1917", // warm charcoal
                light: "#fdfbf7", // soft cream
              },
            });
            return { ...t, destinationUrl, qrDataUrl };
          } catch {
            return { ...t, destinationUrl };
          }
        })
      );
      if (!cancelled) {
        setTablesWithQr(updated);
      }
    }

    generateQrs();

    return () => {
      cancelled = true;
    };
  }, [tablesKey, slug, rawTables]);

  const handleAddTable = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = newTableNumber.trim();
    if (!num) return;

    setAddingTable(true);
    try {
      await createTable.mutateAsync({
        restaurantSlug: slug,
        data: {
          tableNumber: num,
          location: newTableLocation.trim() || undefined,
          active: true,
        } as any,
      });
      toast({ title: `Table ${num} created` });
      setNewTableNumber("");
      setNewTableLocation("");
      refresh();
    } catch (err: any) {
      const errMsg = err?.data?.error || err?.data?.message || err?.message || "Please check inputs.";
      const isPlanLimit = err?.data?.code === "PLAN_LIMITATION" || errMsg.includes("limit") || errMsg.includes("plan");
      toast({
        variant: "destructive",
        title: isPlanLimit ? "Table Limit Reached" : "Could not create table",
        description: errMsg,
      });
    } finally {
      setAddingTable(false);
    }
  };

  const handleToggleTable = async (table: TableWithQr) => {
    try {
      await updateTable.mutateAsync({
        restaurantSlug: slug,
        tableId: table.id,
        data: { active: !table.active },
      });
      toast({
        title: !table.active ? `${formatTableName(table.tableNumber)} activated` : `${formatTableName(table.tableNumber)} paused`,
      });
      refresh();
    } catch (err: any) {
      const errMsg = err?.data?.error || err?.data?.message || err?.message || "Failed to update table";
      const isPlanLimit = err?.data?.code === "PLAN_LIMITATION" || errMsg.includes("limit") || errMsg.includes("plan");
      toast({
        variant: "destructive",
        title: isPlanLimit ? "Plan Limit Reached" : "Failed to update table",
        description: errMsg,
      });
    }
  };

  const handleOpenEdit = (table: TableWithQr) => {
    setTableToEdit(table);
    setEditTableNumber(String(table.tableNumber || ""));
    setEditLocation(table.location || "");
  };

  const handleEditTableSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tableToEdit) return;
    const num = editTableNumber.trim();
    if (!num) return;

    setUpdatingTable(true);
    try {
      await updateTable.mutateAsync({
        restaurantSlug: slug,
        tableId: tableToEdit.id,
        data: {
          tableNumber: num,
          location: editLocation.trim() || undefined,
        } as any,
      });
      toast({
        title: `Table updated`,
        description: `Table is now "${num}"${editLocation.trim() ? ` · ${editLocation.trim()}` : ""}.`,
      });
      setTableToEdit(null);
      refresh();
    } catch (err: any) {
      const errMsg = err?.data?.error || err?.data?.message || err?.message || "Failed to update table";
      toast({
        variant: "destructive",
        title: "Could not update table",
        description: errMsg,
      });
    } finally {
      setUpdatingTable(false);
    }
  };

  const handleRegenerateQr = async () => {
    if (!tableToRegenerateQr) return;
    setRegeneratingQr(true);
    try {
      const token = await getIdToken();
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`/api/restaurants/${slug}/tables/${tableToRegenerateQr.id}/regenerate-qr`, {
        method: "POST",
        headers,
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || errData.error || "Failed to regenerate QR code");
      }
      toast({
        title: `QR Code regenerated for ${formatTableName(tableToRegenerateQr.tableNumber)}`,
        description: "The previous QR sticker has been invalidated for security.",
      });
      setTableToRegenerateQr(null);
      refresh();
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Could not regenerate QR",
        description: err?.message || "Please try again.",
      });
    } finally {
      setRegeneratingQr(false);
    }
  };

  const handleCloseSession = async () => {
    if (!tableToCloseSession) return;
    setClosingSession(true);
    try {
      const token = await getIdToken();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`/api/restaurants/${slug}/tables/${tableToCloseSession.id}/close-session`, {
        method: "POST",
        headers,
        body: JSON.stringify({ paymentMethod: settlementPaymentMethod }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || errData.error || "Failed to close table session");
      }
      const data = await res.json();
      toast({
        title: `${formatTableName(tableToCloseSession.tableNumber)} Bill Settled (${settlementPaymentMethod})`,
        description: data.settledAmount ? `Settled ₹${data.settledAmount}. Table is now Available.` : "Dining session closed and table is now Available.",
      });
      setTableToCloseSession(null);
      refresh();
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Could not close session",
        description: err?.message || "Please try again.",
      });
    } finally {
      setClosingSession(false);
    }
  };

  const handleDeleteTable = (table: TableWithQr) => {
    setTableToDelete(table);
  };

  const handleConfirmDeleteTable = async () => {
    if (!tableToDelete) return;
    setDeletingTable(true);
    try {
      const token = await getIdToken();
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`/api/restaurants/${slug}/tables/${tableToDelete.id}`, {
        method: "DELETE",
        headers,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || data.error || "Failed to delete table");
      }
      toast({
        title: `${formatTableName(tableToDelete.tableNumber)} removed`,
        description: "Table removed. Historical orders remain intact.",
      });
      setTableToDelete(null);
      refresh();
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Failed to delete table",
        description: err?.message || "Could not remove table. Please try again.",
      });
    } finally {
      setDeletingTable(false);
    }
  };

  const getRestaurantQrMeta = () => ({
    name: restaurantName,
    tagline: tagline || (dashboard as any)?.restaurant?.tagline || "",
    logoUrl: logoUrl || (dashboard as any)?.restaurant?.logoUrl || (dashboard as any)?.restaurant?.logo || "",
  });

  const handlePrintTableQr = (table: TableWithQr) => {
    if (!table.qrDataUrl) return;
    printTableQr(
      {
        id: table.id,
        tableNumber: table.tableNumber,
        location: table.location || undefined,
        qrDataUrl: table.qrDataUrl,
        destinationUrl: table.destinationUrl,
      },
      getRestaurantQrMeta(),
      "acrylic_stand"
    );
  };

  const handleBulkPrintQrs = () => {
    const activeWithQr = tablesWithQr.filter((t) => t.active !== false && Boolean(t.qrDataUrl));
    if (activeWithQr.length === 0) {
      toast({
        title: "No QR codes available",
        description: "Add or activate tables first to print QR stands.",
      });
      return;
    }
    printAllTablesQr(
      activeWithQr.map((t) => ({
        id: t.id,
        tableNumber: t.tableNumber,
        location: t.location || undefined,
        qrDataUrl: t.qrDataUrl!,
        destinationUrl: t.destinationUrl,
      })),
      getRestaurantQrMeta()
    );
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6" id="tables-management">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border/70 pb-5" id="tables-header">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Tables & QR Codes
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Real-time table occupancy, QR stand generation, and dining session management.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {tablesWithQr.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleBulkPrintQrs}
              className="rounded-xl font-semibold gap-1.5 h-9 bg-card border-border hover:bg-secondary text-foreground"
              id="button-bulk-print-qrs"
              title="Print high-resolution table stand cards for all tables"
            >
              <Printer className="h-4 w-4 text-[#c86d51]" />
              <span>Print All Tables (<span className="font-sans tabular-nums">{tablesWithQr.filter((t) => t.active !== false).length}</span>)</span>
            </Button>
          )}

          {/* Add Table Form */}
          <form onSubmit={handleAddTable} className="flex flex-wrap items-center gap-2">
            <Input
              value={newTableNumber}
              onChange={(e) => setNewTableNumber(e.target.value)}
              placeholder="Table # (e.g. 1)"
              className="h-9 w-28 rounded-xl text-xs bg-card"
              id="input-new-table-number"
              disabled={isAtOrOverLimit}
            />
            <Input
              value={newTableLocation}
              onChange={(e) => setNewTableLocation(e.target.value)}
              placeholder="Location (e.g. Patio)"
              className="h-9 w-32 rounded-xl text-xs bg-card"
              id="input-new-table-location"
              disabled={isAtOrOverLimit}
            />
            <Button
              type="submit"
              size="sm"
              disabled={addingTable || !newTableNumber.trim() || isAtOrOverLimit}
              className="rounded-xl font-semibold gap-1.5 h-9"
              id="button-add-table"
            >
              <Plus className="h-4 w-4" />
              {isAtOrOverLimit ? (
                <span>
                  Limit Reached (<span className="font-sans tabular-nums">{activeTablesCount}</span>/<span className="font-sans tabular-nums">{maxTables}</span>)
                </span>
              ) : (
                "Add Table"
              )}
            </Button>
          </form>
        </div>
      </div>

      {/* Plan Limit Banner */}
      {isAtOrOverLimit && (
        <div
          className={`rounded-2xl border p-4 text-xs ${
            isOverLimit
              ? "border-destructive/40 bg-destructive/10 text-destructive dark:border-destructive/60"
              : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
          }`}
          id="banner-over-plan-limit"
        >
          <div className="flex items-center gap-2 font-bold text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span className="capitalize">
              {currentPlan} Plan Limit {isOverLimit ? "Exceeded" : "Reached"}: <span className="font-sans tabular-nums">{activeTablesCount}</span> / <span className="font-sans tabular-nums">{maxTables}</span> active tables
            </span>
          </div>
          <p className="mt-1.5 leading-relaxed">
            Your restaurant is on the <strong className="capitalize">{currentPlan}</strong> plan (limit: <span className="font-sans tabular-nums">{maxTables}</span> tables). Your existing tables are preserved. Deactivate unused tables below or upgrade your plan to create additional tables.
          </p>
        </div>
      )}

      {/* Tables Grid */}
      {isLoading ? (
        <TablelineLoader
          variant="card"
          message="Setting the tables…"
          subtext="Loading floor layout and active table sessions…"
        />
      ) : tablesWithQr.length === 0 ? (
        <div
          className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-border/90 bg-card/60 p-8 text-center"
          id="empty-tables"
        >
          <QrCode className="h-8 w-8 text-muted-foreground/60" />
          <p className="mt-3 font-display text-base font-semibold text-foreground">
            No tables set up yet
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Add Table 1 above to generate its unique ordering QR code.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3" id="tables-grid">
          {tablesWithQr.map((table) => {
            const isActive = table.active ?? true;
            const isOccupied = table.status === "OCCUPIED";

            return (
              <div
                key={table.id}
                className="flex flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-2xs hover:border-border/90 transition-all"
                id={`card-table-${table.id}`}
              >
                <div>
                  {/* Top: Table Title, Location & Status Pills */}
                  <div className="flex items-start justify-between border-b border-border/60 pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-display text-lg font-bold text-foreground">
                          {formatTableName(table.tableNumber)}
                        </h3>
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(table)}
                          className="text-muted-foreground hover:text-foreground p-1 rounded-md transition-colors"
                          title="Edit table number or location"
                          id={`button-edit-table-${table.id}`}
                        >
                          <Edit2 className="h-3 w-3" />
                        </button>
                      </div>
                      {table.location && (
                        <p className="text-xs text-muted-foreground font-medium">
                          {table.location}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-1.5">
                      {/* Active / Inactive switch */}
                      <button
                        type="button"
                        onClick={() => handleToggleTable(table)}
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                          isActive
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20"
                            : "bg-muted text-muted-foreground hover:bg-secondary"
                        }`}
                        id={`button-toggle-table-${table.id}`}
                        title="Click to toggle active status"
                      >
                        {isActive ? "Active" : "Deactivated"}
                      </button>

                      {/* Live Dining State Badge */}
                      {isActive && (
                        <span
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                            isOccupied
                              ? "bg-sky-500/15 text-sky-700 dark:text-sky-400 border border-sky-500/20"
                              : "bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300"
                          }`}
                        >
                          {isOccupied ? (
                            <>
                              <Clock className="h-2.5 w-2.5" />
                              Occupied
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="h-2.5 w-2.5 text-emerald-500" />
                              Available
                            </>
                          )}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Active Dining Session Details (if Occupied) */}
                  {isOccupied && (
                    <div className="my-2.5 rounded-xl border border-sky-200 dark:border-sky-900/60 bg-sky-50/70 dark:bg-sky-950/40 p-2.5 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-semibold text-sky-900 dark:text-sky-200 flex items-center gap-1.5">
                          <span>Dining in progress</span>
                          {table.sessionDurationMinutes !== undefined && (
                            <span className="text-[11px] font-normal opacity-75">
                              · <span className="font-sans tabular-nums">{table.sessionDurationMinutes}</span>m
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-sky-700 dark:text-sky-400">
                          <span className="font-sans tabular-nums">{table.activeOrdersCount || 1}</span> active order{(table.activeOrdersCount || 1) > 1 ? "s" : ""}
                        </div>
                      </div>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setTableToCloseSession(table)}
                        className="h-7 px-2 text-[11px] font-bold border-sky-300 dark:border-sky-800 text-sky-800 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/50"
                        id={`button-close-session-${table.id}`}
                      >
                        <DoorClosed className="h-3 w-3 mr-1" />
                        End Session
                      </Button>
                    </div>
                  )}

                  {/* QR Code Center */}
                  <div className="my-3 flex justify-center">
                    <div className="rounded-xl border border-border/60 bg-[#fdfbf7] p-2.5 shadow-inner">
                      {table.qrDataUrl ? (
                        <img
                          src={table.qrDataUrl}
                          alt={`QR for ${formatTableName(table.tableNumber)}`}
                          className="h-32 w-32 object-contain"
                          id={`img-qr-table-${table.id}`}
                        />
                      ) : (
                        <div className="grid h-32 w-32 place-items-center text-muted-foreground">
                          <QrCode className="h-8 w-8" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Public Link Preview */}
                  <div className="truncate rounded-lg bg-secondary/60 px-2.5 py-1 text-center font-mono text-[10px] text-muted-foreground">
                    <a
                      href={table.destinationUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:underline flex items-center justify-center gap-1"
                      title="Preview table menu in new tab"
                    >
                      <span>Preview Table Menu</span>
                      <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  </div>
                </div>

                {/* Bottom Actions */}
                <div className="mt-3.5 flex items-center justify-between border-t border-border/60 pt-3">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {table.qrDataUrl && (
                      <>
                        <button
                          type="button"
                          onClick={() => setSelectedTableForStand(table)}
                          className="inline-flex items-center gap-1 rounded-lg border border-[#ded4bf] bg-[#faf8f5] dark:bg-stone-900 px-2 py-1 text-xs font-semibold text-[#2c1810] dark:text-stone-200 hover:bg-[#f1e9da] transition-colors"
                          id={`button-preview-stand-${table.id}`}
                          title="Preview premium acrylic stand card"
                        >
                          <QrCode className="h-3 w-3 text-[#c86d51]" />
                          Stand
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePrintTableQr(table)}
                          className="inline-flex items-center gap-1 rounded-lg bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
                          id={`button-print-qr-${table.id}`}
                          title="Print table stand card"
                        >
                          <Printer className="h-3 w-3" />
                          Print
                        </button>
                        <a
                          href={table.qrDataUrl}
                          download={`table-${table.tableNumber}-qr.png`}
                          className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                          id={`button-download-qr-${table.id}`}
                          title="Save high-resolution QR image"
                        >
                          <Download className="h-3 w-3" />
                          Save
                        </a>
                      </>
                    )}

                    <button
                      type="button"
                      onClick={() => setTableToRegenerateQr(table)}
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                      id={`button-regenerate-qr-${table.id}`}
                      title="Regenerate QR token (invalidates previous QR)"
                    >
                      <RotateCw className="h-2.5 w-2.5" />
                      Rotate
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDeleteTable(table)}
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                    id={`button-delete-table-${table.id}`}
                    title="Delete table"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Table Modal */}
      {tableToEdit && (
        <Dialog open={Boolean(tableToEdit)} onOpenChange={(open) => !open && setTableToEdit(null)}>
          <DialogContent className="sm:max-w-md rounded-2xl">
            <DialogHeader>
              <DialogTitle className="font-display text-lg font-bold">
                Edit Table <span className="font-sans tabular-nums">{tableToEdit.tableNumber}</span>
              </DialogTitle>
              <DialogDescription className="text-xs">
                Update the physical table number or location section.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleEditTableSubmit} className="space-y-4 py-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Table Number</label>
                <Input
                  value={editTableNumber}
                  onChange={(e) => setEditTableNumber(e.target.value)}
                  placeholder="e.g. 4 or Patio 2"
                  className="h-9 rounded-xl text-xs"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Location / Section (Optional)</label>
                <Input
                  value={editLocation}
                  onChange={(e) => setEditLocation(e.target.value)}
                  placeholder="e.g. Outdoor Terrace, Rooftop, 1st Floor"
                  className="h-9 rounded-xl text-xs"
                />
              </div>

              <DialogFooter className="gap-2 sm:gap-0 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setTableToEdit(null)}
                  disabled={updatingTable}
                  className="rounded-xl text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={updatingTable || !editTableNumber.trim()}
                  className="rounded-xl text-xs font-semibold"
                >
                  {updatingTable ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Regenerate QR Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(tableToRegenerateQr)}
        onOpenChange={(open) => {
          if (!open && !regeneratingQr) setTableToRegenerateQr(null);
        }}
        title={`Regenerate QR for Table ${tableToRegenerateQr?.tableNumber}?`}
        description="This will issue a new QR code immediately. Any previously printed table stand cards or stickers for this table will stop working to protect against unauthorized orders."
        confirmLabel="Regenerate QR"
        isDestructive={false}
        isLoading={regeneratingQr}
        onConfirm={handleRegenerateQr}
      />

      {/* Settle Bill & Close Session Dialog */}
      <Dialog
        open={Boolean(tableToCloseSession)}
        onOpenChange={(open) => {
          if (!open && !closingSession) setTableToCloseSession(null);
        }}
      >
        <DialogContent className="sm:max-w-md rounded-2xl p-6 bg-card border-border" id="dialog-settle-close-session">
          <DialogHeader>
            <DialogTitle className="font-display text-lg font-bold">
              Settle Bill & Free Table {tableToCloseSession?.tableNumber}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Mark all active orders for Table {tableToCloseSession?.tableNumber} as Paid and make the table Available for incoming guests.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 my-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-2">
                Settlement Payment Method:
              </label>
              <div className="grid grid-cols-4 gap-2">
                {(["COUNTER", "CASH", "CARD", "UPI"] as const).map((method) => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setSettlementPaymentMethod(method)}
                    className={`py-2 px-1 text-xs font-bold rounded-xl border transition-all ${
                      settlementPaymentMethod === method
                        ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 border-transparent shadow-xs"
                        : "bg-background text-foreground border-border hover:bg-secondary"
                    }`}
                    id={`button-settle-method-${method.toLowerCase()}`}
                  >
                    {method}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              ✓ Atomically marks session orders Paid, closes the session, and sets Table {tableToCloseSession?.tableNumber} to Available.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              disabled={closingSession}
              onClick={() => setTableToCloseSession(null)}
              className="rounded-xl text-xs"
            >
              Cancel
            </Button>
            <Button
              disabled={closingSession}
              onClick={handleCloseSession}
              className="rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 shadow-xs"
              id="button-confirm-settle-close"
            >
              {closingSession ? "Settling…" : `Settle (${settlementPaymentMethod}) & Free Table`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Table Delete Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(tableToDelete)}
        onOpenChange={(open) => {
          if (!open && !deletingTable) setTableToDelete(null);
        }}
        title={`Delete Table ${tableToDelete?.tableNumber || ""}?`}
        description="This removes the table from active management. All historical orders associated with this table remain completely preserved in reports and kitchen logs."
        confirmLabel="Delete Table"
        isDestructive={true}
        isLoading={deletingTable}
        onConfirm={handleConfirmDeleteTable}
      />

      {/* Acrylic Table Stand Preview Modal */}
      {selectedTableForStand && (
        <Dialog open={Boolean(selectedTableForStand)} onOpenChange={(open) => !open && setSelectedTableForStand(null)}>
          <DialogContent className="sm:max-w-md rounded-2xl p-6 bg-card border-border">
            <DialogHeader>
              <DialogTitle className="font-display text-lg font-bold flex items-center justify-between">
                <span>Table {selectedTableForStand.tableNumber} Stand Preview</span>
                <span className="text-xs font-mono font-normal text-muted-foreground">Print-Ready</span>
              </DialogTitle>
              <DialogDescription className="text-xs">
                Hospitality-grade acrylic stand and tabletop card design.
              </DialogDescription>
            </DialogHeader>

            {/* Stand Live Rendering */}
            <div className="my-2 flex justify-center">
              <div className="w-[280px] rounded-2xl border-2 border-[#e6decb] bg-[#faf8f5] p-5 text-center shadow-md relative">
                {/* Corner Accents */}
                <div className="absolute top-2.5 left-2.5 w-2.5 h-2.5 border-t-2 border-l-2 border-[#c86d51]/50 rounded-tl-[3px]" />
                <div className="absolute top-2.5 right-2.5 w-2.5 h-2.5 border-t-2 border-r-2 border-[#c86d51]/50 rounded-tr-[3px]" />
                <div className="absolute bottom-2.5 left-2.5 w-2.5 h-2.5 border-b-2 border-l-2 border-[#c86d51]/50 rounded-bl-[3px]" />
                <div className="absolute bottom-2.5 right-2.5 w-2.5 h-2.5 border-b-2 border-r-2 border-[#c86d51]/50 rounded-br-[3px]" />

                {logoUrl && (
                  <img
                    src={logoUrl}
                    alt={restaurantName}
                    className="mx-auto mb-2 max-h-8 max-w-[100px] object-contain"
                  />
                )}
                <h3 className="font-serif text-sm font-bold tracking-wider text-[#1a120b] uppercase">
                  {restaurantName}
                </h3>
                {tagline && (
                  <p className="mt-0.5 text-[10px] font-medium tracking-wide text-[#785942] uppercase">
                    {tagline}
                  </p>
                )}

                <div className="my-2.5 h-[1px] w-3/4 mx-auto bg-[#e6decb]" />

                <div className="inline-flex items-center justify-center rounded-full bg-[#2c1810] px-3.5 py-1 text-white shadow-xs">
                  <span className="text-xs font-extrabold tracking-widest">
                    TABLE {selectedTableForStand.tableNumber}
                  </span>
                </div>

                <div className="my-3 flex justify-center">
                  <div className="rounded-xl border border-[#ded4bf] bg-white p-2 shadow-xs">
                    {selectedTableForStand.qrDataUrl ? (
                      <img
                        src={selectedTableForStand.qrDataUrl}
                        alt={`QR code for Table ${selectedTableForStand.tableNumber}`}
                        className="h-36 w-36 rounded-md"
                      />
                    ) : (
                      <div className="h-36 w-36 flex items-center justify-center bg-stone-100 text-xs text-muted-foreground">
                        No QR Code
                      </div>
                    )}
                  </div>
                </div>

                <div className="text-[11px] font-extrabold tracking-widest text-[#2c1810] uppercase">
                  Scan to Order
                </div>
                <div className="text-[10px] text-[#57463a] mt-0.5">
                  Point phone camera • No app required
                </div>
                {selectedTableForStand.location && (
                  <div className="mt-2 inline-block rounded bg-[#f1e9da] px-2 py-0.5 text-[9px] font-semibold text-[#8b5e3c]">
                    {selectedTableForStand.location}
                  </div>
                )}

                <div className="mt-3 border-t border-[#ece4d7] pt-2 text-[8px] font-semibold tracking-wider text-[#9c8471] uppercase">
                  Powered by Tableline
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2 flex-col sm:flex-row">
              {selectedTableForStand.qrDataUrl && (
                <a
                  href={selectedTableForStand.qrDataUrl}
                  download={`table-${selectedTableForStand.tableNumber}-qr.png`}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-secondary transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                  Save PNG
                </a>
              )}
              <Button
                type="button"
                onClick={() => {
                  handlePrintTableQr(selectedTableForStand);
                }}
                className="rounded-xl font-semibold gap-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
                id="button-print-previewed-stand"
              >
                <Printer className="h-3.5 w-3.5" />
                Print Stand Card
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
