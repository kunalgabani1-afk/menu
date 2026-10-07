import React, { useEffect, useState } from "react";
import { Shield, RefreshCw, Lock, Clock, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getIdToken } from "@/lib/firebase";
import { formatDateTime } from "@/lib/formatters";
import { TablelineLoader } from "./TablelineLoading";

interface AuditLogsViewProps {
  slug: string;
}

export function AuditLogsView({ slug }: AuditLogsViewProps) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAuditLogs = async () => {
    try {
      const token = await getIdToken();
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`/api/restaurants/${slug}/audit-logs`, { headers });
      if (res.ok) {
        const json = await res.json();
        setLogs(Array.isArray(json) ? json : json.logs || []);
      }
    } catch {
      // Graceful fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditLogs();
  }, [slug]);

  if (loading) {
    return (
      <TablelineLoader
        variant="card"
        message="Loading immutable audit trail…"
        subtext="Verifying cryptographic access events and operational logs…"
        onRetry={fetchAuditLogs}
      />
    );
  }

  return (
    <div className="space-y-6" id="audit-logs-view">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border/70 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Security Audit Trail
            </h1>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Immutable operational and access log documenting staff actions, PIN changes, and role modifications.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={fetchAuditLogs}
          className="rounded-xl h-8 text-xs"
        >
          <RefreshCw className="h-3.5 w-3.5 mr-1" />
          Refresh Logs
        </Button>
      </div>

      {logs.length === 0 ? (
        <div className="flex min-h-[200px] flex-col items-center justify-center rounded-2xl border border-dashed border-border p-8 text-center bg-card/40">
          <Lock className="h-8 w-8 text-muted-foreground opacity-60" />
          <p className="mt-2 text-sm font-semibold text-foreground">Audit Trail Initialized</p>
          <p className="text-xs text-muted-foreground">
            All administrative, menu modifications, and security actions will be recorded here in real-time.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-secondary/50 font-semibold text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Actor</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Resource</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 font-mono text-[11px]">
                {logs.map((log, idx) => (
                  <tr key={log.id || idx} className="hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {formatDateTime(log.createdAt, "full")}
                    </td>
                    <td className="px-4 py-3 text-foreground font-sans font-medium whitespace-nowrap">
                      {log.actorEmail || log.actorId || "System"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-md bg-secondary px-2 py-0.5 text-[10px] uppercase font-bold text-foreground">
                        {log.actorRole || "operator"}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-foreground font-sans">
                      {log.action}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground max-w-xs truncate">
                      {log.resourceId || log.details ? JSON.stringify(log.details) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
