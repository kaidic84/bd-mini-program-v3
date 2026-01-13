import React, { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CustomerRecord, SyncStatus } from "@/local/db";
import { clearAllForDemo, createCustomer, listCustomers, retrySync } from "@/local/customerService";
import { startSyncLoop } from "@/local/syncWorker";

const statusVariantMap: Record<SyncStatus, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  synced: "default",
  failed: "destructive",
};

const formatTime = (value?: number) => {
  if (!value) return "-";
  const date = new Date(value);
  return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
};

const LocalFirstDemo: React.FC = () => {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);

  const refreshCustomers = async () => {
    const items = await listCustomers();
    setCustomers(items);
  };

  useEffect(() => {
    startSyncLoop();
    void refreshCustomers();
    const interval = window.setInterval(() => {
      void refreshCustomers();
    }, 1500);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    await createCustomer({ name: trimmedName, phone: phone.trim() || undefined });
    setName("");
    setPhone("");
    await refreshCustomers();
  };

  const handleRetry = async () => {
    await retrySync();
    await refreshCustomers();
  };

  const handleClear = async () => {
    await clearAllForDemo();
    await refreshCustomers();
  };

  const summary = useMemo(() => {
    const pending = customers.filter((item) => item.syncStatus === "pending").length;
    const synced = customers.filter((item) => item.syncStatus === "synced").length;
    const failed = customers.filter((item) => item.syncStatus === "failed").length;
    return { pending, synced, failed };
  }, [customers]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Local-first Sync Demo</CardTitle>
          <CardDescription>IndexedDB persistence with async outbox sync.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant={online ? "default" : "destructive"}>{online ? "online" : "offline"}</Badge>
            <span className="text-muted-foreground">
              pending {summary.pending} · synced {summary.synced} · failed {summary.failed}
            </span>
          </div>
          <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
            <div className="space-y-2">
              <Label htmlFor="customer-name">Name</Label>
              <Input
                id="customer-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Acme Corp"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer-phone">Phone</Label>
              <Input
                id="customer-phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" className="w-full md:w-auto">
                Create customer
              </Button>
            </div>
          </form>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={handleRetry}>
              Retry failed
            </Button>
            <Button type="button" variant="ghost" onClick={handleClear}>
              Clear local data
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Customers</CardTitle>
          <CardDescription>Local list refreshes every 1.5s.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {customers.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
              No local customers yet.
            </div>
          ) : (
            customers.map((customer) => (
              <div
                key={customer.id}
                className="flex flex-col gap-2 rounded-2xl border border-border/60 bg-background/30 p-4 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">{customer.name}</span>
                    {customer.phone ? (
                      <span className="text-muted-foreground">{customer.phone}</span>
                    ) : null}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    updated {formatTime(customer.updatedAt)} · server {customer.serverId || "-"}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={statusVariantMap[customer.syncStatus]}>{customer.syncStatus}</Badge>
                  <span className="text-xs text-muted-foreground">retries {customer.retryCount}</span>
                  {customer.errorMsg ? (
                    <span className="text-xs text-destructive">{customer.errorMsg}</span>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default LocalFirstDemo;
