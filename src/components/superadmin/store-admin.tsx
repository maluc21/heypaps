"use client";

/**
 * Panel de superadmin (plan §6.1, §6.2).
 *
 * Muestra metadatos de las tiendas: estado, plan, uso, productos y ultimo
 * acceso. El superadmin suspende, reactiva o cambia el plan; support solo lee.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  adminAuditLog,
  adminListStores,
  adminSetStorePlan,
  adminSetStoreStatus,
  type AdminList,
  type AdminStore,
  type AuditEntry,
} from "@/lib/actions/admin";

const STATUS_LABEL: Record<string, string> = {
  published: "Publicado",
  draft: "Borrador",
  suspended: "Suspendido",
};

export function StoreAdmin({ initial }: { initial: AdminList }) {
  const router = useRouter();
  const [stores, setStores] = useState<AdminStore[]>(initial.stores);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [auditFor, setAuditFor] = useState<AdminStore | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);

  const isSuperadmin = initial.role === "superadmin";

  const refresh = async () => {
    const data = await adminListStores();
    if (data) {
      setStores(data.stores);
    }
    router.refresh();
  };

  const changeStatus = async (store: AdminStore, status: AdminStore["status"]) => {
    setBusyId(store.id);
    const res = await adminSetStoreStatus(store.id, status);
    setBusyId(null);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success(`${store.name}: ${STATUS_LABEL[status]}`);
    await refresh();
  };

  const changePlan = async (store: AdminStore, planCode: string) => {
    if (planCode === store.plan_code) return;
    setBusyId(store.id);
    const res = await adminSetStorePlan(store.id, planCode);
    setBusyId(null);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success(`${store.name}: plan ${planCode}`);
    await refresh();
  };

  const openAudit = async (store: AdminStore) => {
    setAuditFor(store);
    setAudit([]);
    const entries = await adminAuditLog(store.id);
    setAudit(entries);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 pb-16">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Superadmin</h1>
          <p className="text-sm text-muted-foreground">
            {stores.length} tienda(s) · tu rol: {initial.role}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refresh()}>
          Actualizar
        </Button>
      </div>

      {stores.length === 0 ? (
        <p className="rounded-xl border bg-card p-8 text-center text-muted-foreground">
          Todavía no hay tiendas registradas.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left">
                <th className="p-3">Tienda</th>
                <th className="p-3">Estado</th>
                <th className="p-3">Plan</th>
                <th className="p-3 text-right">Productos</th>
                <th className="p-3 text-right">Almacenamiento</th>
                <th className="p-3">Dueño</th>
                <th className="p-3">Último acceso</th>
                <th className="p-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {stores.map((store) => (
                <tr key={store.id} className="border-b">
                  <td className="p-3">
                    <div className="font-medium">{store.name}</div>
                    <div className="text-xs text-muted-foreground">/{store.slug}</div>
                  </td>
                  <td className="p-3">
                    <Badge
                      variant={
                        store.status === "published"
                          ? "default"
                          : store.status === "suspended"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {STATUS_LABEL[store.status]}
                    </Badge>
                  </td>
                  <td className="p-3">
                    {isSuperadmin ? (
                      <select
                        aria-label={`Plan de ${store.name}`}
                        value={store.plan_code}
                        disabled={busyId === store.id}
                        onChange={(e) => void changePlan(store, e.target.value)}
                        className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                      >
                        {initial.plans.map((plan) => (
                          <option key={plan.plan_code} value={plan.plan_code}>
                            {plan.plan_code}
                          </option>
                        ))}
                      </select>
                    ) : (
                      store.plan_code
                    )}
                  </td>
                  <td className="p-3 text-right">
                    {store.products} / {store.max_products}
                  </td>
                  <td className="p-3 text-right">
                    {formatBytes(store.bytes_used)} / {formatBytes(store.max_storage_bytes)}
                  </td>
                  <td className="p-3 text-xs">{store.owner_email ?? "—"}</td>
                  <td className="p-3 text-xs">
                    {store.last_sign_in_at
                      ? new Date(store.last_sign_in_at).toLocaleString("es-HN")
                      : "nunca"}
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void openAudit(store)}
                      >
                        Auditoría
                      </Button>
                      {isSuperadmin ? (
                        <>
                          {store.status === "suspended" ? (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={busyId === store.id}
                              onClick={() => void changeStatus(store, "published")}
                            >
                              Reactivar
                            </Button>
                          ) : (
                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={busyId === store.id}
                              onClick={() => void changeStatus(store, "suspended")}
                            >
                              Suspender
                            </Button>
                          )}
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {auditFor ? (
        <AuditPanel
          store={auditFor}
          entries={audit}
          onClose={() => setAuditFor(null)}
        />
      ) : null}
    </div>
  );
}

function AuditPanel({
  store,
  entries,
  onClose,
}: {
  store: AdminStore;
  entries: AuditEntry[];
  onClose: () => void;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Auditoría · {store.name}</h2>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cerrar
        </Button>
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin movimientos registrados.</p>
      ) : (
        <ul className="space-y-1 text-xs">
          {entries.map((entry) => (
            <li key={entry.id} className="flex gap-2 border-b py-1 last:border-0">
              <span className="w-40 shrink-0 text-muted-foreground">
                {new Date(entry.created_at).toLocaleString("es-HN")}
              </span>
              <span className="w-44 shrink-0 font-medium">{entry.action}</span>
              <span className="min-w-0 flex-1 truncate">
                {entry.actor_email ?? "sistema"}
                {entry.meta && Object.keys(entry.meta).length > 0
                  ? ` · ${JSON.stringify(entry.meta)}`
                  : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
