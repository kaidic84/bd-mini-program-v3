/**
 * 数据服务层
 *
 * 统一的数据访问接口：
 * - 项目：优先走后端 /api/projects（后端再去调用飞书）
 * - 客户：优先走后端 /api/customers（后端再去调用飞书）
 * - 其它（立项/每日表单等）：当前仍走 mock（按原有逻辑保持不动）
 */

import { mockDb } from '@/mock/bdMockData';
import { feishuBitableApi } from '@/api/feishuBitableApi';
import type {
  Client,
  Project,
  Deal,
  DailyFormData,
  ReminderItem,
  UnfinishedReminderItem,
  FinishedReminderItem,
  SignedReminderItem,
  ReceivableReminderItem,
  ReminderLevel,
} from '@/types/bd';

// 是否使用“前端直连飞书”的占位 API（当前实现是占位，不建议开启）
const USE_FEISHU_API = false;

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  const json = await res.json().catch(() => null);
  return { res, json };
}

const parseDate = (value: string | Date | undefined | null) => {
  if (!value) return null;
  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  let str = String(value).trim();
  if (!str) return null;
  str = str.replace(/[./]/g, '-');
  if (/^\d{4}-\d{1,2}-\d{1,2}\s+\d/.test(str)) {
    str = str.replace(' ', 'T');
  }
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

const getLastWeekRange = () => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = today.getDay(); // 0=Sun
  const daysSinceMonday = (day + 6) % 7;
  const startOfThisWeek = new Date(today);
  startOfThisWeek.setDate(today.getDate() - daysSinceMonday);
  const startOfLastWeek = new Date(startOfThisWeek);
  startOfLastWeek.setDate(startOfThisWeek.getDate() - 7);
  const endOfLastWeek = new Date(startOfThisWeek);
  endOfLastWeek.setDate(startOfThisWeek.getDate() - 1);
  return { start: startOfLastWeek, end: endOfLastWeek };
};

const getDaysDiff = (from: string | Date | undefined | null, to: string | Date | undefined | null) => {
  const d1 = parseDate(from);
  const d2 = parseDate(to);
  if (!d1 || !d2) return 0;
  const ms = d2.getTime() - d1.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
};

const getBusinessDaysDiff = (from: string | Date | undefined | null, to: string | Date | undefined | null) => {
  const d1 = parseDate(from);
  const d2 = parseDate(to);
  if (!d1 || !d2) return 0;
  if (d2.getTime() <= d1.getTime()) return 0;
  let count = 0;
  const cur = new Date(d1.getFullYear(), d1.getMonth(), d1.getDate());
  cur.setDate(cur.getDate() + 1);
  while (cur.getTime() <= d2.getTime()) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count += 1;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
};

const resolveCustomerBdField = (data: Partial<Client> & { owner?: string; ownerBd?: string; ownerUserId?: string }) => {
  const ownerBd = String(data.ownerBd ?? data.owner ?? '').trim();
  const ownerUserId = String(data.ownerUserId ?? '').trim();
  return { ownerBd, ownerUserId };
};

const FOLLOW_UP_STORAGE_KEY = 'bd_follow_up_overrides';
const RECEIVABLE_FOLLOW_UP_STORAGE_KEY = 'bd_receivable_follow_up_overrides';

const loadFollowUpOverrides = (): Record<string, string> => {
  if (typeof window === 'undefined' || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem(FOLLOW_UP_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, string>;
  } catch (e) {
    return {};
  }
};

const saveFollowUpOverrides = (data: Record<string, string>) => {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(FOLLOW_UP_STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    // ignore storage errors
  }
};

const formatOverrideDate = (value: Date) => {
  const yyyy = value.getFullYear();
  const mm = String(value.getMonth() + 1).padStart(2, '0');
  const dd = String(value.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const parseOverrideDate = (raw: string | undefined | null) => {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  if (/^\d{10,13}$/.test(value)) {
    const num = Number(value);
    if (Number.isFinite(num)) {
      const ms = value.length === 10 ? num * 1000 : num;
      const d = new Date(ms);
      return Number.isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }
  }
  return parseDate(value);
};

const setFollowUpOverride = (projectId: string, when: Date = new Date()) => {
  const id = String(projectId || '').trim();
  if (!id) return;
  const overrides = loadFollowUpOverrides();
  overrides[id] = formatOverrideDate(when);
  saveFollowUpOverrides(overrides);
};

const clearFollowUpOverride = (projectId: string) => {
  const id = String(projectId || '').trim();
  if (!id) return;
  const overrides = loadFollowUpOverrides();
  if (!(id in overrides)) return;
  delete overrides[id];
  saveFollowUpOverrides(overrides);
};

const loadReceivableFollowUpOverrides = (): Record<string, string> => {
  if (typeof window === 'undefined' || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem(RECEIVABLE_FOLLOW_UP_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, string>;
  } catch (e) {
    return {};
  }
};

const saveReceivableFollowUpOverrides = (data: Record<string, string>) => {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(RECEIVABLE_FOLLOW_UP_STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    // ignore storage errors
  }
};

const setReceivableFollowUpOverride = (dealId: string, when: Date = new Date()) => {
  const id = String(dealId || '').trim();
  if (!id) return;
  const overrides = loadReceivableFollowUpOverrides();
  overrides[id] = formatOverrideDate(when);
  saveReceivableFollowUpOverrides(overrides);
};

const clearReceivableFollowUpOverride = (dealId: string) => {
  const id = String(dealId || '').trim();
  if (!id) return;
  const overrides = loadReceivableFollowUpOverrides();
  if (!(id in overrides)) return;
  delete overrides[id];
  saveReceivableFollowUpOverrides(overrides);
};

export const dataService = {
  // ==================== 客户操作 ====================

  async getAllClients(): Promise<Client[]> {
    try {
      const { res, json } = await fetchJson('/api/customers', { cache: 'no-store' });
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || `Request failed with status ${res.status}`);
      }
      return (json?.data || []) as Client[];
    } catch (e) {
      console.error('[dataService] getAllClients via backend failed, fallback to mockDb:', e);
      return mockDb.getAllClients();
    }
  },

  async getClientById(customerId: string): Promise<Client | undefined> {
    // 后端目前只提供 list API，前端通过列表过滤拿到单条
    const clients = await dataService.getAllClients();
    return clients.find((c: any) => c?.id === customerId || c?.customerId === customerId);
  },

  async searchClients(keyword: string): Promise<Client[]> {
    const k = String(keyword || '').trim();
    if (!k) return dataService.getAllClients();

    try {
      const { res, json } = await fetchJson(
        `/api/customers?keyword=${encodeURIComponent(k)}`,
        { cache: 'no-store' }
      );
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || `Request failed with status ${res.status}`);
      }
      return (json?.data || []) as Client[];
    } catch (e) {
      console.error('[dataService] searchClients via backend failed, fallback to mockDb:', e);
      return mockDb.searchClients(k);
    }
  },

  async createClient(
    data: Omit<Client, 'id' | 'customerId' | 'relatedProjectIds'>
  ): Promise<Client> {
    // ✅ 必须走后端写回飞书，否则 Network 里不会出现 POST /api/customers
    try {
      const { ownerBd, ownerUserId } = resolveCustomerBdField(data as any);
      const payload = {
        shortName: data.shortName,
        companyName: data.companyName,
        leadMonth: (data.leadMonth || "").trim(),
        hq: data.hq || '',
        customerType: (data.customerType || '').trim(),
        level: (data.level || '').trim(),
        cooperationStatus: (data.cooperationStatus || '').trim(),
        industry: (data.industry || '').trim(),
        isAnnual: !!data.isAnnual,
        // 后端客户接口读取 ownerBd / ownerUserId
        ownerBd,
        ownerUserId,
      };

      const { res, json } = await fetchJson('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(payload),
      });

      if (!res.ok || !json?.success) {
        throw new Error(json?.error || `Request failed with status ${res.status}`);
      }

      const recordId = json.record_id || json?.data?.records?.[0]?.record_id || '';
      return {
        id: recordId || Date.now().toString(),
        shortName: data.shortName,
        companyName: data.companyName,
        leadMonth: data.leadMonth || "",
        customerType: data.customerType,
        level: data.level || '',
        cooperationStatus: data.cooperationStatus || '',
        industry: data.industry || '',
        hq: data.hq || '',
        isAnnual: !!data.isAnnual,
        owner: ownerBd,
        ownerUserId,
        relatedProjectIds: [],
        customerId: recordId || Date.now().toString(),
      };
    } catch (e) {
      console.error('[dataService] createClient via backend failed, fallback to mockDb:', e);
      return mockDb.createClient(data as any);
    }
  },

  async updateClient(customerId: string, data: Partial<Client>): Promise<boolean> {
    // preferred: backend (server -> Feishu), fallback to mock
    try {
      const { res, json } = await fetchJson(`/api/customers/${encodeURIComponent(customerId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(data || {}),
      });
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || `Request failed with status ${res.status}`);
      }
      return true;
    } catch (e) {
      console.error('[dataService] updateClient via backend failed, fallback to mockDb:', e);
      if (USE_FEISHU_API) {
        return feishuBitableApi.updateClient(customerId, data);
      }
      return mockDb.updateClient(customerId, data);
    }
  },

  // ==================== 项目操作 ====================

  async getAllProjects(): Promise<Project[]> {
    try {
      const { res, json } = await fetchJson('/api/projects', { cache: 'no-store' });
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || `Request failed with status ${res.status}`);
      }
      return (json?.data || []) as Project[];
    } catch (e) {
      console.error('[dataService] getAllProjects via backend failed, fallback to mockDb:', e);
      return mockDb.getAllProjects();
    }
  },

  async getProjectById(projectId: string): Promise<Project | undefined> {
    try {
      const { res, json } = await fetchJson(`/api/projects/${encodeURIComponent(projectId)}`, {
        cache: 'no-store',
      });
      if (res.status === 404) return undefined;
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || `Request failed with status ${res.status}`);
      }
      return (json?.data || undefined) as Project | undefined;
    } catch (e) {
      console.error('[dataService] getProjectById via backend failed, fallback to mockDb:', e);
      return mockDb.getProjectById(projectId);
    }
  },

  async getProjectsByCustomerId(customerId: string): Promise<Project[]> {
    try {
      const q = encodeURIComponent(customerId);
      const { res, json } = await fetchJson(`/api/projects?customerId=${q}`, { cache: 'no-store' });
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || `Request failed with status ${res.status}`);
      }
      return (json?.data || []) as Project[];
    } catch (e) {
      console.error(
        '[dataService] getProjectsByCustomerId via backend failed, fallback to mockDb:',
        e
      );
      return mockDb.getProjectsByCustomerId(customerId);
    }
  },

  async searchProjects(keyword: string): Promise<Project[]> {
    try {
      const q = encodeURIComponent(keyword || '');
      const { res, json } = await fetchJson(`/api/projects?keyword=${q}`, { cache: 'no-store' });
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || `Request failed with status ${res.status}`);
      }
      return (json?.data || []) as Project[];
    } catch (e) {
      console.error('[dataService] searchProjects via backend failed, fallback to mockDb:', e);
      return mockDb.searchProjects(keyword);
    }
  },

  async createProject(
    data: Omit<Project, 'projectId' | 'createdAt' | 'updatedAt'>
  ): Promise<Project> {
    // preferred: backend (server -> Feishu), fallback to mock
    try {
      const { res, json } = await fetchJson('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(data || {}),
      });
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || `Request failed with status ${res.status}`);
      }
      // Backend returns record_id + fields; we re-fetch list to keep mapping consistent
      const projects = await dataService.getAllProjects();
      const createdId = data?.projectId || json?.record_id;
      return (
        projects.find((p: any) => p?.projectId === createdId) ||
        (projects[0] as any) ||
        (data as any)
      );
    } catch (e) {
      console.error('[dataService] createProject via backend failed, fallback to mockDb:', e);
      return mockDb.createProject(data);
    }
  },

  async updateProject(projectId: string, data: Partial<Project>): Promise<boolean> {
    // preferred: backend (server -> Feishu), fallback to mock
    try {
      const { res, json } = await fetchJson(`/api/projects/${encodeURIComponent(projectId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(data || {}),
      });
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || `Request failed with status ${res.status}`);
      }
      return true;
    } catch (e) {
      console.error('[dataService] updateProject via backend failed, fallback to mockDb:', e);
      if (USE_FEISHU_API) {
        return feishuBitableApi.updateProject(projectId, data);
      }
      return mockDb.updateProject(projectId, data);
    }
  },

  // ==================== 立项操作 ====================

  async getAllDeals(): Promise<Deal[]> {
    try {
      const { res, json } = await fetchJson('/api/deals', { cache: 'no-store' });
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || `Request failed with status ${res.status}`);
      }
      return (json?.data || []) as Deal[];
    } catch (e) {
      console.error('[dataService] getAllDeals via backend failed, fallback to mockDb:', e);
      return mockDb.getAllDeals();
    }
  },

  async getDealById(dealId: string): Promise<Deal | undefined> {
    const deals = await dataService.getAllDeals();
    return deals.find((d: any) => d?.dealId === dealId);
  },

  async getDealByProjectId(projectId: string): Promise<Deal | undefined> {
    const deals = await dataService.getAllDeals();
    return deals.find((d: any) => d?.projectId === projectId);
  },

  async createDeal(data: Omit<Deal, 'createdAt' | 'updatedAt'>): Promise<Deal> {
    try {
      const { res, json } = await fetchJson('/api/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(data || {}),
      });
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || `Request failed with status ${res.status}`);
      }
      return (data as any) as Deal;
    } catch (e) {
      console.error('[dataService] createDeal via backend failed, fallback to mockDb:', e);
      return mockDb.createDeal(data as any);
    }
  },

  async updateDeal(dealId: string, data: Partial<Deal>): Promise<boolean> {
    try {
      const { res, json } = await fetchJson(`/api/deals/${encodeURIComponent(dealId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(data || {}),
      });
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || `Request failed with status ${res.status}`);
      }
      return true;
    } catch (e) {
      console.error('[dataService] updateDeal via backend failed:', e);
      if (USE_FEISHU_API) {
        return feishuBitableApi.updateDeal(dealId, data);
      }
      return false;
    }
  },

  // ==================== 每日表单操作 ====================

  async getAllDailyForms(): Promise<DailyFormData[]> {
    return mockDb.getAllDailyForms();
  },

  async createDailyForm(data: Omit<DailyFormData, 'id' | 'createdAt'>): Promise<DailyFormData> {
    return mockDb.createDailyForm(data);
  },

  async getLastWeekOverviewCounts(): Promise<{
    newClients: number;
    newProjects: number;
    newDeals: number;
  }> {
    const { start, end } = getLastWeekRange();
    const isInLastWeek = (value: string | Date | undefined | null) => {
      const date = parseDate(value);
      if (!date) return false;
      return date >= start && date <= end;
    };

    const [clients, projects, deals] = await Promise.all([
      this.getAllClients(),
      this.getAllProjects(),
      this.getAllDeals(),
    ]);

    const newClients = clients.filter((client) => isInLastWeek(client.createdAt)).length;
    const newProjects = projects.filter((project) => isInLastWeek(project.createdAt)).length;
    const newDeals = deals.filter((deal) => isInLastWeek(deal.createdAt)).length;

    return { newClients, newProjects, newDeals };
  },

  // ==================== ????????? ====================

  async getUnfinishedReminders(): Promise<UnfinishedReminderItem[]> {
    const projects = await this.getAllProjects();
    const today = new Date();

    const reminderProjectTypes = ['方案&报价', 'POC'];
    const excludeStages = ['丢单'];
    const reminderStages = ['未开始', '进行中', '停滞'];
    const resolveDaysSinceUpdate = (p: Project) => {
      if (p.lastUpdateDate) return getDaysDiff(p.lastUpdateDate, today);
      const raw = Number(p.daysSinceUpdate);
      if (Number.isFinite(raw)) return raw;
      return 0;
    };

    return projects
      .filter((p) => {
        const projectType = String(p.projectType || '').trim();
        const stage = String(p.stage || '').trim();
        if (!reminderProjectTypes.includes(projectType)) return false;
        if (excludeStages.includes(stage)) return false;
        if (!reminderStages.includes(stage)) return false;
        if (p.isFollowedUp) return false;

        const daysSinceUpdate = resolveDaysSinceUpdate(p);
        if (daysSinceUpdate >= 4) return true;

        return false;
      })
      .map((p) => {
        const daysSinceUpdate = resolveDaysSinceUpdate(p);
        let reminderLevel: ReminderLevel = 'normal';
        if (daysSinceUpdate > 14) {
          reminderLevel = 'red';
        } else if (daysSinceUpdate > 7) {
          reminderLevel = 'yellow';
        }

        return {
          projectId: p.projectId,
          projectName: p.projectName,
          customerId: p.customerId || '',
          shortName: p.shortName,
          bd: p.bd,
          projectType: p.projectType,
          stage: p.stage,
          lastUpdateDate: p.lastUpdateDate,
          isFollowedUp: p.isFollowedUp,
          daysSinceUpdate,
          reminderLevel,
        };
      })
      .sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate);
  },

  async getFinishedReminders(): Promise<FinishedReminderItem[]> {
    const projects = await this.getAllProjects();
    const deals = await this.getAllDeals();
    const today = new Date();
    const followUpDelayDays = 4;
    const followUpOverrides = loadFollowUpOverrides();

    const normalizeName = (value: unknown) => String(value || '').trim().toLowerCase().replace(/\s+/g, '');
    const projectMap = new Map(projects.map((p) => [String(p.projectId || '').trim(), p]));
    const projectNameMap = new Map(projects.map((p) => [String(p.projectName || '').trim(), p]));
    const projectNameNormalizedMap = new Map(projects.map((p) => [normalizeName(p.projectName), p]));

    return deals
      .map((d) => {
        const endDate = d.endDate || '';
        if (!endDate) return null;

        const isFinished = String(d.isFinished ?? '').trim();
        if (isFinished && isFinished !== '否') return null;

        const daysUntilEnd = getDaysDiff(today, endDate);
        let reminderLevel: ReminderLevel = 'normal';
        if (daysUntilEnd < 0) {
          reminderLevel = 'red';
        } else if (daysUntilEnd === 0) {
          reminderLevel = 'yellow';
        } else {
          return null;
        }

        const projectId = String(d.projectId || '').trim();
        const projectName = String(d.projectName || '').trim();
        const p =
          projectMap.get(projectId) ||
          projectNameMap.get(projectName) ||
          projectNameNormalizedMap.get(normalizeName(projectName));
        const followUpFlag = Boolean(p?.isFollowedUp);
        const overrideRaw = followUpOverrides[String(projectId || p?.projectId || '').trim() || ''];
        const overrideDate = overrideRaw ? parseOverrideDate(overrideRaw) : null;
        const lastUpdateDate = p?.lastUpdateDate ? parseDate(p.lastUpdateDate) : null;
        let followUpStart: Date | null = null;
        if (followUpFlag && lastUpdateDate) followUpStart = lastUpdateDate;
        if (overrideDate && lastUpdateDate && lastUpdateDate > overrideDate) {
          followUpStart = lastUpdateDate;
        } else if (overrideDate) {
          followUpStart = followUpStart || overrideDate;
        }
        const followUpAge = followUpStart ? getDaysDiff(followUpStart, today) : null;
        const followUpActive = followUpAge !== null && followUpAge < followUpDelayDays;
        if (followUpActive) return null;
        if (overrideRaw && followUpAge !== null && followUpAge >= followUpDelayDays) {
          clearFollowUpOverride(String(projectId || p?.projectId || '').trim());
        }
        return {
          projectId: p?.projectId || projectId || d.dealId,
          dealId: d.dealId,
          projectName: p?.projectName || projectName || d.dealId,
          customerId: p?.customerId || '',
          shortName: p?.shortName || '',
          bd: p?.bd || '',
          projectType: p?.projectType || '签单',
          stage: p?.stage || '未开始',
          isFollowedUp: false,
          projectEndDate: endDate,
          daysUntilEnd,
          reminderLevel,
        } as FinishedReminderItem;
      })
      .filter(Boolean)
      .sort((a, b) => {
        const overdueA = Math.max(0, -a.daysUntilEnd);
        const overdueB = Math.max(0, -b.daysUntilEnd);
        return overdueB - overdueA;
      }) as FinishedReminderItem[];
  },

  async getSignedReminders(): Promise<SignedReminderItem[]> {
    const [deals, projects, clients] = await Promise.all([
      this.getAllDeals(),
      this.getAllProjects(),
      this.getAllClients(),
    ]);
    const today = new Date();
    const projectMap = new Map(projects.map((p) => [String(p.projectId || '').trim(), p]));
    const clientMap = new Map(
      clients.map((c) => [String(c.customerId || c.id || '').trim(), c])
    );

    const isIncomeFilled = (value: unknown) => {
      if (value === null || value === undefined || value === '') return false;
      const num = Number(value);
      if (Number.isFinite(num)) return num > 0;
      return Boolean(String(value).trim());
    };

    const isDropped = (value: unknown) => {
      if (value === null || value === undefined) return false;
      if (Array.isArray(value)) return value.some((item) => isDropped(item));
      const raw = String(value).trim();
      if (!raw) return false;
      return raw.includes('丢单');
    };

    const pickCreatedAt = (deal: Deal) => {
      const d: any = deal as any;
      return (
        d.createdAt ||
        d.createdTime ||
        d.createTime ||
        d['创建时间'] ||
        d['创建日期'] ||
        d['立项创建时间'] ||
        d['立项创建日期'] ||
        ''
      );
    };

    return deals
      .map((deal) => {
        const finishState = (deal as any).isFinished ?? (deal as any)['是否完结'] ?? '';
        if (isDropped(finishState)) return null;
        if (isIncomeFilled(deal.incomeWithTax)) return null;

        const projectId = String(deal.projectId || '').trim();
        const project = projectMap.get(projectId);
        const projectName = project?.projectName || String(deal.projectName || '').trim() || deal.dealId;
        const customerId = String(project?.customerId || deal.customerId || '').trim();
        const client = clientMap.get(customerId);
        const shortName = project?.shortName || client?.shortName || '';
        const bd = String(project?.bd || '').trim();
        const createdAt = String(pickCreatedAt(deal) || '').trim();
        if (!createdAt) return null;
        const overdueDays = getBusinessDaysDiff(createdAt, today);
        if (overdueDays < 1) return null;
        return {
          projectId: projectId || String(deal.dealId || '').trim(),
          dealId: String(deal.dealId || '').trim(),
          projectName,
          customerId: customerId || undefined,
          shortName,
          bd,
        } as SignedReminderItem;
      })
      .filter(Boolean) as SignedReminderItem[];
  },

  async getReceivableReminders(): Promise<ReceivableReminderItem[]> {
    const [deals, projects, clients] = await Promise.all([
      this.getAllDeals(),
      this.getAllProjects(),
      this.getAllClients(),
    ]);
    const today = new Date();
    const followUpDelayDays = 4;
    const followUpOverrides = loadReceivableFollowUpOverrides();
    const projectMap = new Map(projects.map((p) => [String(p.projectId || '').trim(), p]));
    const clientMap = new Map(
      clients.map((c) => [String(c.customerId || c.id || '').trim(), c])
    );

    const normalizeNumber = (raw: unknown) => {
      if (raw === null || raw === undefined || raw === '') return null;
      if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
      const str = String(raw).replace(/[,\s¥￥]/g, '').trim();
      if (!str) return null;
      const num = Number(str);
      return Number.isNaN(num) ? null : num;
    };

    return deals
      .map((deal) => {
        const remaining = normalizeNumber((deal as any).remainingReceivable);
        if (!remaining || remaining <= 0) return null;

        const projectId = String(deal.projectId || '').trim();
        const project = projectMap.get(projectId);
        const projectName =
          project?.projectName || String(deal.projectName || '').trim() || deal.dealId;
        const customerId = String(project?.customerId || deal.customerId || '').trim();
        const client = clientMap.get(customerId);
        const shortName = project?.shortName || client?.shortName || '';
        const dealId = String(deal.dealId || '').trim();
        const firstPaymentDate =
          (deal as any).firstPaymentDate || (deal as any).first_payment_date || '';
        const paymentDate = parseDate(firstPaymentDate);
        if (!paymentDate) return null;
        const dueDays = getDaysDiff(paymentDate, today);
        if (dueDays < 0) return null;
        const overrideRaw = followUpOverrides[dealId];
        const overrideDate = overrideRaw ? parseOverrideDate(overrideRaw) : null;
        const followUpAge = overrideDate ? getDaysDiff(overrideDate, today) : null;
        const followUpActive = followUpAge !== null && followUpAge < followUpDelayDays;
        if (followUpActive) return null;
        if (overrideRaw && followUpAge !== null && followUpAge >= followUpDelayDays) {
          clearReceivableFollowUpOverride(dealId);
        }

        return {
          projectId: project?.projectId || projectId || dealId,
          dealId,
          projectName,
          customerId: customerId || undefined,
          shortName,
          bd: project?.bd || '',
          bdOpenId: project?.bdOpenId,
          firstPaymentDate,
          receivedAmount: normalizeNumber((deal as any).receivedAmount),
          remainingReceivable: remaining,
        } as ReceivableReminderItem;
      })
      .filter(Boolean)
      .sort((a, b) => (b.remainingReceivable || 0) - (a.remainingReceivable || 0)) as ReceivableReminderItem[];
  },

  async confirmFollowUp(projectId: string): Promise<boolean> {
    const now = new Date();
    const lastUpdateDate = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(
      now.getDate()
    ).padStart(2, '0')}`;
    const payload: Partial<Project> = { isFollowedUp: true, lastUpdateDate };
    if (USE_FEISHU_API) {
      const success = await feishuBitableApi.updateProject(projectId, payload);
      if (success) setFollowUpOverride(projectId, now);
      return success;
    }
    try {
      const { res, json } = await fetchJson(`/api/projects/${encodeURIComponent(projectId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(payload),
      });
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || `Request failed with status ${res.status}`);
      }
      setFollowUpOverride(projectId, now);
      return true;
    } catch (e) {
      console.error('[dataService] confirmFollowUp via backend failed:', e);
      return false;
    }
  },

  async confirmReceivableFollowUp(dealId: string): Promise<boolean> {
    const id = String(dealId || '').trim();
    if (!id) return false;
    try {
      setReceivableFollowUpOverride(id, new Date());
      return true;
    } catch (e) {
      console.error('[dataService] confirmReceivableFollowUp failed:', e);
      return false;
    }
  },

  async getReminderProjects(): Promise<ReminderItem[]> {
    const unfinished = await this.getUnfinishedReminders();
    return unfinished.map((p) => ({
      projectId: p.projectId,
      projectName: p.projectName,
      shortName: p.shortName,
      bd: p.bd,
      stage: p.stage,
      lastUpdateDate: p.lastUpdateDate,
      reason: `${p.daysSinceUpdate} 天未更新`,
    }));
  },

  async sendFollowupReminder(projectId: string): Promise<boolean> {
    if (USE_FEISHU_API) {
      return feishuBitableApi.sendFollowupReminder(projectId);
    }
    console.log('[DataService] sendFollowupReminder called for:', projectId);
    return true;
  },

async sendDailyReminders(): Promise<{ bd: string; count: number; projects: string[] }[]> {
    const unfinished = await this.getUnfinishedReminders();
    const finished = await this.getFinishedReminders();
    
    // 按 BD 分组
    const bdReminderMap = new Map<string, string[]>();
    
    [...unfinished, ...finished].forEach(item => {
      if (!bdReminderMap.has(item.bd)) {
        bdReminderMap.set(item.bd, []);
      }
      bdReminderMap.get(item.bd)!.push(item.projectName);
    });

    const results: { bd: string; count: number; projects: string[] }[] = [];
    
    for (const [bd, projects] of bdReminderMap) {
      // TODO: 未来接入飞书消息 API
      // await feishuBitableApi.sendDailyReminderNotification(bd, projects);
      console.log(`[DataService] 发送每日提醒给 ${bd}:`, projects);
      results.push({ bd, count: projects.length, projects });
    }
    
    return results;
  },
};

export default dataService;
