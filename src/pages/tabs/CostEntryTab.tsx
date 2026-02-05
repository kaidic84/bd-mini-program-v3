import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Coins } from "lucide-react";

import { dataService } from "@/services/dataService";
import type { CostEntry, Deal, Project } from "@/types/bd";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { cn } from "@/lib/utils";

type PendingCostEntry = {
  localId: string;
  dealKey: string;
  dealId?: string;
  dealRecordId?: string;
  dealSerialNo?: string;
  projectId?: string;
  projectName?: string;
  period: number;
  amount: number;
  remark?: string;
};

const makeLocalId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const formatDateDash = (date: Date) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const parsePositiveNumber = (value: string) => {
  const raw = String(value ?? "").replace(/[,\s¥￥]/g, "").trim();
  if (!raw) return null;
  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0) return null;
  return num;
};

const parseNonNegativeNumber = (value: string) => {
  const raw = String(value ?? "").replace(/[,\s¥￥]/g, "").trim();
  if (raw === "") return null;
  const num = Number(raw);
  if (!Number.isFinite(num) || num < 0) return null;
  return num;
};

const looksLikeRecordId = (value: string) => /^rec[a-z0-9]+/i.test(String(value || "").trim());

const errorRingClass = "border-destructive focus-visible:ring-destructive";
const errorTextClass = "text-xs text-destructive";

const resolveDealProjectName = (deal: Deal, projectNameMap: Map<string, string>) => {
  const direct = String(deal.projectName || "").trim();
  if (direct) return direct;
  const fromProject = projectNameMap.get(String(deal.projectId || "").trim()) || "";
  return String(fromProject || "").trim();
};

export default function CostEntryTab() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedDealKey, setSelectedDealKey] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [remarkInput, setRemarkInput] = useState("");
  const [createdDate] = useState(formatDateDash(new Date()));
  const [isLoading, setIsLoading] = useState(false);
  const [isResolvingPeriod, setIsResolvingPeriod] = useState(false);
  const [existingEntriesMap, setExistingEntriesMap] = useState<Record<string, CostEntry[]>>({});
  const [pendingEntries, setPendingEntries] = useState<PendingCostEntry[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [entryErrors, setEntryErrors] = useState<{ deal?: string; amount?: string }>({});
  const [editDealKey, setEditDealKey] = useState("");
  const [editResults, setEditResults] = useState<CostEntry[]>([]);
  const [editLoading, setEditLoading] = useState(false);
  const [editDrafts, setEditDrafts] = useState<Record<string, { amount: string; remark: string }>>({});
  const [savingEditIds, setSavingEditIds] = useState<Set<string>>(new Set());
  const [editPeriodFilter, setEditPeriodFilter] = useState<string>("all");

  const projectNameMap = useMemo(() => {
    return new Map(projects.map((p) => [String(p.projectId || "").trim(), String(p.projectName || "").trim()]));
  }, [projects]);

  const dealOptionData = useMemo(() => {
    const map = new Map<string, Deal>();
    const options: string[] = [];
    deals.forEach((deal) => {
      const projectName = resolveDealProjectName(deal, projectNameMap);
      const baseName = projectName || `立项 ${String(deal.dealId || deal.recordId || "").trim()}`;
      const serialNo = String(deal.serialNo || "").trim();
      const suffix = serialNo ? ` · ${serialNo}` : "";
      const baseLabel = `${baseName}${suffix}`.trim();
      if (!baseLabel) return;
      let label = baseLabel;
      let index = 2;
      while (map.has(label)) {
        label = `${baseLabel} #${index}`;
        index += 1;
      }
      map.set(label, deal);
      options.push(label);
    });
    return { options, map };
  }, [deals, projectNameMap]);

  const selectedDeal = useMemo(() => {
    return dealOptionData.map.get(selectedDealKey) || null;
  }, [dealOptionData, selectedDealKey]);

  const selectedProjectName = useMemo(() => {
    if (!selectedDeal) return "";
    return resolveDealProjectName(selectedDeal, projectNameMap);
  }, [selectedDeal, projectNameMap]);

  const selectedProjectId = useMemo(() => {
    if (!selectedDeal) return "";
    return String(selectedDeal.projectId || "").trim();
  }, [selectedDeal]);

  const selectedRelationId = useMemo(() => {
    if (!selectedDeal) return "";
    return String(selectedDeal.recordId || selectedDeal.dealId || "").trim();
  }, [selectedDeal]);

  const selectedDealId = useMemo(() => {
    if (!selectedDeal) return "";
    return String(selectedDeal.dealId || "").trim();
  }, [selectedDeal]);

  const selectedDealRecordId = useMemo(() => {
    if (!selectedDeal) return "";
    return String(selectedDeal.recordId || "").trim();
  }, [selectedDeal]);

  const selectedDealSerialNo = useMemo(() => {
    if (!selectedDeal) return "";
    return String(selectedDeal.serialNo || "").trim();
  }, [selectedDeal]);
  const selectedDealPrimaryNo = useMemo(() => {
    if (!selectedDeal) return "";
    return String(selectedDeal.primaryNo || "").trim();
  }, [selectedDeal]);

  const existingEntries = useMemo(() => {
    if (!selectedDealKey) return [];
    return existingEntriesMap[selectedDealKey] || [];
  }, [existingEntriesMap, selectedDealKey]);

  const pendingCountForSelected = useMemo(() => {
    if (!selectedDealKey) return 0;
    return pendingEntries.filter((entry) => entry.dealKey === selectedDealKey).length;
  }, [pendingEntries, selectedDealKey]);

  const basePeriod = useMemo(() => {
    const maxPeriod = (existingEntries || []).reduce((acc, entry) => {
      const raw = Number(entry.period);
      if (Number.isFinite(raw)) return Math.max(acc, raw);
      return acc;
    }, 0);
    return maxPeriod > 0 ? maxPeriod + 1 : 1;
  }, [existingEntries]);

  const currentPeriod = useMemo(() => {
    const next = basePeriod + pendingCountForSelected;
    return String(next > 0 ? next : 1);
  }, [basePeriod, pendingCountForSelected]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [dealsData, projectsData] = await Promise.all([
        dataService.getAllDeals(),
        dataService.getAllProjects(),
      ]);
      setDeals(dealsData || []);
      setProjects(projectsData || []);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "加载立项数据失败");
    } finally {
      setIsLoading(false);
    }
  };

  const isPageBusy = isLoading || isResolvingPeriod || isSubmitting || editLoading;

  const resolveNextPeriod = async () => {
    if (!selectedDeal) {
      return;
    }
    setIsResolvingPeriod(true);
    try {
      const entries = await dataService.getCostEntries({
        relatedDealRecordId: selectedDealRecordId || undefined,
        relatedDealId: selectedDealPrimaryNo || selectedDealId || undefined,
        relatedDealSerialNo: selectedDealSerialNo || undefined,
        fresh: true,
      });
      setExistingEntriesMap((prev) => ({
        ...prev,
        [selectedDealKey]: entries || [],
      }));
      setPendingEntries((prev) => {
        const base = (entries || []).reduce((acc, entry) => {
          const raw = Number(entry.period);
          if (Number.isFinite(raw)) return Math.max(acc, raw);
          return acc;
        }, 0);
        const nextBase = base > 0 ? base + 1 : 1;
        let index = 0;
        return prev.map((entry) => {
          if (entry.dealKey !== selectedDealKey) return entry;
          const updated = { ...entry, period: nextBase + index };
          index += 1;
          return updated;
        });
      });
    } catch (e: any) {
      console.error(e);
      setExistingEntriesMap((prev) => ({ ...prev, [selectedDealKey]: [] }));
      toast.error(e?.message || "获取期数失败");
    } finally {
      setIsResolvingPeriod(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    resolveNextPeriod();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDealKey]);

  useEffect(() => {
    setAmountInput("");
    setRemarkInput("");
    setEntryErrors((prev) => {
      if (!prev.deal) return prev;
      const next = { ...prev };
      delete next.deal;
      return next;
    });
  }, [selectedDealKey]);

  const appendPendingEntry = () => {
    const nextErrors: { deal?: string; amount?: string } = {};
    if (!selectedDeal) nextErrors.deal = "请选择项目名称";
    const periodValue = parsePositiveNumber(currentPeriod);
    if (!periodValue) return toast.error("当前期数异常，请稍后重试");
    const amountValue = parseNonNegativeNumber(amountInput);
    if (amountValue === null) nextErrors.amount = "请输入有效的本期新增金额";
    if (Object.keys(nextErrors).length > 0) {
      setEntryErrors(nextErrors);
      if (nextErrors.deal && !nextErrors.amount) return toast.error("请先选择项目名称");
      if (nextErrors.amount && !nextErrors.deal) return toast.error("请输入有效的本期新增金额");
      return toast.error("请先选择项目名称并输入金额");
    }
    const remarkValue = remarkInput.trim();
    setPendingEntries((prev) => [
      ...prev,
      {
        localId: makeLocalId(),
        dealKey: selectedDealKey,
        dealId: selectedDealId || undefined,
        dealRecordId: selectedDealRecordId || undefined,
        dealSerialNo: selectedDealSerialNo || undefined,
        projectId: selectedProjectId || undefined,
        projectName: selectedProjectName || undefined,
        period: periodValue,
        amount: amountValue,
        remark: remarkValue || undefined,
      },
    ]);
    setAmountInput("");
    setRemarkInput("");
    setEntryErrors({});
  };

  const handleSearchEdit = async () => {
    const deal = dealOptionData.map.get(editDealKey) || null;
    if (!deal) return toast.error("请选择项目名称");
    setEditLoading(true);
    try {
      const entries = await dataService.getCostEntries({
        relatedDealRecordId: String(deal.recordId || "").trim() || undefined,
        relatedDealId: String(deal.primaryNo || deal.dealId || "").trim() || undefined,
        relatedDealSerialNo: String(deal.serialNo || "").trim() || undefined,
        fresh: true,
      });
      setEditResults(entries || []);
      const periods = Array.from(
        new Set(
          (entries || [])
            .map((item) => (item.period != null ? String(item.period) : ""))
            .filter((v) => v)
        )
      ).sort((a, b) => Number(a) - Number(b));
      if (periods.includes("1")) {
        setEditPeriodFilter("1");
      } else if (periods.length > 0) {
        setEditPeriodFilter(periods[0]);
      } else {
        setEditPeriodFilter("1");
      }
      setEditDrafts((prev) => {
        const next = { ...prev };
        (entries || []).forEach((entry) => {
          const id = String(entry.recordId || "");
          if (!id) return;
          if (!next[id]) {
            next[id] = {
              amount: entry.amount != null ? String(entry.amount) : "",
              remark: String(entry.remark || ""),
            };
          }
        });
        return next;
      });
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "查询失败");
    } finally {
      setEditLoading(false);
    }
  };

  useEffect(() => {
    if (!editDealKey) return;
    void handleSearchEdit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editDealKey]);

  const handleSaveEdit = async (entry: CostEntry) => {
    const recordId = String(entry.recordId || "").trim();
    if (!recordId) return;
    const draft = editDrafts[recordId] || { amount: "", remark: "" };
    const amountValue = parseNonNegativeNumber(draft.amount);
    if (amountValue === null) return toast.error("请输入有效的本期新增金额");
    setSavingEditIds((prev) => new Set(prev).add(recordId));
    try {
      const success = await dataService.updateCostEntry(recordId, {
        amount: amountValue,
        remark: draft.remark.trim(),
      });
      if (!success) {
        toast.error("更新失败");
        return;
      }
      toast.success("已更新成本明细");
      await handleSearchEdit();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "更新失败");
    } finally {
      setSavingEditIds((prev) => {
        const next = new Set(prev);
        next.delete(recordId);
        return next;
      });
    }
  };
  const removePendingEntry = (localId: string) => {
    setPendingEntries((prev) => {
      const target = prev.find((entry) => entry.localId === localId);
      const targetDealKey = target?.dealKey || "";
      const filtered = prev.filter((entry) => entry.localId !== localId);
      if (!targetDealKey) return filtered;
      const base = (existingEntriesMap[targetDealKey] || []).reduce((acc, entry) => {
        const raw = Number(entry.period);
        if (Number.isFinite(raw)) return Math.max(acc, raw);
        return acc;
      }, 0);
      const nextBase = base > 0 ? base + 1 : 1;
      let index = 0;
      return filtered.map((entry) => {
        if (entry.dealKey !== targetDealKey) return entry;
        const updated = { ...entry, period: nextBase + index };
        index += 1;
        return updated;
      });
    });
  };

  const handleSubmit = async () => {
    const entriesToSubmit: PendingCostEntry[] = [...pendingEntries];
    if (amountInput.trim()) {
      const nextErrors: { deal?: string; amount?: string } = {};
      if (!selectedDeal) {
        nextErrors.deal = "请选择项目名称";
        setEntryErrors(nextErrors);
        return toast.error("请先选择项目名称");
      }
      if (!selectedDealRecordId && !selectedDealId) return toast.error("该立项缺少ID，无法写入成本");
      const periodValue = parsePositiveNumber(currentPeriod);
      if (!periodValue) return toast.error("当前期数异常，请稍后重试");
      const amountValue = parseNonNegativeNumber(amountInput);
      if (amountValue === null) {
        nextErrors.amount = "请输入有效的本期新增金额";
        setEntryErrors(nextErrors);
        return toast.error("请输入有效的本期新增金额");
      }
      setEntryErrors({});
      entriesToSubmit.push({
        localId: makeLocalId(),
        dealKey: selectedDealKey,
        dealId: selectedDealId || undefined,
        dealRecordId: selectedDealRecordId || undefined,
        dealSerialNo: selectedDealSerialNo || undefined,
        projectId: selectedProjectId || undefined,
        projectName: selectedProjectName || undefined,
        period: periodValue,
        amount: amountValue,
        remark: remarkInput.trim() || undefined,
      });
    }
    if (!selectedDeal && entriesToSubmit.length === 0) {
      setEntryErrors({ deal: "请选择项目名称" });
      return toast.error("请先选择项目名称");
    }
    if (entriesToSubmit.length === 0) {
      setEntryErrors({ amount: "请先填写本期新增金额或添加待提交记录" });
      return toast.error("请先填写本期新增金额或添加待提交记录");
    }
    setEntryErrors({});

    setIsSubmitting(true);
    try {
      const payloads = entriesToSubmit.map((entry) => ({
        relatedDealRecordId: entry.dealRecordId && looksLikeRecordId(entry.dealRecordId) ? entry.dealRecordId : undefined,
        relatedDealId:
          entry.dealRecordId && looksLikeRecordId(entry.dealRecordId)
            ? undefined
            : entry.dealId || undefined,
        relatedDealSerialNo: entry.dealSerialNo || undefined,
        period: entry.period,
        amount: entry.amount,
        remark: entry.remark,
        createdDate,
      }));
      const ok = await dataService.createCostEntriesBatch(payloads);
      if (!ok) throw new Error("批量提交失败");
      toast.success(`成本录入成功，已写回 ${entriesToSubmit.length} 条`);
      setAmountInput("");
      setRemarkInput("");
      setPendingEntries([]);
      const uniqueDealKeys = Array.from(new Set(entriesToSubmit.map((entry) => entry.dealKey).filter(Boolean)));
      await Promise.all(
        uniqueDealKeys.map(async (dealKey) => {
          const deal = dealOptionData.map.get(dealKey);
          if (!deal) return;
          const recordId = String(deal.recordId || "").trim();
          const dealId = String(deal.dealId || "").trim();
          const serialNo = String(deal.serialNo || "").trim();
          const primaryNo = String(deal.primaryNo || "").trim();
          try {
            const entries = await dataService.getCostEntries({
              relatedDealRecordId: recordId || undefined,
              relatedDealId: primaryNo || dealId || undefined,
              relatedDealSerialNo: serialNo || undefined,
              fresh: true,
            });
            setExistingEntriesMap((prev) => ({ ...prev, [dealKey]: entries || [] }));
          } catch (err) {
            console.warn("刷新期数失败:", err);
          }
        })
      );
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "提交失败");
    } finally {
      setIsSubmitting(false);
    }
  };

  const latestPeriod = useMemo(() => {
    const maxPeriod = existingEntries.reduce((acc, entry) => {
      const raw = Number(entry.period);
      if (Number.isFinite(raw)) return Math.max(acc, raw);
      return acc;
    }, 0);
    return maxPeriod || 0;
  }, [existingEntries]);

  return (
    <div className="max-w-4xl mx-auto space-y-6 p-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Coins className="h-5 w-5" />
            成本录入
          </CardTitle>
          <CardDescription>选择立项项目，填写本期新增金额与备注，提交后同步至三方成本明细表。</CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">成本明细填写</CardTitle>
          <CardDescription>
            {isResolvingPeriod
              ? "正在匹配历史期数..."
              : selectedProjectName
                ? `已匹配 ${existingEntries.length} 条记录${latestPeriod ? `，上期期数 ${latestPeriod}` : ""}${pendingEntries.length ? `，待提交 ${pendingEntries.length} 条` : ""}。`
                : "请选择项目名称后自动计算期数。"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label>项目名称 *</Label>
            <SearchableSelect
              options={dealOptionData.options}
              value={selectedDealKey}
              onChange={(value) => {
                setSelectedDealKey(value);
                if (value) {
                  setEntryErrors((prev) => {
                    if (!prev.deal) return prev;
                    const next = { ...prev };
                    delete next.deal;
                    return next;
                  });
                }
              }}
              placeholder={isLoading ? "加载中..." : "搜索项目名称"}
              searchPlaceholder="输入项目名称或项目ID..."
              emptyText="未找到匹配的项目"
              disabled={isPageBusy}
              className={cn(entryErrors.deal && errorRingClass)}
            />
            {entryErrors.deal && <p className={errorTextClass}>{entryErrors.deal}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>项目ID</Label>
              <Input value={selectedProjectId || "-"} disabled />
            </div>
            <div className="space-y-2">
              <Label>创建日期</Label>
              <Input value={createdDate} disabled />
            </div>
            <div className="space-y-2">
              <Label>期数 *</Label>
              <Input value={currentPeriod} disabled />
            </div>
            <div className="space-y-2">
              <Label>本期新增金额 *</Label>
              <Input
                value={amountInput}
                onChange={(e) => {
                  const value = e.target.value;
                  setAmountInput(value);
                  const parsed = parseNonNegativeNumber(value);
                  if (parsed !== null || value.trim() === "") {
                    setEntryErrors((prev) => {
                      if (!prev.amount) return prev;
                      const next = { ...prev };
                      delete next.amount;
                      return next;
                    });
                  }
                }}
                placeholder="例如：¥10,000"
                disabled={isPageBusy}
                className={cn(entryErrors.amount && errorRingClass)}
              />
              {entryErrors.amount && <p className={errorTextClass}>{entryErrors.amount}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label>备注</Label>
            <Textarea
              value={remarkInput}
              onChange={(e) => setRemarkInput(e.target.value)}
              placeholder="补充说明（可选）"
              disabled={isPageBusy}
            />
          </div>

          {pendingEntries.length > 0 && (
            <div className="space-y-2">
              <Label>待提交成本列表</Label>
              <div className="space-y-2">
                {pendingEntries.map((entry, idx) => (
                  <div
                    key={entry.localId}
                    className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        {idx + 1}. {entry.projectName || "未命名项目"} · 期数 {entry.period} · ¥{entry.amount}
                      </div>
                      {entry.projectId && (
                        <div className="text-xs text-muted-foreground truncate">
                          {entry.projectId}
                        </div>
                      )}
                      {entry.remark && (
                        <div className="text-xs text-muted-foreground truncate">
                          {entry.remark}
                        </div>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removePendingEntry(entry.localId)}
                      disabled={isSubmitting}
                    >
                      移除
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={appendPendingEntry}
              disabled={isPageBusy}
            >
              添加更多
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={isPageBusy}
            >
              {isSubmitting ? "提交中..." : "提交成本"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">成本明细修改</CardTitle>
          <CardDescription>搜索项目名称或项目ID，修改已有期数的本期新增金额与备注。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <SearchableSelect
              options={dealOptionData.options}
              value={editDealKey}
              onChange={setEditDealKey}
              placeholder="选择项目名称"
              searchPlaceholder="搜索项目名称或立项编号..."
              emptyText="未找到匹配的项目"
              disabled={isPageBusy}
            />
            <Button type="button" onClick={handleSearchEdit} disabled={editLoading || !editDealKey}>
              {editLoading ? "查询中..." : "查询成本明细"}
            </Button>
          </div>

          {editResults.length === 0 ? (
            <div className="text-sm text-muted-foreground">暂无匹配记录</div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Label className="text-sm text-muted-foreground">选择期数</Label>
                <Select value={editPeriodFilter} onValueChange={setEditPeriodFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="选择期数" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from(
                      new Set(
                        editResults
                          .map((item) => (item.period != null ? String(item.period) : ""))
                          .filter((v) => v)
                      )
                    )
                      .sort((a, b) => Number(a) - Number(b))
                      .map((period) => (
                        <SelectItem key={period} value={period}>
                          {period}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              {editResults
                .filter((entry) => String(entry.period ?? "") === editPeriodFilter)
                .slice(0, 1)
                .map((entry) => {
                const recordId = String(entry.recordId || "");
                const draft = editDrafts[recordId] || { amount: "", remark: "" };
                return (
                  <div key={recordId} className="rounded-md border p-3 space-y-3">
                    <div className="text-sm font-medium">
                      {entry.projectName || "-"} · 期数 {entry.period}
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>本期新增金额</Label>
                        <Input
                          value={draft.amount}
                          onChange={(e) =>
                            setEditDrafts((prev) => ({
                              ...prev,
                              [recordId]: { ...draft, amount: e.target.value },
                            }))
                          }
                          disabled={isPageBusy}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>备注</Label>
                        <Textarea
                          value={draft.remark}
                          onChange={(e) =>
                            setEditDrafts((prev) => ({
                              ...prev,
                              [recordId]: { ...draft, remark: e.target.value },
                            }))
                          }
                          disabled={isPageBusy}
                        />
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        onClick={() => handleSaveEdit(entry)}
                        disabled={isPageBusy || savingEditIds.has(recordId)}
                      >
                        {savingEditIds.has(recordId) ? "保存中..." : "保存修改"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
