import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, ChevronRight, ClipboardList, Clock, FolderPlus, Plus, UserPlus } from "lucide-react";

import { dataService } from "@/services/dataService";
import type { Client, Project } from "@/types/bd";
import {
  BD_OPTIONS,
  CLIENT_LEVEL_OPTIONS,
  COOPERATION_STATUS_OPTIONS,
  CUSTOMER_TYPE_OPTIONS,
  INDUSTRY_OPTIONS,
  MONTH_OPTIONS,
  LEAD_MONTH_OPTIONS,
  PROJECT_PRIORITY_OPTIONS,
  PROJECT_PLATFORM_OPTIONS,
  PROJECT_STAGE_OPTIONS,
  PROJECT_TYPE_OPTIONS,
  SERVICE_TYPE_OPTIONS,
} from "@/types/bd";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

type Step = 1 | 2 | 3;

type TimeEntry = { projectId: string; projectName: string; hours: number };

type NewClientDraft = {
  localId: string;
  shortName: string;
  companyName: string;
  leadMonth: string;
  customerType: string;
  level: string;
  industry: string;
  ownerBd: string;
  hq: string;
  isAnnual: boolean;
};

type UpdateClientDraft = NewClientDraft & {
  customerId: string; // ⚠️ 不可变
  cooperationStatus: string;
};

type NewProjectDraft = {
  localId: string;
  customerId: string;
  shortName: string;
  month: string;
  serviceType: string;
  campaignName: string;
  platform: string;
  projectType: string;
  stage: string;
  priority: string;
  expectedAmount: string;
  bd: string;
  am: string;
  totalBdHours: string;
  lastUpdateDate: string; // YYYY/MM/DD
};

type UpdateProjectDraft = NewProjectDraft & { projectId: string }; // ⚠️ 不可变
type NewClientField = "shortName" | "companyName" | "customerType" | "level" | "industry" | "hq";
type ProjectField =
  | "customerId"
  | "month"
  | "serviceType"
  | "campaignName"
  | "platform"
  | "projectType"
  | "stage"
  | "priority"
  | "bd";
type TimeEntryField = "project" | "hours" | "entries";

const makeLocalId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const PROJECT_AM_OPTIONS = ["张一", "邹思敏", "黄毅"] as const;
const BD_USER_NAME_MAP: Record<string, string> = {
  zousimin: "邹思敏",
  yuanxiaonan: "袁晓南",
  huangyi: "黄毅",
};
const REQUEST_CONCURRENCY = 3;
const errorRingClass = "border-destructive focus-visible:ring-destructive";
const errorTextClass = "text-xs text-destructive";

const isBlank = (v: unknown) => !String(v ?? "").trim();
const hasError = <T extends string>(errors: T[], field: T) => errors.includes(field);
const numOrUndef = (v: string) => {
  const s = String(v ?? "").trim();
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
};

const getNewClientErrors = (c: NewClientDraft): NewClientField[] => {
  const errors: NewClientField[] = [];
  if (isBlank(c.shortName)) errors.push("shortName");
  if (isBlank(c.companyName)) errors.push("companyName");
  if (isBlank(c.customerType)) errors.push("customerType");
  if (isBlank(c.level)) errors.push("level");
  if (isBlank(c.industry)) errors.push("industry");
  if (isBlank(c.hq)) errors.push("hq");
  return errors;
};

const getProjectErrors = (p: NewProjectDraft): ProjectField[] => {
  const errors: ProjectField[] = [];
  if (isBlank(p.customerId)) errors.push("customerId");
  if (isBlank(p.month)) errors.push("month");
  if (isBlank(p.serviceType)) errors.push("serviceType");
  if (isBlank(p.campaignName)) errors.push("campaignName");
  if (isBlank(p.platform)) errors.push("platform");
  if (isBlank(p.projectType)) errors.push("projectType");
  if (isBlank(p.stage)) errors.push("stage");
  if (isBlank(p.priority)) errors.push("priority");
  if (isBlank(p.bd)) errors.push("bd");
  return errors;
};

const runWithLimit = async <T,>(items: T[], limit: number, worker: (item: T) => Promise<void>) => {
  const queue = [...items];
  const workers = new Array(Math.min(limit, queue.length)).fill(null).map(async () => {
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) return;
      await worker(next);
    }
  });
  await Promise.all(workers);
};

const formatDateSlash = (date: Date) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd}`;
};
const formatDateDash = (date: Date) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const makeEmptyNewClient = (): NewClientDraft => ({
  localId: makeLocalId(),
  shortName: "",
  companyName: "",
  leadMonth: "",
  customerType: "",
  level: "",
  industry: "",
  ownerBd: "",
  hq: "",
  isAnnual: false,
});

const validateNewClient = (c: NewClientDraft) =>
  !isBlank(c.shortName) &&
  !isBlank(c.companyName) &&
  !isBlank(c.customerType) &&
  !isBlank(c.level) &&
  !isBlank(c.industry) &&
  !isBlank(c.hq);

const isNewClientBlank = (c: NewClientDraft) =>
  isBlank(c.shortName) &&
  isBlank(c.companyName) &&
  isBlank(c.leadMonth) &&
  isBlank(c.customerType) &&
  isBlank(c.level) &&
  isBlank(c.industry) &&
  isBlank(c.ownerBd) &&
  isBlank(c.hq) &&
  !c.isAnnual;

const clientToUpdateDraft = (client: Client): UpdateClientDraft => {
  const customerId = String((client as any).customerId || client.id || "").trim();
  return {
    localId: makeLocalId(),
    customerId,
    shortName: String((client as any).shortName || "").trim(),
    companyName: String((client as any).companyName || "").trim(),
    leadMonth: String((client as any).leadMonth || "").trim(),
    customerType: String((client as any).customerType || "").trim(),
    level: String((client as any).level || (client as any).customerLevel || "").trim(),
    industry: String((client as any).industry || "").trim(),
    ownerBd: String((client as any).ownerBd || (client as any).owner || "").trim(),
    hq: String((client as any).hq || (client as any).hqRegion || "").trim(),
    isAnnual: Boolean((client as any).isAnnual),
    cooperationStatus: String((client as any).cooperationStatus || (client as any).status || "").trim(),
  };
};

const makeEmptyNewProjectDraft = (): NewProjectDraft => {
  const today = new Date();
  return {
    localId: makeLocalId(),
    customerId: "",
    shortName: "",
    month: "",
    serviceType: "",
    campaignName: "",
    platform: "",
    projectType: "",
    stage: "",
    priority: "",
    expectedAmount: "",
    bd: "",
    am: "",
    totalBdHours: "0",
    lastUpdateDate: formatDateSlash(today),
  };
};

const validateNewProject = (p: NewProjectDraft) =>
  !isBlank(p.customerId) &&
  !isBlank(p.month) &&
  !isBlank(p.serviceType) &&
  !isBlank(p.campaignName) &&
  !isBlank(p.platform) &&
  !isBlank(p.projectType) &&
  !isBlank(p.stage) &&
  !isBlank(p.priority) &&
  !isBlank(p.bd);

const isNewProjectBlank = (p: NewProjectDraft) =>
  isBlank(p.customerId) &&
  isBlank(p.month) &&
  isBlank(p.serviceType) &&
  isBlank(p.campaignName) &&
  isBlank(p.platform) &&
  isBlank(p.projectType) &&
  isBlank(p.stage) &&
  isBlank(p.priority) &&
  isBlank(p.bd);

const projectNameFromDraft = (p: Pick<NewProjectDraft, "month" | "shortName" | "campaignName" | "platform">) =>
  `${p.month}-${p.shortName}-${p.campaignName}-${p.platform}`;

const projectToUpdateDraft = (project: Project): UpdateProjectDraft => {
  const today = new Date();
  return {
    localId: makeLocalId(),
    projectId: String((project as any).projectId || "").trim(),
    customerId: String((project as any).customerId || "").trim(),
    shortName: String((project as any).shortName || "").trim(),
    month: String((project as any).month || "").trim(),
    serviceType: String((project as any).serviceType || "").trim(),
    campaignName: String((project as any).campaignName || "").trim(),
    platform: String((project as any).platform || (project as any).deliverableName || "").trim(),
    projectType: String((project as any).projectType || "").trim(),
    stage: String((project as any).stage || "").trim(),
    priority: String((project as any).priority || "").trim(),
    expectedAmount: (project as any).expectedAmount != null ? String((project as any).expectedAmount) : "",
    bd: String((project as any).bd || "").trim(),
    am: String((project as any).am || "").trim(),
    totalBdHours: (project as any).totalBdHours != null ? String((project as any).totalBdHours) : "0",
    lastUpdateDate: String((project as any).lastUpdateDate || "").trim() || formatDateSlash(today),
  };
};


function OptionSelect({
  value,
  onValueChange,
  placeholder,
  options,
  error,
  triggerClassName,
}: {
  value: string;
  onValueChange: (v: string) => void;
  placeholder: string;
  options: readonly string[];
  error?: boolean;
  triggerClassName?: string;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger
        className={cn(triggerClassName, error && errorRingClass)}
        aria-invalid={error}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((x) => (
          <SelectItem key={x} value={x}>
            {x}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SearchList({
  items,
}: {
  items: { key: string; title: string; subtitle?: string; onPick: () => void }[];
}) {
  if (items.length === 0) return null;
  return (
    <div className="mt-2 space-y-1 rounded-md border bg-background p-2">
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          onClick={it.onPick}
          className="w-full text-left rounded px-2 py-1 hover:bg-muted"
        >
          <div className="text-sm font-medium truncate">{it.title}</div>
          {it.subtitle && <div className="text-xs text-muted-foreground truncate">{it.subtitle}</div>}
        </button>
      ))}
    </div>
  );
}

const matchBdName = (value: unknown, expected: string) => {
  const target = String(expected || "").trim();
  if (!target) return true;
  if (Array.isArray(value)) {
    return value.map((v) => String(v || "").trim()).filter(Boolean).includes(target);
  }
  const raw = String(value || "").trim();
  if (!raw) return false;
  if (raw === target) return true;
  const parts = raw.split(/[\s,，、/]+/).map((v) => v.trim()).filter(Boolean);
  return parts.includes(target);
};

export default function DailyFormTab() {
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectPersonOptions, setProjectPersonOptions] = useState<{
    bd: string[];
    am: string[];
  }>({ bd: [], am: [] });
  const [projectPersonIdMap, setProjectPersonIdMap] = useState<Record<string, string>>({});

  const [customerAction, setCustomerAction] = useState<"" | "new" | "update" | "none">("");
  const [hasNewClient, setHasNewClient] = useState("no");
  const [newClientDrafts, setNewClientDrafts] = useState<NewClientDraft[]>([]);
  const [newClientDraft, setNewClientDraft] = useState<NewClientDraft>(makeEmptyNewClient());

  const [hasUpdateClient, setHasUpdateClient] = useState("no");
  const [clientSearchKeyword, setClientSearchKeyword] = useState("");
  const [updateClientDrafts, setUpdateClientDrafts] = useState<UpdateClientDraft[]>([]);
  const [updateClientDraft, setUpdateClientDraft] = useState<UpdateClientDraft | null>(null);

  const [projectAction, setProjectAction] = useState<"" | "new" | "update" | "none">("");
  const [hasNewProject, setHasNewProject] = useState("no");
  const [newProjectCustomerKeyword, setNewProjectCustomerKeyword] = useState("");
  const [newProjectDrafts, setNewProjectDrafts] = useState<NewProjectDraft[]>([]);
  const [newProjectDraft, setNewProjectDraft] = useState<NewProjectDraft>(makeEmptyNewProjectDraft());

  const [hasUpdateProject, setHasUpdateProject] = useState("no");
  const [projectSearchKeyword, setProjectSearchKeyword] = useState("");
  const [updateProjectDrafts, setUpdateProjectDrafts] = useState<UpdateProjectDraft[]>([]);
  const [updateProjectDraft, setUpdateProjectDraft] = useState<UpdateProjectDraft | null>(null);

  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [selectedTimeProjectId, setSelectedTimeProjectId] = useState("");
  const [hoursInput, setHoursInput] = useState("");
  const [newClientErrors, setNewClientErrors] = useState<NewClientField[]>([]);
  const [updateClientErrors, setUpdateClientErrors] = useState<NewClientField[]>([]);
  const [newProjectErrors, setNewProjectErrors] = useState<ProjectField[]>([]);
  const [updateProjectErrors, setUpdateProjectErrors] = useState<ProjectField[]>([]);
  const [timeEntryErrors, setTimeEntryErrors] = useState<TimeEntryField[]>([]);
  const [customerFieldOptions, setCustomerFieldOptions] = useState({
    leadMonths: [...LEAD_MONTH_OPTIONS],
    customerTypes: [...CUSTOMER_TYPE_OPTIONS],
    levels: [...CLIENT_LEVEL_OPTIONS],
    industries: [...INDUSTRY_OPTIONS],
  });
  const [projectFieldOptions, setProjectFieldOptions] = useState({
    months: [...MONTH_OPTIONS],
    serviceTypes: [...SERVICE_TYPE_OPTIONS],
    platforms: [...PROJECT_PLATFORM_OPTIONS],
    projectTypes: [...PROJECT_TYPE_OPTIONS],
    stages: [...PROJECT_STAGE_OPTIONS],
    priorities: [...PROJECT_PRIORITY_OPTIONS],
  });

  const leadMonthOptions = customerFieldOptions.leadMonths;
  const customerTypeOptions = customerFieldOptions.customerTypes;
  const customerLevelOptions = customerFieldOptions.levels;
  const industryOptions = customerFieldOptions.industries;
  const projectMonthOptions = projectFieldOptions.months;
  const serviceTypeOptions = projectFieldOptions.serviceTypes;
  const platformOptions = projectFieldOptions.platforms;
  const projectTypeOptions = projectFieldOptions.projectTypes;
  const projectStageOptions = projectFieldOptions.stages;
  const projectPriorityOptions = projectFieldOptions.priorities;

  const activeBdName = useMemo(() => {
    const username = String(user?.username || "").trim();
    if (username && BD_USER_NAME_MAP[username]) return BD_USER_NAME_MAP[username];
    return String(user?.name || "").trim();
  }, [user?.name, user?.username]);

  const loadData = async () => {
    try {
      const [clientsData, projectsData] = await Promise.all([
        dataService.getAllClients(),
        dataService.getAllProjects(),
      ]);
      setClients(clientsData || []);
      setProjects(projectsData || []);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "加载数据失败");
    }
  };

  const loadProjectPersons = async () => {
    try {
      const res = await fetch("/api/project-persons", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) return;

      const idMap: Record<string, string> = {};
      const bd = (json?.data?.bd || [])
        .map((x: any) => {
          const name = String(x?.name || "").trim();
          const id = String(x?.id || "").trim();
          if (name && id) idMap[name] = id;
          return name;
        })
        .filter(Boolean);
      const customerBd = (json?.data?.customer_bd || [])
        .map((x: any) => {
          const name = String(x?.name || "").trim();
          const id = String(x?.id || "").trim();
          if (name && id) idMap[name] = id;
          return name;
        })
        .filter(Boolean);
      const am = (json?.data?.am || [])
        .map((x: any) => {
          const name = String(x?.name || "").trim();
          const id = String(x?.id || "").trim();
          if (name && id) idMap[name] = id;
          return name;
        })
        .filter(Boolean);

      const bdOptions = Array.from(new Set([...bd, ...customerBd]));
      setProjectPersonOptions({ bd: bdOptions, am });
      setProjectPersonIdMap(idMap);
    } catch (e) {
      console.warn("[DailyFormTab] loadProjectPersons failed:", e);
    }
  };

  useEffect(() => {
    const loadCustomerFieldOptions = async () => {
      const data = await dataService.getCustomerFieldOptions([
        "线索月份",
        "客户类型",
        "客户等级",
        "行业大类",
      ]);
      setCustomerFieldOptions({
        leadMonths: data["线索月份"]?.length ? data["线索月份"] : [...LEAD_MONTH_OPTIONS],
        customerTypes: data["客户类型"]?.length ? data["客户类型"] : [...CUSTOMER_TYPE_OPTIONS],
        levels: data["客户等级"]?.length ? data["客户等级"] : [...CLIENT_LEVEL_OPTIONS],
        industries: data["行业大类"]?.length ? data["行业大类"] : [...INDUSTRY_OPTIONS],
      });
    };
    loadCustomerFieldOptions();
  }, []);

  useEffect(() => {
    const loadProjectFieldOptions = async () => {
      const data = await dataService.getProjectFieldOptions([
        "所属年月",
        "所属月份",
        "服务类型",
        "平台",
        "项目类别",
        "项目进度",
        "优先级",
      ]);
      const monthOptions = data["所属年月"]?.length
        ? data["所属年月"]
        : data["所属月份"]?.length
          ? data["所属月份"]
          : [...MONTH_OPTIONS];
      setProjectFieldOptions({
        months: monthOptions,
        serviceTypes: data["服务类型"]?.length ? data["服务类型"] : [...SERVICE_TYPE_OPTIONS],
        platforms: data["平台"]?.length ? data["平台"] : [...PROJECT_PLATFORM_OPTIONS],
        projectTypes: data["项目类别"]?.length ? data["项目类别"] : [...PROJECT_TYPE_OPTIONS],
        stages: data["项目进度"]?.length ? data["项目进度"] : [...PROJECT_STAGE_OPTIONS],
        priorities: data["优先级"]?.length ? data["优先级"] : [...PROJECT_PRIORITY_OPTIONS],
      });
    };
    loadProjectFieldOptions();
  }, []);

  useEffect(() => {
    loadData();
    loadProjectPersons();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setNewClientErrors([]);
    setUpdateClientErrors([]);
  }, [customerAction]);

  useEffect(() => {
    setNewProjectErrors([]);
    setUpdateProjectErrors([]);
  }, [projectAction]);

  useEffect(() => {
    setTimeEntryErrors([]);
  }, [currentStep]);

  useEffect(() => {
    if (timeEntries.length > 0) {
      setTimeEntryErrors((prev) => prev.filter((field) => field !== "entries"));
    }
  }, [timeEntries.length]);


  const clientSearchResults = useMemo(() => {
    const k = clientSearchKeyword.trim().toLowerCase();
    if (!k) return [];
    const bdName = activeBdName;
    return clients
      .filter(
        (c: any) =>
          String(c?.shortName || "").toLowerCase().includes(k) ||
          String(c?.companyName || "").toLowerCase().includes(k)
      )
      .filter((c: any) =>
        bdName ? matchBdName(c?.ownerBd ?? c?.owner, bdName) : true
      )
      .slice(0, 20);
  }, [activeBdName, clients, clientSearchKeyword]);

  const newClientMatchResults = useMemo(() => {
    const k = newClientDraft.shortName.trim().toLowerCase();
    if (!k) return [];
    return clients
      .filter(
        (c: any) =>
          String(c?.shortName || "").toLowerCase().includes(k) ||
          String(c?.companyName || "").toLowerCase().includes(k)
      )
      .slice(0, 8);
  }, [clients, newClientDraft.shortName]);

  const newProjectCustomerResults = useMemo(() => {
    const k = newProjectCustomerKeyword.trim().toLowerCase();
    if (!k) return [];
    return clients
      .filter(
        (c: any) =>
          String(c?.shortName || "").toLowerCase().includes(k) ||
          String(c?.companyName || "").toLowerCase().includes(k)
      )
      .slice(0, 20);
  }, [clients, newProjectCustomerKeyword]);

  const projectSearchResults = useMemo(() => {
    const k = projectSearchKeyword.trim().toLowerCase();
    if (!k) return [];
    const bdName = activeBdName;
    return projects
      .filter((p: any) => String(p?.projectName || "").toLowerCase().includes(k))
      .filter((p: any) => (bdName ? matchBdName(p?.bd, bdName) : true))
      .slice(0, 20);
  }, [activeBdName, projects, projectSearchKeyword]);

  const timeProjectOptions = useMemo(() => {
    const bdName = activeBdName;
    return projects
      .filter((p: any) => !timeEntries.some((e) => e.projectId === p.projectId))
      .filter((p: any) => (bdName ? matchBdName(p?.bd, bdName) : true));
  }, [activeBdName, projects, timeEntries]);

  const StepIndicator = () => (
    <div className="flex items-center justify-center mb-6">
      {[1, 2, 3].map((step, index) => (
        <React.Fragment key={step}>
          <div
            className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all",
              currentStep >= step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            )}
          >
            {currentStep > step ? <Check className="h-4 w-4" /> : step}
          </div>
          {index < 2 && (
            <div className={cn("w-10 h-0.5 mx-2", currentStep > step ? "bg-primary" : "bg-muted")} />
          )}
        </React.Fragment>
      ))}
    </div>
  );

  const handleAddTimeEntry = () => {
    const nextErrors: TimeEntryField[] = [];
    if (!selectedTimeProjectId) nextErrors.push("project");
    if (!hoursInput) nextErrors.push("hours");
    if (nextErrors.length > 0) {
      setTimeEntryErrors((prev) => Array.from(new Set([...prev.filter((f) => f === "entries"), ...nextErrors])));
      return toast.error("请选择项目并输入时间");
    }
    const hours = parseFloat(hoursInput);
    if (!Number.isFinite(hours) || hours <= 0) {
      setTimeEntryErrors((prev) => Array.from(new Set([...prev.filter((f) => f === "entries"), "hours"])));
      return toast.error("请输入有效的时间（小时）");
    }
    const project = projects.find((p: any) => p.projectId === selectedTimeProjectId) as any;
    if (!project) return;
    if (timeEntries.some((e) => e.projectId === selectedTimeProjectId)) return toast.error("该项目已添加");
    setTimeEntries((prev) => [...prev, { projectId: selectedTimeProjectId, projectName: project.projectName, hours }]);
    setSelectedTimeProjectId("");
    setHoursInput("");
    setTimeEntryErrors((prev) => prev.filter((field) => field !== "project" && field !== "hours"));
  };

  const markDailyUsage = async () => {
    if (!user) return;
    try {
      await fetch("/api/usage/mark", {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          openId: user.openId || "",
          username: user.username,
          name: user.name,
          date: formatDateDash(new Date()),
        }),
      });
    } catch (e) {
      console.warn("[DailyFormTab] mark usage failed:", e);
    }
  };

  const handleSubmit = async () => {
    if (timeEntries.length === 0) {
      setTimeEntryErrors((prev) => Array.from(new Set([...prev, "entries"])));
      return toast.error("请至少添加一个项目的时间记录");
    }
    try {
      const today = formatDateSlash(new Date());
      await runWithLimit(timeEntries, REQUEST_CONCURRENCY, async (entry) => {
        const project = projects.find((p: any) => p.projectId === entry.projectId) as any;
        if (!project) return;
        // 必须先拿到项目已有累计值，再加上本次填写的小时数，避免字符串拼接
        const existingHours = numOrUndef(project.totalBdHours) ?? 0;
        await dataService.updateProject(entry.projectId, {
          totalBdHours: existingHours + entry.hours,
          lastUpdateDate: today,
        } as any);
      });
      await dataService.createDailyForm({
        date: new Date().toISOString().split("T")[0],
        hasNewClient: hasNewClient === "yes",
        hasNewOrUpdateProject: hasNewProject === "yes" || hasUpdateProject === "yes",
        projectEntries: timeEntries.map((e) => ({ projectId: e.projectId, projectName: e.projectName, bdHours: e.hours })),
      } as any);
      await markDailyUsage();
      toast.success("每日表单提交成功");

      setCurrentStep(1);
      setCustomerAction("");
      setHasNewClient("no");
      setHasUpdateClient("no");
      setHasNewProject("no");
      setHasUpdateProject("no");
      setProjectAction("");

      setNewClientDrafts([]);
      setNewClientDraft(makeEmptyNewClient());
      setUpdateClientDrafts([]);
      setUpdateClientDraft(null);
      setClientSearchKeyword("");

      setNewProjectDrafts([]);
      setNewProjectDraft(makeEmptyNewProjectDraft());
      setNewProjectCustomerKeyword("");

      setUpdateProjectDrafts([]);
      setUpdateProjectDraft(null);
      setProjectSearchKeyword("");

      setTimeEntries([]);
      setSelectedTimeProjectId("");
      setHoursInput("");

      await loadData();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "提交失败");
    }
  };

  const handleNext = async () => {
    if (currentStep === 1) {
      if (!customerAction) return toast.error("请先选择新增、更新或无数据变更");
      if (customerAction === "none") {
        setNewClientDrafts([]);
        setNewClientDraft(makeEmptyNewClient());
        setUpdateClientDrafts([]);
        setUpdateClientDraft(null);
        setClientSearchKeyword("");
        setHasNewClient("no");
        setHasUpdateClient("no");
        setCurrentStep(2);
        return;
      }
      const newCandidates = (() => {
        const candidates = [...newClientDrafts];
        const includeCurrent = candidates.length === 0 || !isNewClientBlank(newClientDraft);
        if (includeCurrent) candidates.push(newClientDraft);
        return candidates.filter((c) => !isNewClientBlank(c));
      })();
      const updateCandidates = [...updateClientDrafts, ...(updateClientDraft ? [updateClientDraft] : [])];
      const hasNew = newCandidates.length > 0;
      const hasUpdate = updateCandidates.length > 0;

      if (!hasNew && !hasUpdate) return toast.error("请至少新增或更新 1 个客户");

      if (hasNew) {
        for (let i = 0; i < newCandidates.length; i += 1) {
          if (!validateNewClient(newCandidates[i])) {
            if (newCandidates[i].localId === newClientDraft.localId) {
              setNewClientErrors(getNewClientErrors(newClientDraft));
            }
            return toast.error(`第 ${i + 1} 个客户信息未填完整（带 * 的必填）`);
          }
        }
        try {
          await runWithLimit(newCandidates, REQUEST_CONCURRENCY, async (c) => {
            await dataService.createClient({
              shortName: c.shortName.trim(),
              companyName: c.companyName.trim(),
              leadMonth: c.leadMonth.trim(),
              customerType: c.customerType.trim(),
              level: c.level.trim(),
              cooperationStatus: "潜在",
              industry: c.industry.trim(),
              hq: c.hq.trim(),
              isAnnual: Boolean(c.isAnnual),
              ownerBd: c.ownerBd.trim(),
              relatedProjectIds: [],
            } as any);
          });
          toast.success(`客户创建成功（已写回飞书）：${newCandidates.length} 个`);
          setNewClientDrafts([]);
          setNewClientDraft(makeEmptyNewClient());
          setNewClientErrors([]);
        } catch (e: any) {
          console.error(e);
          return toast.error(e?.message || "创建客户失败");
        }
      }
      if (hasUpdate) {
        for (let i = 0; i < updateCandidates.length; i += 1) {
          const c = updateCandidates[i];
          if (isBlank(c.customerId) || !validateNewClient(c)) {
            if (updateClientDraft && c.localId === updateClientDraft.localId) {
              setUpdateClientErrors(getNewClientErrors(updateClientDraft));
            }
            return toast.error(`第 ${i + 1} 个客户信息未填完整（带 * 的必填）`);
          }
        }
        try {
          await runWithLimit(updateCandidates, REQUEST_CONCURRENCY, async (c) => {
            const { customerId, ...patch } = c;
            const ownerUserId = projectPersonIdMap[String(c.ownerBd || "").trim()];
            const payload = ownerUserId
              ? { ...patch, cooperationStatus: c.cooperationStatus, ownerUserId }
              : { ...patch, cooperationStatus: c.cooperationStatus };
            await dataService.updateClient(customerId, payload as any);
          });
          toast.success(`客户更新成功（已写回飞书）：${updateCandidates.length} 个`);
          setUpdateClientDrafts([]);
          setUpdateClientDraft(null);
          setClientSearchKeyword("");
          setUpdateClientErrors([]);
        } catch (e: any) {
          console.error(e);
          return toast.error(e?.message || "更新客户失败");
        }
      }
      if (hasNew || hasUpdate) {
        setHasNewClient(hasNew ? "yes" : "no");
        setHasUpdateClient(hasUpdate ? "yes" : "no");
        await loadData();
      }
      setCurrentStep(2);
      return;
    }

    if (currentStep === 2) {
      if (!projectAction) return toast.error("请先选择新增、更新或无项目变更");
      if (projectAction === "none") {
        setNewProjectCustomerKeyword("");
        setNewProjectDrafts([]);
        setNewProjectDraft(makeEmptyNewProjectDraft());
        setProjectSearchKeyword("");
        setUpdateProjectDrafts([]);
        setUpdateProjectDraft(null);
        setHasNewProject("no");
        setHasUpdateProject("no");
        setCurrentStep(3);
        return;
      }

      const newCandidates = (() => {
        const candidates = [...newProjectDrafts];
        const includeCurrent =
          candidates.length === 0 ||
          !isNewProjectBlank(newProjectDraft) ||
          String(newProjectDraft.projectType || "").trim() === "签单";
        if (includeCurrent) candidates.push(newProjectDraft);
        return candidates.filter((p) => !isNewProjectBlank(p));
      })();
      const updateCandidates = [...updateProjectDrafts, ...(updateProjectDraft ? [updateProjectDraft] : [])];
      const hasNew = newCandidates.length > 0;
      const hasUpdate = updateCandidates.length > 0;

      if (!hasNew && !hasUpdate) return toast.error("请至少新增或更新 1 条项目");

      if (hasNew) {
        for (let i = 0; i < newCandidates.length; i += 1) {
          if (!validateNewProject(newCandidates[i])) {
            if (newCandidates[i].localId === newProjectDraft.localId) {
              setNewProjectErrors(getProjectErrors(newProjectDraft));
            }
            return toast.error(`第 ${i + 1} 条项目必填项未填完整（带 * 的必填）`);
          }
        }
        try {
          await runWithLimit(newCandidates, REQUEST_CONCURRENCY, async (p) => {
            const bdId = projectPersonIdMap[String(p.bd || "").trim()];
            const amId = projectPersonIdMap[String(p.am || "").trim()];
            const bdValue = bdId ? ({ id: bdId } as any) : p.bd;
            const amValue = amId ? ({ id: amId } as any) : (p.am || undefined);
            await dataService.createProject({
              customerId: p.customerId,
              shortName: p.shortName,
              projectName: projectNameFromDraft(p),
              month: p.month,
              serviceType: p.serviceType,
              campaignName: p.campaignName,
              platform: p.platform,
              projectType: p.projectType as any,
              stage: p.stage as any,
              priority: p.priority as any,
              expectedAmount: numOrUndef(p.expectedAmount),
              bd: bdValue,
              am: amValue,
              totalBdHours: numOrUndef(p.totalBdHours) ?? 0,
              lastUpdateDate: p.lastUpdateDate,
            } as any);
          });
          toast.success(`项目创建成功（已写回飞书）：${newCandidates.length} 条`);
          setNewProjectDrafts([]);
          setNewProjectDraft(makeEmptyNewProjectDraft());
          setNewProjectCustomerKeyword("");
          setNewProjectErrors([]);
        } catch (e: any) {
          console.error(e);
          return toast.error(e?.message || "创建项目失败");
        }
      }

      if (hasUpdate) {
        for (let i = 0; i < updateCandidates.length; i += 1) {
          const p = updateCandidates[i];
          if (isBlank(p.projectId) || !validateNewProject(p)) {
            if (updateProjectDraft && p.localId === updateProjectDraft.localId) {
              setUpdateProjectErrors(getProjectErrors(updateProjectDraft));
            }
            return toast.error(`第 ${i + 1} 条项目必填项未填完整（带 * 的必填）`);
          }
        }
        try {
          await runWithLimit(updateCandidates, REQUEST_CONCURRENCY, async (p) => {
            const bdId = projectPersonIdMap[String(p.bd || "").trim()];
            const amId = projectPersonIdMap[String(p.am || "").trim()];
            const bdValue = bdId ? ({ id: bdId } as any) : p.bd;
            const amValue = amId ? ({ id: amId } as any) : (p.am || undefined);
            await dataService.updateProject(p.projectId, {
              projectName: projectNameFromDraft(p),
              customerId: p.customerId,
              shortName: p.shortName,
              month: p.month,
              serviceType: p.serviceType,
              campaignName: p.campaignName,
              platform: p.platform,
              projectType: p.projectType as any,
              stage: p.stage as any,
              priority: p.priority as any,
              expectedAmount: numOrUndef(p.expectedAmount),
              bd: bdValue,
              am: amValue,
              totalBdHours: numOrUndef(p.totalBdHours) ?? 0,
              lastUpdateDate: p.lastUpdateDate,
            } as any);
          });
          toast.success(`项目更新成功（已写回飞书）：${updateCandidates.length} 条`);
          setUpdateProjectDrafts([]);
          setUpdateProjectDraft(null);
          setProjectSearchKeyword("");
          setUpdateProjectErrors([]);
        } catch (e: any) {
          console.error(e);
          return toast.error(e?.message || "更新项目失败");
        }
      }

      if (hasNew || hasUpdate) {
        setHasNewProject(hasNew ? "yes" : "no");
        setHasUpdateProject(hasUpdate ? "yes" : "no");
        await loadData();
      }
      setCurrentStep(3);
      return;
    }

  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 p-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ClipboardList className="h-5 w-5" />
            每日表单
          </CardTitle>
          <CardDescription>系统将在每个工作日 18:00 向 BD 发送每日表单填写提醒通知</CardDescription>
          <CardDescription>录入新增/更新客户、项目与项目商务时间，提交后自动同步飞书数据表</CardDescription>
        </CardHeader>
      </Card>
      <StepIndicator />

      {currentStep === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" /> 步骤 1：是否新增/更新客户数据？
            </CardTitle>
            <CardDescription>选择新增、更新客户后，填写对应字段。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <RadioGroup value={customerAction} onValueChange={setCustomerAction} className="flex gap-6">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="new" id="s1-new" />
                <Label htmlFor="s1-new">新增客户</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="update" id="s1-update" />
                <Label htmlFor="s1-update">更新客户</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="none" id="s1-none" />
                <Label htmlFor="s1-none">无数据变更</Label>
              </div>
            </RadioGroup>

            {customerAction === "new" && (
              <div className="space-y-4 pt-4 border-t">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>客户/部门简称 *</Label>
                    <Input
                      value={newClientDraft.shortName}
                      onChange={(e) => {
                        const value = e.target.value;
                        setNewClientDraft({ ...newClientDraft, shortName: value });
                        if (!isBlank(value)) {
                          setNewClientErrors((prev) => prev.filter((field) => field !== "shortName"));
                        }
                      }}
                      className={cn(hasError(newClientErrors, "shortName") && errorRingClass)}
                    />
                    {hasError(newClientErrors, "shortName") && <p className={errorTextClass}>必填项</p>}
                    <SearchList
                      items={newClientMatchResults.map((c: any) => {
                        const id = String(c?.customerId || c?.id || "").trim();
                        const shortName = String(c?.shortName || "-");
                        const companyName = String(c?.companyName || "").trim();
                        const subtitle = companyName
                          ? `${companyName}${id ? ` · ID: ${id}` : ""}`
                          : id
                            ? `ID: ${id}`
                            : undefined;
                        return {
                          key: id || shortName,
                          title: shortName,
                          subtitle,
                          onPick: () => toast.error("该客户已存在，如需修改请切换到“更新客户”"),
                        };
                      })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>企业名称 *</Label>
                    <Input
                      value={newClientDraft.companyName}
                      onChange={(e) => {
                        const value = e.target.value;
                        setNewClientDraft({ ...newClientDraft, companyName: value });
                        if (!isBlank(value)) {
                          setNewClientErrors((prev) => prev.filter((field) => field !== "companyName"));
                        }
                      }}
                      className={cn(hasError(newClientErrors, "companyName") && errorRingClass)}
                    />
                    {hasError(newClientErrors, "companyName") && <p className={errorTextClass}>必填项</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>线索月份</Label>
                    <OptionSelect
                      value={newClientDraft.leadMonth}
                      onValueChange={(v) => setNewClientDraft({ ...newClientDraft, leadMonth: v })}
                      placeholder="选择线索月份"
                      options={leadMonthOptions}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>客户类型 *</Label>
                    <OptionSelect
                      value={newClientDraft.customerType}
                      onValueChange={(v) => {
                        setNewClientDraft({ ...newClientDraft, customerType: v });
                        if (!isBlank(v)) {
                          setNewClientErrors((prev) => prev.filter((field) => field !== "customerType"));
                        }
                      }}
                      placeholder="选择客户类型"
                      options={customerTypeOptions}
                      error={hasError(newClientErrors, "customerType")}
                    />
                    {hasError(newClientErrors, "customerType") && <p className={errorTextClass}>必填项</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>客户等级 *</Label>
                    <OptionSelect
                      value={newClientDraft.level}
                      onValueChange={(v) => {
                        setNewClientDraft({ ...newClientDraft, level: v });
                        if (!isBlank(v)) {
                          setNewClientErrors((prev) => prev.filter((field) => field !== "level"));
                        }
                      }}
                      placeholder="选择等级"
                      options={customerLevelOptions}
                      error={hasError(newClientErrors, "level")}
                    />
                    {hasError(newClientErrors, "level") && <p className={errorTextClass}>必填项</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>行业 *</Label>
                    <OptionSelect
                      value={newClientDraft.industry}
                      onValueChange={(v) => {
                        setNewClientDraft({ ...newClientDraft, industry: v });
                        if (!isBlank(v)) {
                          setNewClientErrors((prev) => prev.filter((field) => field !== "industry"));
                        }
                      }}
                      placeholder="选择行业"
                      options={industryOptions}
                      error={hasError(newClientErrors, "industry")}
                    />
                    {hasError(newClientErrors, "industry") && <p className={errorTextClass}>必填项</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>主AI策略</Label>
                    <OptionSelect value={newClientDraft.ownerBd} onValueChange={(v) => setNewClientDraft({ ...newClientDraft, ownerBd: v })} placeholder="选择BD" options={BD_OPTIONS} />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label>公司地区 *</Label>
                    <Input
                      value={newClientDraft.hq}
                      onChange={(e) => {
                        const value = e.target.value;
                        setNewClientDraft({ ...newClientDraft, hq: value });
                        if (!isBlank(value)) {
                          setNewClientErrors((prev) => prev.filter((field) => field !== "hq"));
                        }
                      }}
                      placeholder="中国深圳/中国上海/新加坡"
                      className={cn(hasError(newClientErrors, "hq") && errorRingClass)}
                    />
                    {hasError(newClientErrors, "hq") && <p className={errorTextClass}>必填项</p>}
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <div className="flex items-center gap-2">
                      <input id="isAnnualNew" type="checkbox" checked={newClientDraft.isAnnual} onChange={(e) => setNewClientDraft({ ...newClientDraft, isAnnual: e.target.checked })} />
                      <Label htmlFor="isAnnualNew">年框客户</Label>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm text-muted-foreground">已添加 {newClientDrafts.length} 个新增客户</div>
                  <Button type="button" variant="outline" size="sm" onClick={() => {
                    const errors = getNewClientErrors(newClientDraft);
                    if (errors.length > 0) {
                      setNewClientErrors(errors);
                      return toast.error("请把当前客户必填项填写完整后再添加下一条（带 * 的必填）");
                    }
                    setNewClientDrafts((prev) => [...prev, newClientDraft]);
                    setNewClientDraft(makeEmptyNewClient());
                    setNewClientErrors([]);
                  }}>
                    <Plus className="mr-1 h-4 w-4" /> 添加更多客户
                  </Button>
                </div>

                {newClientDrafts.length > 0 && (
                  <div className="space-y-2">
                    <Label>待写回客户列表</Label>
                    {newClientDrafts.map((c, idx) => (
                      <div key={c.localId} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{idx + 1}. {c.shortName || "-"}</div>
                          <div className="text-xs text-muted-foreground truncate">{c.companyName || "-"}</div>
                        </div>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setNewClientDrafts((prev) => prev.filter((x) => x.localId !== c.localId))}>移除</Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {customerAction === "update" && (
              <div className="space-y-4 pt-4 border-t">
                <div className="space-y-2">
                  <Label>搜索客户</Label>
                  <Input
                    value={clientSearchKeyword}
                    onChange={(e) => setClientSearchKeyword(e.target.value)}
                    placeholder="输入客户简称/企业名称"
                  />
                  <SearchList
                    items={clientSearchResults.map((c: any) => ({
                      key: String(c.customerId || c.id),
                      title: String(c.shortName || "-"),
                      subtitle: `${String(c.companyName || "-")} · ID: ${String(c.customerId || c.id)}`,
                      onPick: () => {
                        const draft = clientToUpdateDraft(c);
                        if (!draft.customerId) return toast.error("该客户缺少 customerId，无法更新");
                        if (
                          updateClientDrafts.some((x) => x.customerId === draft.customerId) ||
                          updateClientDraft?.customerId === draft.customerId
                        ) {
                          return toast.error("该客户已在待更新列表中");
                        }
                        setUpdateClientDraft(draft);
                        setClientSearchKeyword("");
                      },
                    }))}
                  />
                </div>

                {updateClientDrafts.length > 0 && (
                  <div className="space-y-2">
                    <Label>待更新客户列表</Label>
                    {updateClientDrafts.map((c, idx) => (
                      <div key={c.localId} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">
                            {idx + 1}. {c.shortName || "-"}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">ID: {c.customerId}</div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setUpdateClientDrafts((prev) => prev.filter((x) => x.localId !== c.localId))}
                        >
                          移除
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {updateClientDraft && (
                  <div className="space-y-4 rounded-lg border p-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2 sm:col-span-2">
                        <Label>客户ID（不可修改）</Label>
                        <Input value={updateClientDraft.customerId} disabled />
                      </div>
                      <div className="space-y-2">
                        <Label>客户/部门简称 *</Label>
                        <Input
                          value={updateClientDraft.shortName}
                          onChange={(e) => {
                            const value = e.target.value;
                            setUpdateClientDraft({ ...updateClientDraft, shortName: value });
                            if (!isBlank(value)) {
                              setUpdateClientErrors((prev) => prev.filter((field) => field !== "shortName"));
                            }
                          }}
                          className={cn(hasError(updateClientErrors, "shortName") && errorRingClass)}
                        />
                        {hasError(updateClientErrors, "shortName") && <p className={errorTextClass}>必填项</p>}
                      </div>
                      <div className="space-y-2">
                        <Label>企业名称 *</Label>
                        <Input
                          value={updateClientDraft.companyName}
                          onChange={(e) => {
                            const value = e.target.value;
                            setUpdateClientDraft({ ...updateClientDraft, companyName: value });
                            if (!isBlank(value)) {
                              setUpdateClientErrors((prev) => prev.filter((field) => field !== "companyName"));
                            }
                          }}
                          className={cn(hasError(updateClientErrors, "companyName") && errorRingClass)}
                        />
                        {hasError(updateClientErrors, "companyName") && <p className={errorTextClass}>必填项</p>}
                      </div>
                      <div className="space-y-2">
                        <Label>线索月份</Label>
                        <OptionSelect
                          value={updateClientDraft.leadMonth}
                          onValueChange={(v) => setUpdateClientDraft({ ...updateClientDraft, leadMonth: v })}
                          placeholder="选择线索月份"
                          options={leadMonthOptions}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>客户类型 *</Label>
                        <OptionSelect
                          value={updateClientDraft.customerType}
                          onValueChange={(v) => {
                            setUpdateClientDraft({ ...updateClientDraft, customerType: v });
                            if (!isBlank(v)) {
                              setUpdateClientErrors((prev) => prev.filter((field) => field !== "customerType"));
                            }
                          }}
                          placeholder="选择客户类型"
                          options={customerTypeOptions}
                          error={hasError(updateClientErrors, "customerType")}
                        />
                        {hasError(updateClientErrors, "customerType") && <p className={errorTextClass}>必填项</p>}
                      </div>
                      <div className="space-y-2">
                        <Label>客户等级 *</Label>
                        <OptionSelect
                          value={updateClientDraft.level}
                          onValueChange={(v) => {
                            setUpdateClientDraft({ ...updateClientDraft, level: v });
                            if (!isBlank(v)) {
                              setUpdateClientErrors((prev) => prev.filter((field) => field !== "level"));
                            }
                          }}
                          placeholder="选择等级"
                          options={customerLevelOptions}
                          error={hasError(updateClientErrors, "level")}
                        />
                        {hasError(updateClientErrors, "level") && <p className={errorTextClass}>必填项</p>}
                      </div>
                      <div className="space-y-2">
                        <Label>合作状态</Label>
                        <OptionSelect
                          value={updateClientDraft.cooperationStatus}
                          onValueChange={(v) =>
                            setUpdateClientDraft({ ...updateClientDraft, cooperationStatus: v })
                          }
                          placeholder="选择合作状态"
                          options={COOPERATION_STATUS_OPTIONS}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>行业 *</Label>
                        <OptionSelect
                          value={updateClientDraft.industry}
                          onValueChange={(v) => {
                            setUpdateClientDraft({ ...updateClientDraft, industry: v });
                            if (!isBlank(v)) {
                              setUpdateClientErrors((prev) => prev.filter((field) => field !== "industry"));
                            }
                          }}
                          placeholder="选择行业"
                          options={industryOptions}
                          error={hasError(updateClientErrors, "industry")}
                        />
                        {hasError(updateClientErrors, "industry") && <p className={errorTextClass}>必填项</p>}
                      </div>
                      <div className="space-y-2">
                        <Label>主AI策略</Label>
                        <OptionSelect
                          value={updateClientDraft.ownerBd}
                          onValueChange={(v) => setUpdateClientDraft({ ...updateClientDraft, ownerBd: v })}
                          placeholder="选择BD"
                          options={BD_OPTIONS}
                        />
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label>公司地区 *</Label>
                        <Input
                          value={updateClientDraft.hq}
                          onChange={(e) => {
                            const value = e.target.value;
                            setUpdateClientDraft({ ...updateClientDraft, hq: value });
                            if (!isBlank(value)) {
                              setUpdateClientErrors((prev) => prev.filter((field) => field !== "hq"));
                            }
                          }}
                          placeholder="中国深圳/中国上海/新加坡"
                          className={cn(hasError(updateClientErrors, "hq") && errorRingClass)}
                        />
                        {hasError(updateClientErrors, "hq") && <p className={errorTextClass}>必填项</p>}
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <div className="flex items-center gap-2">
                          <input
                            id="isAnnualUpdate"
                            type="checkbox"
                            checked={updateClientDraft.isAnnual}
                            onChange={(e) =>
                              setUpdateClientDraft({ ...updateClientDraft, isAnnual: e.target.checked })
                            }
                          />
                          <Label htmlFor="isAnnualUpdate">年框客户</Label>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm text-muted-foreground">
                        已添加 {updateClientDrafts.length} 个待更新客户
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (!updateClientDraft) return;
                          const errors = getNewClientErrors(updateClientDraft);
                          if (errors.length > 0 || isBlank(updateClientDraft.customerId)) {
                            setUpdateClientErrors(errors);
                            return toast.error("请把当前客户必填项填写完整后再添加下一条（带 * 的必填）");
                          }
                          if (updateClientDrafts.some((x) => x.customerId === updateClientDraft.customerId)) {
                            return toast.error("该客户已在待更新列表中");
                          }
                          setUpdateClientDrafts((prev) => [...prev, updateClientDraft]);
                          setUpdateClientDraft(null);
                          setUpdateClientErrors([]);
                        }}
                      >
                        <Plus className="mr-1 h-4 w-4" /> 更新更多客户
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end pt-4">
              <Button onClick={handleNext}>下一步 <ChevronRight className="ml-1 h-4 w-4" /></Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2 */}
      {currentStep === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderPlus className="h-5 w-5" /> 步骤 2：今天是否有新增/更新项目？
            </CardTitle>
            <CardDescription>选择新增、更新项目后，填写对应字段。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <RadioGroup value={projectAction} onValueChange={setProjectAction} className="flex gap-6">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="new" id="s2-new" />
                <Label htmlFor="s2-new">新增项目</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="update" id="s2-update" />
                <Label htmlFor="s2-update">更新项目</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="none" id="s2-none" />
                <Label htmlFor="s2-none">无项目变更</Label>
              </div>
            </RadioGroup>

            {projectAction === "new" && (
              <div className="space-y-4 pt-4 border-t">
                <div className="space-y-2">
                  <Label>搜索客户（自动补全）*</Label>
                  <Input
                    value={newProjectCustomerKeyword}
                    onChange={(e) => setNewProjectCustomerKeyword(e.target.value)}
                    placeholder="输入客户简称/企业名称"
                    className={cn(hasError(newProjectErrors, "customerId") && errorRingClass)}
                  />
                  {hasError(newProjectErrors, "customerId") && <p className={errorTextClass}>请选择客户</p>}
                  <SearchList
                    items={newProjectCustomerResults.map((c: any) => ({
                      key: String(c.customerId || c.id),
                      title: String(c.shortName || "-"),
                      subtitle: `ID: ${String(c.customerId || c.id)}`,
                      onPick: () => {
                        setNewProjectDraft((prev) => ({
                          ...prev,
                          customerId: String(c.customerId || c.id).trim(),
                          shortName: String(c.shortName || "").trim(),
                        }));
                        setNewProjectCustomerKeyword("");
                        setNewProjectErrors((prev) => prev.filter((field) => field !== "customerId"));
                      },
                    }))}
                  />
                </div>

                {!isBlank(newProjectDraft.customerId) && (
                  <div className="rounded-md border px-3 py-2 text-sm">
                    已选择客户：<span className="font-medium">{newProjectDraft.shortName || "-"}</span>{" "}
                    <span className="text-muted-foreground">（ID: {newProjectDraft.customerId}）</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>所属月份 *</Label>
                    <OptionSelect
                      value={newProjectDraft.month}
                      onValueChange={(v) => {
                        setNewProjectDraft({ ...newProjectDraft, month: v });
                        if (!isBlank(v)) {
                          setNewProjectErrors((prev) => prev.filter((field) => field !== "month"));
                        }
                      }}
                      placeholder="选择月份"
                      options={projectMonthOptions}
                      error={hasError(newProjectErrors, "month")}
                    />
                    {hasError(newProjectErrors, "month") && <p className={errorTextClass}>必填项</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>服务类型 *</Label>
                    <OptionSelect
                      value={newProjectDraft.serviceType}
                      onValueChange={(v) => {
                        setNewProjectDraft({ ...newProjectDraft, serviceType: v });
                        if (!isBlank(v)) {
                          setNewProjectErrors((prev) => prev.filter((field) => field !== "serviceType"));
                        }
                      }}
                      placeholder="选择服务类型"
                      options={serviceTypeOptions}
                      error={hasError(newProjectErrors, "serviceType")}
                    />
                    {hasError(newProjectErrors, "serviceType") && <p className={errorTextClass}>必填项</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>活动&交付名称 *</Label>
                    <Input
                      value={newProjectDraft.campaignName}
                      onChange={(e) => {
                        const value = e.target.value;
                        setNewProjectDraft({ ...newProjectDraft, campaignName: value });
                        if (!isBlank(value)) {
                          setNewProjectErrors((prev) => prev.filter((field) => field !== "campaignName"));
                        }
                      }}
                      className={cn(hasError(newProjectErrors, "campaignName") && errorRingClass)}
                    />
                    {hasError(newProjectErrors, "campaignName") && <p className={errorTextClass}>必填项</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>平台 *</Label>
                    <OptionSelect
                      value={newProjectDraft.platform}
                      onValueChange={(v) => {
                        setNewProjectDraft({ ...newProjectDraft, platform: v });
                        if (!isBlank(v)) {
                          setNewProjectErrors((prev) => prev.filter((field) => field !== "platform"));
                        }
                      }}
                      placeholder="选择平台"
                      options={platformOptions}
                      error={hasError(newProjectErrors, "platform")}
                    />
                    {hasError(newProjectErrors, "platform") && <p className={errorTextClass}>必填项</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>项目类别 *</Label>
                    <OptionSelect
                      value={newProjectDraft.projectType}
                      onValueChange={(v) => {
                        setNewProjectDraft({ ...newProjectDraft, projectType: v });
                        if (!isBlank(v)) {
                          setNewProjectErrors((prev) => prev.filter((field) => field !== "projectType"));
                        }
                      }}
                      placeholder="选择类别"
                      options={projectTypeOptions}
                      error={hasError(newProjectErrors, "projectType")}
                    />
                    {hasError(newProjectErrors, "projectType") && <p className={errorTextClass}>必填项</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>项目进度 *</Label>
                    <OptionSelect
                      value={newProjectDraft.stage}
                      onValueChange={(v) => {
                        setNewProjectDraft({ ...newProjectDraft, stage: v });
                        if (!isBlank(v)) {
                          setNewProjectErrors((prev) => prev.filter((field) => field !== "stage"));
                        }
                      }}
                      placeholder="选择进度"
                      options={projectStageOptions}
                      error={hasError(newProjectErrors, "stage")}
                    />
                    {hasError(newProjectErrors, "stage") && <p className={errorTextClass}>必填项</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>优先级 *</Label>
                    <OptionSelect
                      value={newProjectDraft.priority}
                      onValueChange={(v) => {
                        setNewProjectDraft({ ...newProjectDraft, priority: v });
                        if (!isBlank(v)) {
                          setNewProjectErrors((prev) => prev.filter((field) => field !== "priority"));
                        }
                      }}
                      placeholder="选择优先级"
                      options={projectPriorityOptions}
                      error={hasError(newProjectErrors, "priority")}
                    />
                    {hasError(newProjectErrors, "priority") && <p className={errorTextClass}>必填项</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>预估项目金额</Label>
                    <Input
                      type="number"
                      value={newProjectDraft.expectedAmount}
                      onChange={(e) => setNewProjectDraft({ ...newProjectDraft, expectedAmount: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>BD *</Label>
                    <OptionSelect
                      value={newProjectDraft.bd}
                      onValueChange={(v) => {
                        setNewProjectDraft({ ...newProjectDraft, bd: v });
                        if (!isBlank(v)) {
                          setNewProjectErrors((prev) => prev.filter((field) => field !== "bd"));
                        }
                      }}
                      placeholder="选择BD"
                      options={
                        projectPersonOptions.bd.length > 0
                          ? projectPersonOptions.bd
                          : BD_OPTIONS
                      }
                      error={hasError(newProjectErrors, "bd")}
                    />
                    {hasError(newProjectErrors, "bd") && <p className={errorTextClass}>必填项</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>AM</Label>
                    <OptionSelect
                      value={newProjectDraft.am}
                      onValueChange={(v) => setNewProjectDraft({ ...newProjectDraft, am: v })}
                      placeholder="选择AM（可选）"
                      options={PROJECT_AM_OPTIONS}
                    />
                  </div>
                </div>

                {!isBlank(newProjectDraft.month) &&
                  !isBlank(newProjectDraft.shortName) &&
                  !isBlank(newProjectDraft.campaignName) &&
                  !isBlank(newProjectDraft.platform) && (
                    <div className="p-3 bg-muted rounded-lg text-sm">
                      <span className="text-muted-foreground">项目名称预览：</span>
                      <span className="font-medium">{projectNameFromDraft(newProjectDraft)}</span>
                    </div>
                  )}

                {newProjectDrafts.length > 0 && (
                  <div className="text-sm text-muted-foreground">已添加 {newProjectDrafts.length} 条新增项目</div>
                )}

                {newProjectDrafts.length > 0 && (
                  <div className="space-y-2">
                    <Label>待写回项目列表</Label>
                    {newProjectDrafts.map((p, idx) => (
                      <div key={p.localId} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{idx + 1}. {projectNameFromDraft(p)}</div>
                          <div className="text-xs text-muted-foreground truncate">客户ID: {p.customerId}</div>
                        </div>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setNewProjectDrafts((prev) => prev.filter((x) => x.localId !== p.localId))}>
                          移除
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {projectAction === "update" && (
              <div className="space-y-4 pt-4 border-t">
                <div className="space-y-2">
                  <Label>搜索项目</Label>
                  <Input
                    value={projectSearchKeyword}
                    onChange={(e) => setProjectSearchKeyword(e.target.value)}
                    placeholder="输入项目名称关键字"
                  />
                  <SearchList
                    items={projectSearchResults.map((p: any) => ({
                      key: String(p.projectId),
                      title: String(p.projectName || "-"),
                      subtitle: `项目ID: ${String(p.projectId)}`,
                      onPick: () => {
                        const draft = projectToUpdateDraft(p);
                        if (!draft.projectId) return toast.error("该项目缺少 projectId，无法更新");
                        if (
                          updateProjectDrafts.some((x) => x.projectId === draft.projectId) ||
                          updateProjectDraft?.projectId === draft.projectId
                        ) {
                          return toast.error("该项目已在待更新列表中");
                        }
                        setUpdateProjectDraft(draft);
                        setProjectSearchKeyword("");
                      },
                    }))}
                  />
                </div>

                {updateProjectDraft && (
                  <div className="space-y-4 rounded-lg border p-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2 sm:col-span-2">
                        <Label>项目ID（不可修改）</Label>
                        <Input value={updateProjectDraft.projectId} disabled />
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label>客户ID（不可修改）</Label>
                        <Input
                          value={updateProjectDraft.customerId}
                          disabled
                          className={cn(hasError(updateProjectErrors, "customerId") && errorRingClass)}
                        />
                        {hasError(updateProjectErrors, "customerId") && <p className={errorTextClass}>必填项</p>}
                      </div>
                      <div className="space-y-2">
                        <Label>所属月份 *</Label>
                        <OptionSelect
                          value={updateProjectDraft.month}
                          onValueChange={(v) => {
                            setUpdateProjectDraft({ ...updateProjectDraft, month: v });
                            if (!isBlank(v)) {
                              setUpdateProjectErrors((prev) => prev.filter((field) => field !== "month"));
                            }
                          }}
                          placeholder="选择月份"
                          options={projectMonthOptions}
                          error={hasError(updateProjectErrors, "month")}
                        />
                        {hasError(updateProjectErrors, "month") && <p className={errorTextClass}>必填项</p>}
                      </div>
                      <div className="space-y-2">
                        <Label>服务类型 *</Label>
                        <OptionSelect
                          value={updateProjectDraft.serviceType}
                          onValueChange={(v) => {
                            setUpdateProjectDraft({ ...updateProjectDraft, serviceType: v });
                            if (!isBlank(v)) {
                              setUpdateProjectErrors((prev) => prev.filter((field) => field !== "serviceType"));
                            }
                          }}
                          placeholder="选择服务类型"
                          options={serviceTypeOptions}
                          error={hasError(updateProjectErrors, "serviceType")}
                        />
                        {hasError(updateProjectErrors, "serviceType") && <p className={errorTextClass}>必填项</p>}
                      </div>
                      <div className="space-y-2">
                        <Label>活动&交付名称 *</Label>
                        <Input
                          value={updateProjectDraft.campaignName}
                          onChange={(e) => {
                            const value = e.target.value;
                            setUpdateProjectDraft({ ...updateProjectDraft, campaignName: value });
                            if (!isBlank(value)) {
                              setUpdateProjectErrors((prev) => prev.filter((field) => field !== "campaignName"));
                            }
                          }}
                          className={cn(hasError(updateProjectErrors, "campaignName") && errorRingClass)}
                        />
                        {hasError(updateProjectErrors, "campaignName") && <p className={errorTextClass}>必填项</p>}
                      </div>
                      <div className="space-y-2">
                        <Label>平台 *</Label>
                        <OptionSelect
                          value={updateProjectDraft.platform}
                          onValueChange={(v) => {
                            setUpdateProjectDraft({ ...updateProjectDraft, platform: v });
                            if (!isBlank(v)) {
                              setUpdateProjectErrors((prev) => prev.filter((field) => field !== "platform"));
                            }
                          }}
                          placeholder="选择平台"
                          options={platformOptions}
                          error={hasError(updateProjectErrors, "platform")}
                        />
                        {hasError(updateProjectErrors, "platform") && <p className={errorTextClass}>必填项</p>}
                      </div>
                      <div className="space-y-2">
                        <Label>项目类别 *</Label>
                        <OptionSelect
                          value={updateProjectDraft.projectType}
                          onValueChange={(v) => {
                            setUpdateProjectDraft({ ...updateProjectDraft, projectType: v });
                            if (!isBlank(v)) {
                              setUpdateProjectErrors((prev) => prev.filter((field) => field !== "projectType"));
                            }
                          }}
                          placeholder="选择类别"
                          options={projectTypeOptions}
                          error={hasError(updateProjectErrors, "projectType")}
                        />
                        {hasError(updateProjectErrors, "projectType") && <p className={errorTextClass}>必填项</p>}
                      </div>
                      <div className="space-y-2">
                        <Label>项目进度 *</Label>
                        <OptionSelect
                          value={updateProjectDraft.stage}
                          onValueChange={(v) => {
                            setUpdateProjectDraft({ ...updateProjectDraft, stage: v });
                            if (!isBlank(v)) {
                              setUpdateProjectErrors((prev) => prev.filter((field) => field !== "stage"));
                            }
                          }}
                          placeholder="选择进度"
                          options={projectStageOptions}
                          error={hasError(updateProjectErrors, "stage")}
                        />
                        {hasError(updateProjectErrors, "stage") && <p className={errorTextClass}>必填项</p>}
                      </div>
                      <div className="space-y-2">
                        <Label>优先级 *</Label>
                        <OptionSelect
                          value={updateProjectDraft.priority}
                          onValueChange={(v) => {
                            setUpdateProjectDraft({ ...updateProjectDraft, priority: v });
                            if (!isBlank(v)) {
                              setUpdateProjectErrors((prev) => prev.filter((field) => field !== "priority"));
                            }
                          }}
                          placeholder="选择优先级"
                          options={projectPriorityOptions}
                          error={hasError(updateProjectErrors, "priority")}
                        />
                        {hasError(updateProjectErrors, "priority") && <p className={errorTextClass}>必填项</p>}
                      </div>
                      <div className="space-y-2">
                        <Label>预估项目金额</Label>
                        <Input type="number" value={updateProjectDraft.expectedAmount} onChange={(e) => setUpdateProjectDraft({ ...updateProjectDraft, expectedAmount: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>BD *</Label>
                        <OptionSelect
                          value={updateProjectDraft.bd}
                          onValueChange={(v) => {
                            setUpdateProjectDraft({ ...updateProjectDraft, bd: v });
                            if (!isBlank(v)) {
                              setUpdateProjectErrors((prev) => prev.filter((field) => field !== "bd"));
                            }
                          }}
                          placeholder="选择BD"
                          options={
                            projectPersonOptions.bd.length > 0
                              ? projectPersonOptions.bd
                              : BD_OPTIONS
                          }
                          error={hasError(updateProjectErrors, "bd")}
                        />
                        {hasError(updateProjectErrors, "bd") && <p className={errorTextClass}>必填项</p>}
                      </div>
                      <div className="space-y-2">
                        <Label>AM</Label>
                        <OptionSelect
                          value={updateProjectDraft.am}
                          onValueChange={(v) =>
                            setUpdateProjectDraft({ ...updateProjectDraft, am: v })
                          }
                          placeholder="选择AM（可选）"
                          options={PROJECT_AM_OPTIONS}
                        />
                      </div>
                    </div>

                    <div className="p-3 bg-muted rounded-lg text-sm">
                      <span className="text-muted-foreground">项目名称预览：</span>
                      <span className="font-medium">{projectNameFromDraft(updateProjectDraft)}</span>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm text-muted-foreground">已添加 {updateProjectDrafts.length} 条待更新项目</div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (!updateProjectDraft) return;
                          const errors = getProjectErrors(updateProjectDraft);
                          if (errors.length > 0 || isBlank(updateProjectDraft.projectId)) {
                            setUpdateProjectErrors(errors);
                            return toast.error("请把当前项目必填项填写完整后再添加下一条（带 * 的必填）");
                          }
                          if (updateProjectDrafts.some((x) => x.projectId === updateProjectDraft.projectId)) {
                            return toast.error("该项目已在待更新列表中");
                          }
                          setUpdateProjectDrafts((prev) => [...prev, updateProjectDraft]);
                          setUpdateProjectDraft(null);
                          setUpdateProjectErrors([]);
                        }}
                      >
                        <Plus className="mr-1 h-4 w-4" /> 更新更多项目
                      </Button>
                    </div>
                  </div>
                )}

                {updateProjectDrafts.length > 0 && (
                  <div className="space-y-2">
                    <Label>待更新项目列表</Label>
                    {updateProjectDrafts.map((p, idx) => (
                      <div key={p.localId} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{idx + 1}. {projectNameFromDraft(p)}</div>
                          <div className="text-xs text-muted-foreground truncate">项目ID: {p.projectId}</div>
                        </div>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setUpdateProjectDrafts((prev) => prev.filter((x) => x.localId !== p.localId))}>
                          删除
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {projectAction === "new" && (
              <div className="flex items-center justify-between gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const errors = getProjectErrors(newProjectDraft);
                    if (errors.length > 0) {
                      setNewProjectErrors(errors);
                      return toast.error("请把当前项目必填项填写完整后再添加下一条（带 * 的必填）");
                    }
                    setNewProjectDrafts((prev) => [...prev, newProjectDraft]);
                    setNewProjectDraft(makeEmptyNewProjectDraft());
                    setNewProjectErrors([]);
                  }}
                >
                  <Plus className="mr-1 h-4 w-4" /> 新增更多项目
                </Button>
              </div>
            )}

            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => setCurrentStep(1)}>
                上一步
              </Button>
              <Button onClick={handleNext}>
                下一步 <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {currentStep === 3 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5" /> 步骤 3：今日商务时间</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2 items-start">
              <div className="flex-1 space-y-1">
                <Select
                  value={selectedTimeProjectId}
                  onValueChange={(v) => {
                    setSelectedTimeProjectId(v);
                    if (v) {
                      setTimeEntryErrors((prev) => prev.filter((field) => field !== "project"));
                    }
                  }}
                >
                  <SelectTrigger className={cn("flex-1", hasError(timeEntryErrors, "project") && errorRingClass)}>
                    <SelectValue placeholder="选择项目" />
                  </SelectTrigger>
                  <SelectContent>
                    {timeProjectOptions.map((p: any) => (
                      <SelectItem key={String(p.projectId)} value={String(p.projectId)}>{String(p.projectName || p.projectId)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {hasError(timeEntryErrors, "project") && <p className={errorTextClass}>请选择项目</p>}
              </div>
              <div className="w-24 space-y-1">
                <Input
                  type="number"
                  placeholder="小时"
                  value={hoursInput}
                  onChange={(e) => {
                    const value = e.target.value;
                    setHoursInput(value);
                    const hours = parseFloat(value);
                    if (value && Number.isFinite(hours) && hours > 0) {
                      setTimeEntryErrors((prev) => prev.filter((field) => field !== "hours"));
                    }
                  }}
                  className={cn(hasError(timeEntryErrors, "hours") && errorRingClass)}
                  step="0.5"
                  min="0"
                />
                {hasError(timeEntryErrors, "hours") && <p className={errorTextClass}>请输入有效时间</p>}
              </div>
              <Button onClick={handleAddTimeEntry} size="icon" type="button"><Plus className="h-4 w-4" /></Button>
            </div>

            {timeEntries.length > 0 && (
              <div className="space-y-2">
                {timeEntries.map((entry) => (
                  <div key={entry.projectId} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div className="flex-1 min-w-0"><div className="font-medium text-sm truncate">{entry.projectName}</div></div>
                    <div className="flex items-center gap-2 ml-2">
                      <span className="text-sm font-medium">{entry.hours}h</span>
                      <Button variant="ghost" size="sm" type="button" onClick={() => setTimeEntries((prev) => prev.filter((x) => x.projectId !== entry.projectId))} className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive">×</Button>
                    </div>
                  </div>
                ))}
                <div className="flex justify-end text-sm text-muted-foreground">总计：{timeEntries.reduce((sum, e) => sum + e.hours, 0)} 小时</div>
              </div>
            )}
            {hasError(timeEntryErrors, "entries") && (
              <p className={errorTextClass}>请至少添加一个项目时间记录</p>
            )}

            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => setCurrentStep(2)}>上一步</Button>
              <Button onClick={handleSubmit}>提交表单 <Check className="ml-1 h-4 w-4" /></Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
