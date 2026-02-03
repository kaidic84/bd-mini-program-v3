import React, { useEffect, useMemo, useRef, useState } from "react";
import { feishuApi } from "@/api/feishuApi";
import { dataService } from "@/services/dataService";
import type { Client, Project } from "@/types/bd";

import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

import { Search, Building2, User, MapPin, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { initUserProfileFromWindow, renderUserProfile } from "@/lib/feishuUserProfile";
import { formatDateSafe } from "@/lib/date";

/**
 * ✅ 唯一入口：把后端/飞书返回的“各种字段形态”统一映射为 bd.ts 的 Client
 * 注意：
 * - 单选字段可能是 string 或 { name: string }
 * - 人员字段可能是 [{ name, id }] 或 string
 * - 关联项目字段在你们系统里经常是各种形态，这里做最宽松兼容
 */

function pickSingleName(v: any): string {
  if (!v) return "";
  if (typeof v === "string") return v.trim();
  if (Array.isArray(v)) {
    if (v.length === 0) return "";
    const first = v[0];
    if (typeof first === "string") return first.trim();
    if (typeof first === "object" && first?.name) return String(first.name).trim();
    return String(first ?? "").trim();
  }
  if (typeof v === "object" && v.name) return String(v.name).trim();
  return "";
}

function pickPeopleFirstName(v: any): string {
  if (!v) return "";
  if (typeof v === "string") return v.trim();
  if (Array.isArray(v) && v[0]?.name) return String(v[0].name).trim();
  if (typeof v === "object" && v.name) return String(v.name).trim();
  return "";
}

function pickPeopleFirstOpenId(v: any): string {
  if (!v) return "";
  if (typeof v === "string") return v.trim();
  if (Array.isArray(v) && v[0]?.openId) return String(v[0].openId).trim();
  if (typeof v === "object" && v.openId) return String(v.openId).trim();
  return "";
}

function pickTextArr(v: any): string[] {
  if (!Array.isArray(v) || !v[0]) return [];
  return Array.isArray(v[0]?.text_arr) ? v[0].text_arr : [];
}

function getDateValue(raw?: string): number {
  if (!raw) return 0;
  const str = String(raw).trim();
  if (!str) return 0;
  const num = Number(str);
  if (Number.isFinite(num)) {
    if (str.length >= 13 || num > 1e11) return num;
    if (str.length === 10) return num * 1000;
  }
  const normalized = str.replace(/\//g, "-");
  const parsed = new Date(normalized);
  const t = parsed.getTime();
  return Number.isNaN(t) ? 0 : t;
}

function getYearMonthValue(raw?: string): number {
  if (!raw) return 0;
  const str = String(raw).trim();
  if (!str) return 0;
  const match = str.match(/(\d{4})\D*?(\d{1,2})/);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (Number.isFinite(year) && Number.isFinite(month)) return year * 100 + month;
  }
  const digits = str.replace(/[^\d]/g, "");
  if (digits.length >= 5) {
    const year = Number(digits.slice(0, 4));
    const month = Number(digits.slice(4, 6) || digits.slice(4, 5));
    if (Number.isFinite(year) && Number.isFinite(month)) return year * 100 + month;
  }
  return 0;
}

export function feishuToClient(c: any): Client {
  const fields = c?.fields || c || {};

  const id = c?.record_id || c?.id || fields?.["客户ID"] || "";
  const shortName = fields?.["客户/部门简称"] || fields?.["客户简称"] || c?.shortName || "";
  const companyName = fields?.["企业名称"] || fields?.["公司名称"] || c?.companyName || "";
  const leadMonth = pickSingleName(fields?.["线索月份"]) || pickSingleName(c?.leadMonth) || "";

  const hq = fields?.["公司总部地区"] || c?.hq || c?.hqRegion || "";

  const customerType =
    pickSingleName(fields?.["客户类型"]) ||
    pickSingleName(c?.customerType) ||
    "其他";

  const level =
    pickSingleName(fields?.["客户等级"]) ||
    pickSingleName(c?.level) ||
    "普通";

  const industry =
    pickSingleName(fields?.["行业大类"]) ||
    pickSingleName(c?.industry) ||
    "";

  const cooperationStatus =
    pickSingleName(fields?.["合作状态"]) ||
    pickSingleName(c?.cooperationStatus) ||
    pickSingleName(c?.status) ||
    "";

  const owner =
    pickPeopleFirstName(fields?.["主BD负责人"]) ||
    pickPeopleFirstName(c?.owner) ||
    pickPeopleFirstName(c?.ownerBd) ||
    "";

  const isAnnual = Boolean(fields?.["年框客户"] ?? c?.isAnnual);

  const relatedProjectIds =
    (Array.isArray(c?.relatedProjectIds) ? c.relatedProjectIds : null) ||
    pickTextArr(fields?.["项目日志表"]) ||
    pickTextArr(fields?.["项目进度数据表1-客户ID"]);
  const createdAt =
    c?.createdAt ||
    fields?.createdAt ||
    fields?.["客户信息创建时间"] ||
    fields?.["创建时间"] ||
    fields?.["创建日期"] ||
    "";

  return {
    id: String(id || ""),
    shortName: String(shortName || ""),
    companyName: String(companyName || ""),
    leadMonth: String(leadMonth || ""),
    customerType: String(customerType || "其他"),

    level,
    isAnnual,
    cooperationStatus,
    industry,
    hq,
    owner,
    ownerOpenId: pickPeopleFirstOpenId(fields?.ownerOpenId ?? c?.ownerOpenId) || "",
    relatedProjectIds,
    createdAt: String(createdAt || ""),
    // 兼容字段
    customerId: String(id || ""),
  };
}


type UserProfileNameProps = {
  name: string;
  openId?: string;
  className?: string;
};

const UserProfileName: React.FC<UserProfileNameProps> = ({ name, openId, className }) => {
  const [open, setOpen] = useState(false);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<{ unmount?: () => void } | null>(null);

  useEffect(() => {
    if (!open || !openId || !mountRef.current) return;
    const ready = initUserProfileFromWindow();
    if (!ready) return;
    instanceRef.current = renderUserProfile(openId, mountRef.current);
    return () => {
      instanceRef.current?.unmount?.();
      instanceRef.current = null;
    };
  }, [open, openId]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      instanceRef.current?.unmount?.();
      instanceRef.current = null;
    } else if (!initUserProfileFromWindow()) {
      return;
    }
    setOpen(nextOpen);
  };

  if (!openId) {
    return <span className={className}>{name || "-"}</span>;
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn("text-primary underline underline-offset-2", className)}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {name || "-"}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[360px] p-2">
        <div ref={mountRef} />
      </PopoverContent>
    </Popover>
  );
};

const ClientsTab: React.FC = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [filteredClients, setFilteredClients] = useState<Client[]>([]);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [annualFilter, setAnnualFilter] = useState<string>("all");
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [industryFilter, setIndustryFilter] = useState<string>("all");
  const [bdFilter, setBdFilter] = useState<string>("all");

  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [showProjectDetail, setShowProjectDetail] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ✅ Select.Item 的 value 不能是空字符串：过滤掉空值
  const levelOptions = useMemo(() => {
    const set = new Set<string>();
    clients.forEach((c) => {
      const v = (c.level || "").trim();
      if (v) set.add(v);
    });
    return Array.from(set);
  }, [clients]);

  const industryOptions = useMemo(() => {
    const set = new Set<string>();
    clients.forEach((c) => {
      const v = (c.industry || "").trim();
      if (v) set.add(v);
    });
    return Array.from(set);
  }, [clients]);

  const bdOptions = useMemo(() => {
    const set = new Set<string>();
    clients.forEach((c) => {
      const v = (c.owner || "").trim();
      if (v) set.add(v);
    });
    return Array.from(set);
  }, [clients]);

  useEffect(() => {
    void loadClients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    filterClients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, searchKeyword, annualFilter, levelFilter, industryFilter, bdFilter]);

  const loadClients = async () => {
    try {
      setLoading(true);
      setError(null);

      const [rawList, projectList] = await Promise.all([
        feishuApi.getAllCustomers(),
        dataService.getAllProjects(),
      ]);
      console.log("从后端/飞书获得客户数据：", rawList);

      const mapped: Client[] = rawList.map(feishuToClient);
      setClients(mapped);
      setProjects(projectList || []);
    } catch (e: any) {
      console.error("加载飞书客户失败：", e);
      setError(e?.message || "加载客户数据失败");
      setClients([]);
      setProjects([]);
    } finally {
      setLoading(false);
    }
  };

  const filterClients = () => {
    let result = [...clients];

    if (searchKeyword) {
      const keyword = searchKeyword.toLowerCase();
      result = result.filter(
        (c) =>
          (c.shortName || "").toLowerCase().includes(keyword) ||
          (c.companyName || "").toLowerCase().includes(keyword) ||
          String(c.customerId || c.id || "").toLowerCase().includes(keyword)
      );
    }

    if (annualFilter !== "all") {
      const shouldBeAnnual = annualFilter === "yes";
      result = result.filter((c) => Boolean(c.isAnnual) === shouldBeAnnual);
    }

    if (levelFilter !== "all") {
      result = result.filter((c) => c.level === levelFilter);
    }

    if (industryFilter !== "all") {
      result = result.filter((c) => c.industry === industryFilter);
    }

    if (bdFilter !== "all") {
      result = result.filter((c) => c.owner === bdFilter);
    }

    result.sort((a, b) => {
      const monthDiff = getYearMonthValue(b.leadMonth) - getYearMonthValue(a.leadMonth);
      if (monthDiff !== 0) return monthDiff;
      return getDateValue(b.createdAt) - getDateValue(a.createdAt);
    });
    setFilteredClients(result);
  };

  const handleClientClick = (client: Client) => {
    setSelectedClient(client);
    setShowDetail(true);
  };

  const handleProjectClick = (project: Project) => {
    setSelectedProject(project);
    setShowProjectDetail(true);
  };

  const getLevelBadgeVariant = (level?: string) => {
    switch (level) {
      case "SKA":
        return "default";
      case "战略":
        return "secondary";
      default:
        return "outline";
    }
  };

  const projectsByCustomerId = useMemo(() => {
    const map = new Map<string, Project[]>();
    projects.forEach((p) => {
      const key = String(p.customerId || "").trim();
      if (!key) return;
      const list = map.get(key) || [];
      list.push(p);
      map.set(key, list);
    });
    return map;
  }, [projects]);

  const getRelatedProjects = (client: Client) => {
    const key = String(client.customerId || client.id || "").trim();
    if (!key) return [] as Project[];
    return projectsByCustomerId.get(key) || [];
  };

  const selectedRelatedProjects = selectedClient ? getRelatedProjects(selectedClient) : [];
  const controlClass = "h-[clamp(34px,3.2vw,44px)] text-[clamp(12px,1.1vw,14px)]";
  const triggerClass = `${controlClass} w-auto min-w-[120px] px-3 whitespace-nowrap shrink-0`;
  const triggerWideClass = `${controlClass} w-auto min-w-[140px] px-3 whitespace-nowrap shrink-0`;
  const cardBaseClass =
    "flex h-full min-h-[170px] flex-col justify-center gap-2 px-5 py-5 sm:min-h-[190px] sm:gap-3 sm:px-6 sm:py-6";
  const cardTitleClass = "text-[clamp(14px,1.25vw,17px)] font-medium text-foreground leading-snug";
  const cardSubClass = "text-[clamp(12px,1.05vw,14px)] text-muted-foreground";
  const cardMetaClass = "text-[clamp(11px,1vw,13px)] text-muted-foreground";
  const badgeTextClass = "text-[clamp(10px,0.9vw,12px)]";
  const formatCurrency = (value?: number | string | null) => {
    if (value === undefined || value === null || value === '') return '-';
    const num = Number(value);
    if (!Number.isFinite(num)) return '-';
    const formatted = new Intl.NumberFormat('zh-CN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
    return `¥${formatted}`;
  };

  return (
    <div className="space-y-4">
      {/* 筛选栏 */}
      <Card>
        <CardContent className="flex min-h-[88px] items-center p-4 sm:min-h-[96px] sm:p-5">
          <div className="mx-auto w-full max-w-6xl">
            <div className="flex w-full flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
              <div className="relative w-full min-w-[240px] lg:flex-[1.15] lg:max-w-[560px]">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="搜索客户名称..."
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  className={`${controlClass} pl-9`}
                />
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3 lg:flex-1 lg:justify-end lg:gap-4">
                <Select value={annualFilter} onValueChange={setAnnualFilter}>
                  <SelectTrigger className={triggerClass}>
                    <SelectValue placeholder="是否年框" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">是否年框</SelectItem>
                    <SelectItem value="yes">年框</SelectItem>
                    <SelectItem value="no">非年框</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={levelFilter} onValueChange={setLevelFilter}>
                  <SelectTrigger className={triggerClass}>
                    <SelectValue placeholder="等级" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部等级</SelectItem>
                    {levelOptions.map((lv) => (
                      <SelectItem key={lv} value={lv}>
                        {lv}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={industryFilter} onValueChange={setIndustryFilter}>
                  <SelectTrigger className={triggerWideClass}>
                    <SelectValue placeholder="行业类别" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部行业</SelectItem>
                    {industryOptions.map((i) => (
                      <SelectItem key={i} value={i}>
                        {i}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={bdFilter} onValueChange={setBdFilter}>
                  <SelectTrigger className={triggerWideClass}>
                    <SelectValue placeholder="BD" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部BD</SelectItem>
                    {bdOptions.map((bd) => (
                      <SelectItem key={bd} value={bd}>
                        {bd}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading && (
        <div className="text-sm text-muted-foreground">
          正在从飞书加载客户数据…
        </div>
      )}
      {error && <div className="text-sm text-red-500">加载失败：{error}</div>}

      {/* 客户卡片 */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filteredClients.map((client) => {
          const relatedProjects = getRelatedProjects(client);
          return (
            <Card
              key={client.id}
              className="cursor-pointer transition-all hover:shadow-md hover:border-primary/50"
              onClick={() => handleClientClick(client)}
            >
              <CardContent className={cardBaseClass}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className={cardTitleClass}>
                        {client.shortName || "-"}
                      </h3>
                      <Badge
                        variant={getLevelBadgeVariant(client.level)}
                        className={cn("text-xs", badgeTextClass)}
                      >
                        {client.level || "-"}
                      </Badge>
                    </div>
                    <p className={cardSubClass}>
                      {client.companyName || "-"}
                    </p>
                  </div>

                  {client.isAnnual && (
                    <Badge
                      variant="outline"
                      className={cn("text-xs bg-success/10 text-success border-success/30", badgeTextClass)}
                    >
                      年框
                    </Badge>
                  )}
                </div>

                <div className={cn("mt-2 flex flex-wrap gap-3", cardMetaClass)}>
                  <span className="flex items-center gap-1">
                    <Tag className="h-3 w-3" />
                    {client.industry || "-"}
                  </span>
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {client.hq || "-"}
                  </span>
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    <UserProfileName name={client.owner || "-"} openId={client.ownerOpenId} />
                  </span>
                </div>

                <div className={cn("mt-1 flex items-center justify-between", cardMetaClass)}>
                  <span>关联项目: {relatedProjects.length} 个</span>
                  <span>{client.cooperationStatus || "-"}</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {!loading && !error && filteredClients.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">暂无客户数据</div>
      )}

      {/* 详情弹窗 */}
      <Dialog open={showDetail} onOpenChange={setShowDetail}>
        <DialogContent className="max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              {selectedClient?.shortName || "客户详情"}
            </DialogTitle>
          </DialogHeader>

          {selectedClient && (
            <ScrollArea className="max-h-[calc(90vh-100px)]">
              <div className="space-y-4">
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm">基本信息</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-muted-foreground">客户ID：</span>
                        <span>{selectedClient.id || "-"}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">企业名称：</span>
                        <span>{selectedClient.companyName || "-"}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">客户类型：</span>
                        <span>{selectedClient.customerType || "-"}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">客户等级：</span>
                        <Badge variant={getLevelBadgeVariant(selectedClient.level)}>
                          {selectedClient.level || "-"}
                        </Badge>
                      </div>
                      <div>
                        <span className="text-muted-foreground">状态：</span>
                        <span>{selectedClient.cooperationStatus || "-"}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">行业：</span>
                        <span>{selectedClient.industry || "-"}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">总部地区：</span>
                        <span>{selectedClient.hq || "-"}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">主BD：</span>
                        <span>{selectedClient.owner || "-"}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">年框客户：</span>
                        <span>{selectedClient.isAnnual ? "是" : "否"}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm">
                      关联项目 ({selectedRelatedProjects.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {selectedRelatedProjects.length > 0 ? (
                      <div className="space-y-2">
                        {selectedRelatedProjects.map((p) => (
                          <button
                            type="button"
                            key={p.projectId || p.projectName}
                            className="w-full rounded-lg border p-3 text-left text-sm hover:border-primary/60 hover:bg-muted"
                            onClick={() => handleProjectClick(p)}
                          >
                            <div className="font-medium">
                              {p.projectName || p.projectId || "-"}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              项目ID：{p.projectId || "-"}
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-4 text-muted-foreground text-sm">
                        暂无关联项目
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showProjectDetail} onOpenChange={setShowProjectDetail}>
        <DialogContent className="max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>项目详情</DialogTitle>
          </DialogHeader>
          {selectedProject && (
            <ScrollArea className="max-h-[calc(90vh-100px)]">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">项目ID：</span>
                  <span className="font-mono">{selectedProject.projectId || "-"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">客户ID：</span>
                  <span className="font-mono">{selectedProject.customerId || "-"}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">项目名称：</span>
                  <span>{selectedProject.projectName || "-"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">客户简称：</span>
                  <span>{selectedProject.shortName || "-"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">服务类型：</span>
                  <span>{selectedProject.serviceType || "-"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">项目类别：</span>
                  <span>{selectedProject.projectType || "-"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">项目进度：</span>
                  <span>{selectedProject.stage || "-"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">优先级：</span>
                  <span>{selectedProject.priority || "-"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">所属年月：</span>
                  <span>{selectedProject.month || "-"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">活动&交付名称：</span>
                  <span>{selectedProject.campaignName || "-"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">平台：</span>
                  <span>{selectedProject.platform || selectedProject.deliverableName || "-"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">BD：</span>
                  <span>{selectedProject.bd || "-"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">AM：</span>
                  <span>{selectedProject.am || "-"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">预计金额：</span>
                  <span>{formatCurrency(selectedProject.expectedAmount)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">累计商务时间：</span>
                  <span>{selectedProject.totalBdHours ?? "-"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">最近更新：</span>
                  <span>{formatDateSafe(selectedProject.lastUpdateDate) || "-"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">距上次更新天数：</span>
                  <span>{Number.isFinite(selectedProject.daysSinceUpdate) ? selectedProject.daysSinceUpdate : "-"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">是否已跟进：</span>
                  <span>
                    {selectedProject.isFollowedUp === undefined ? "-" : selectedProject.isFollowedUp ? "是" : "否"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">创建时间：</span>
                  <span>{formatDateSafe(selectedProject.createdAt) || "-"}</span>
                </div>
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClientsTab;
