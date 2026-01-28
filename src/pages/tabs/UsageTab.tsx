import React from "react";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

type UsageUser = {
  openId: string;
  name: string;
  username?: string;
};

type UsageEntry = {
  date: string;
  openId: string;
  count: number;
  lastAt?: string;
};

type UsageResponse = {
  dates: string[];
  users: UsageUser[];
  usage: Record<string, Record<string, UsageEntry>>;
};

const formatDateLabel = (value: string) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
};

const GROUP_ORDER = [
  { key: "bd", label: "BD", names: ["邹思敏", "袁晓南", "黄毅"] },
  { key: "am", label: "AM", names: ["张一", "郑铭"] },
  { key: "pm", label: "PM", names: ["刘漫章"] },
  { key: "admin", label: "管理员", names: ["侯昭薇"] },
];

const getGroupKey = (name: string) => {
  const trimmed = String(name || "").trim();
  for (const group of GROUP_ORDER) {
    if (group.names.includes(trimmed)) return group.key;
  }
  return "other";
};

const UsageTab: React.FC = () => {
  const [data, setData] = React.useState<UsageResponse>({ dates: [], users: [], usage: {} });
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const groupedUsers = React.useMemo(() => {
    const groups: Record<string, UsageUser[]> = {};
    data.users.forEach((user) => {
      const key = getGroupKey(user.name || user.username || user.openId);
      if (!groups[key]) groups[key] = [];
      groups[key].push(user);
    });
    return groups;
  }, [data.users]);

  const load = React.useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const res = await fetch("/api/usage/list?days=10", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || `Request failed with status ${res.status}`);
      }
      setData(json?.data || { dates: [], users: [], usage: {} });
    } catch (e: any) {
      setError(e?.message || "加载失败");
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="max-w-6xl mx-auto space-y-6 p-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <span>表单使用记录</span>
          </CardTitle>
          <CardDescription>记录 BD 每日是否提交过表单（最近 10 天）</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground">
              提交成功后自动记录，重复提交会显示次数
            </div>
            <Button variant="outline" size="sm" onClick={load} disabled={isLoading}>
              <RefreshCw className={cn("mr-2 h-4 w-4", isLoading && "animate-spin")} />
              刷新
            </Button>
          </div>

          <div className="rounded-xl border border-border/60 bg-card/70 p-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[160px]">成员</TableHead>
                  {data.dates.map((date) => (
                    <TableHead key={date} className="text-center">
                      {formatDateLabel(date)}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={data.dates.length + 1} className="h-24 text-center text-muted-foreground">
                      正在加载…
                    </TableCell>
                  </TableRow>
                ) : error ? (
                  <TableRow>
                    <TableCell colSpan={data.dates.length + 1} className="h-24 text-center text-destructive">
                      {error}
                    </TableCell>
                  </TableRow>
                ) : data.users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={data.dates.length + 1} className="h-24 text-center text-muted-foreground">
                      暂无记录
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {GROUP_ORDER.map((group) => {
                      const list = groupedUsers[group.key] || [];
                      if (list.length === 0) return null;
                      return (
                        <React.Fragment key={group.key}>
                          <TableRow>
                            <TableCell
                              colSpan={data.dates.length + 1}
                              className="bg-muted/40 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground"
                            >
                              {group.label}
                            </TableCell>
                          </TableRow>
                          {list.map((user) => (
                            <TableRow key={user.openId}>
                              <TableCell className="font-medium">
                                {user.name || user.username || user.openId}
                              </TableCell>
                              {data.dates.map((date) => {
                                const entry = data.usage?.[date]?.[user.openId];
                                return (
                                  <TableCell key={`${user.openId}-${date}`} className="text-center text-sm">
                                    {entry ? (
                                      <span className="inline-flex min-w-[28px] items-center justify-center rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
                                        {entry.count}
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground">—</span>
                                    )}
                                  </TableCell>
                                );
                              })}
                            </TableRow>
                          ))}
                        </React.Fragment>
                      );
                    })}
                    {groupedUsers.other?.length ? (
                      <React.Fragment key="other">
                        <TableRow>
                          <TableCell
                            colSpan={data.dates.length + 1}
                            className="bg-muted/40 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground"
                          >
                            其他
                          </TableCell>
                        </TableRow>
                        {groupedUsers.other.map((user) => (
                          <TableRow key={user.openId}>
                            <TableCell className="font-medium">
                              {user.name || user.username || user.openId}
                            </TableCell>
                            {data.dates.map((date) => {
                              const entry = data.usage?.[date]?.[user.openId];
                              return (
                                <TableCell key={`${user.openId}-${date}`} className="text-center text-sm">
                                  {entry ? (
                                    <span className="inline-flex min-w-[28px] items-center justify-center rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
                                      {entry.count}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        ))}
                      </React.Fragment>
                    ) : null}
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default UsageTab;
