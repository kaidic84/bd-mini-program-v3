import React from "react";
import {
  NavLink,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
} from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { dataService } from "@/services/dataService";
import {
  ClipboardList,
  Bell,
  Database,
  LayoutGrid,
  LogOut,
  Coins,
  Lock,
  ArrowLeft,
} from "lucide-react";

// Tab 页面组件
import ClientsTab from "@/pages/tabs/ClientsTab";
import ProjectsTab from "@/pages/tabs/ProjectsTab";
import DealsTab from "@/pages/tabs/DealsTab";
import DailyFormTab from "@/pages/tabs/DailyFormTab";
import CostEntryTab from "@/pages/tabs/CostEntryTab";
import RemindersTab from "@/pages/tabs/RemindersTab";
import KanbanTab from "@/pages/tabs/KanbanTab";
import BusinessDataTab from "@/pages/tabs/BusinessDataTab";
import UsageTab from "@/pages/tabs/UsageTab";
import { getAccess } from "@/lib/access";

type TabKey =
  | "business"
  | "kanban"
  | "clients"
  | "projects"
  | "deals"
  | "daily"
  | "cost"
  | "reminders"
  | "usage";

interface TabItem {
  key: TabKey;
  label: string;
  icon: React.ElementType;
}

const tabs: TabItem[] = [
  { key: "kanban", label: "看板视图", icon: LayoutGrid },
  { key: "business", label: "业务数据", icon: Database },
  { key: "daily", label: "每日表单", icon: ClipboardList },
  { key: "cost", label: "成本录入", icon: Coins },
  { key: "reminders", label: "提醒预览", icon: Bell },
];

interface OverviewCounts {
  newClients: number;
  newProjects: number;
  newDeals: number;
  isLoading: boolean;
}

interface HomeOverviewProps {
  userName: string;
  todayLabel: string;
  overviewCounts: OverviewCounts;
  usageLocked: boolean;
}

const LockedPanel: React.FC = () => (
  <div className="mx-auto flex min-h-[50vh] max-w-3xl items-center justify-center">
    <div className="rounded-2xl border border-border/60 bg-card/70 px-6 py-8 text-center shadow-sm">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted/30">
        <Lock className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="text-base font-semibold text-foreground">当前内容已锁定</div>
      <div className="mt-2 text-sm text-muted-foreground">你暂无权限查看该模块，如需开通请联系管理员</div>
    </div>
  </div>
);

const HomeOverview: React.FC<HomeOverviewProps> = ({
  userName,
  todayLabel,
  overviewCounts,
  usageLocked,
}) => (
  <section className="relative overflow-hidden rounded-[28px] border border-border/60 bg-black/45 p-6 text-foreground shadow-[0_35px_70px_-50px_rgba(0,0,0,0.9)] backdrop-blur">
    <div className="pointer-events-none absolute -right-16 -top-12 h-56 w-56 rounded-full bg-[radial-gradient(circle_at_30%_30%,rgba(255,188,120,0.75),transparent_70%)] opacity-70" />
    <div className="pointer-events-none absolute -bottom-24 -left-10 h-52 w-52 rounded-full bg-[radial-gradient(circle_at_30%_30%,rgba(255,140,92,0.45),transparent_70%)] opacity-60" />
    <div className="relative z-10 flex flex-col gap-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-muted-foreground">
        <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_14px_rgba(255,185,90,0.7)]" />
        欢迎回来
      </div>
      <div className="space-y-1">
        <div className="text-sm text-muted-foreground">您好，{userName}</div>
        <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl">售前 小程序</h1>
        <p className="text-sm text-muted-foreground">项目更新、立项进度、提醒同步，一屏掌控</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <span className="miniapp-chip">即时更新</span>
        <span className="miniapp-chip">飞书同步</span>
        <span className="miniapp-chip">桌面优先</span>
      </div>
    </div>

    <div className="relative z-10 mt-6 grid gap-3 lg:grid-cols-2">
      <div className="miniapp-scorecard">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>今日概览</span>
          <span>{todayLabel}</span>
        </div>
        <div className="mt-2 text-lg font-semibold">上周新增概览</div>
        <div className="mt-3 grid grid-cols-3 gap-3 text-xs text-muted-foreground">
          <div>
            <div className="text-base font-semibold text-foreground tabular-nums">
              {overviewCounts.isLoading ? "-" : overviewCounts.newClients}
            </div>
            <div>上周新增客户</div>
          </div>
          <div>
            <div className="text-base font-semibold text-foreground tabular-nums">
              {overviewCounts.isLoading ? "-" : overviewCounts.newProjects}
            </div>
            <div>上周新增项目</div>
          </div>
          <div>
            <div className="text-base font-semibold text-foreground tabular-nums">
              {overviewCounts.isLoading ? "-" : overviewCounts.newDeals}
            </div>
            <div>上周新增立项</div>
          </div>
        </div>
      </div>
      <div className="miniapp-scorecard">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>快捷入口</span>
          <NavLink
            to="usage"
            className={cn(
              "inline-flex items-center gap-1 text-xs underline-offset-4",
              usageLocked
                ? "text-muted-foreground/70"
                : "text-primary hover:text-primary/80 hover:underline"
            )}
          >
            访问日志
            {usageLocked && <Lock className="h-3 w-3" />}
          </NavLink>
        </div>
        <div className="mt-3 grid gap-3">
          <NavLink to="daily" className="miniapp-quick">
            <ClipboardList className="h-4 w-4 text-primary" />
            <div>
              <div className="text-sm font-semibold">每日表单</div>
              <div className="text-xs text-muted-foreground">新增与更新业务数据</div>
            </div>
          </NavLink>
          <NavLink to="cost" className="miniapp-quick">
            <Coins className="h-4 w-4 text-primary" />
            <div>
              <div className="text-sm font-semibold">成本录入</div>
              <div className="text-xs text-muted-foreground">三方成本明细填写</div>
            </div>
          </NavLink>
          <NavLink to="reminders" className="miniapp-quick">
            <Bell className="h-4 w-4 text-primary" />
            <div>
              <div className="text-sm font-semibold">提醒预览</div>
              <div className="text-xs text-muted-foreground">跟进与完结提醒</div>
            </div>
          </NavLink>
        </div>
      </div>
    </div>
  </section>
);

const TabLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [overviewCounts, setOverviewCounts] = React.useState<OverviewCounts>({
    newClients: 0,
    newProjects: 0,
    newDeals: 0,
    isLoading: true,
  });
  const todayLabel = new Date().toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
  });
  const normalizedPath = location.pathname.replace(/\/$/, "");
  const isHome = normalizedPath === "/app";
  const isBusinessChild = ["/app/clients", "/app/projects", "/app/deals"].includes(normalizedPath);
  const userName = String(user?.name || "").trim();
  const access = getAccess(userName);
  const canAccessRoute = (key: TabKey) => {
    if (access.full) return true;
    if (key === "daily") return access.canDaily;
    if (key === "cost") return access.canCostEntry;
    if (key === "reminders") return access.canReminders;
    if (key === "usage") return access.canUsage;
    if (key === "business" || key === "kanban") return true;
    if (key === "clients") return access.canBusinessClients;
    if (key === "projects") return access.canBusinessProjects;
    if (key === "deals") return access.canBusinessDeals;
    return false;
  };
  const guardRoute = (key: TabKey, element: React.ReactElement) =>
    canAccessRoute(key) ? element : <LockedPanel />;
  const allowedTabs = tabs;

  React.useEffect(() => {
    let isActive = true;
    dataService
      .getLastWeekOverviewCounts()
      .then((counts) => {
        if (!isActive) return;
        setOverviewCounts({ ...counts, isLoading: false });
      })
      .catch((error) => {
        console.error("[TabLayout] load overview counts failed:", error);
        if (!isActive) return;
        setOverviewCounts((prev) => ({ ...prev, isLoading: false }));
      });
    return () => {
      isActive = false;
    };
  }, []);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="miniapp-shell">
      <div className="pointer-events-none absolute inset-0 miniapp-bg" aria-hidden />
      <div className="pointer-events-none miniapp-orb miniapp-orb-warm" aria-hidden />
      <div className="pointer-events-none miniapp-orb miniapp-orb-cool" aria-hidden />

      <header className="sticky top-0 z-40">
        <div className="mx-auto max-w-7xl px-6 pt-6 sm:px-8 lg:px-10">
          <div className="miniapp-topbar">
            <div className="flex items-center gap-3">
              <div className="flex h-10 items-center justify-center">
                <img
                  src="/brand-logo-app.png"
                  alt="橙果视界"
                  className="h-10 w-auto max-w-[120px] object-contain"
                />
              </div>
              <div className="flex flex-col leading-tight">
                <span className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                  橙果视界
                </span>
                <span className="font-display text-sm text-foreground">售前 小程序</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden text-right text-xs text-muted-foreground sm:block">
                <div>{user?.name || "-"}</div>
                <div className="text-[10px] text-muted-foreground">{todayLabel}</div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleLogout}
                className="text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="miniapp-main relative z-10 flex-1">
        <div className="mx-auto max-w-7xl px-6 pb-12 pt-6 sm:px-8 lg:px-10">
          <div className="miniapp-stagger space-y-6">
            {!isHome && (
              <div className="flex items-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate(isBusinessChild ? "/app/business" : "/app")}
                  className="text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
                >
                  <ArrowLeft className="h-4 w-4" />
                  {isBusinessChild ? "返回" : "返回首页"}
                </Button>
              </div>
            )}
            <section className="relative">
              <Routes>
                <Route
                  index
                  element={
                    <HomeOverview
                      userName={user?.name || "伙伴"}
                      todayLabel={todayLabel}
                      overviewCounts={overviewCounts}
                      usageLocked={!canAccessRoute("usage")}
                    />
                  }
                />

                <Route path="business" element={guardRoute("business", <BusinessDataTab />)} />
                <Route path="kanban" element={guardRoute("kanban", <KanbanTab />)} />
                <Route path="clients" element={guardRoute("clients", <ClientsTab />)} />
                <Route path="projects" element={guardRoute("projects", <ProjectsTab />)} />
                <Route path="deals" element={guardRoute("deals", <DealsTab />)} />
                <Route path="daily" element={guardRoute("daily", <DailyFormTab />)} />
                <Route path="cost" element={guardRoute("cost", <CostEntryTab />)} />
                <Route path="reminders" element={guardRoute("reminders", <RemindersTab />)} />
                <Route path="usage" element={guardRoute("usage", <UsageTab />)} />

                <Route path="*" element={<Navigate to="/app" replace />} />
              </Routes>
            </section>
          </div>
        </div>
      </main>

      <nav
        className={cn(
          "miniapp-tabbar",
          allowedTabs.length <= 2 && "miniapp-tabbar--compact"
        )}
      >
        {allowedTabs.map((tab) => {
          const Icon = tab.icon;
          const locked = !canAccessRoute(tab.key);
          return (
            <NavLink
              key={tab.key}
              to={locked ? "#" : tab.key}
              onClick={(event) => {
                if (locked) event.preventDefault();
              }}
              className={({ isActive }) =>
                cn(
                  "miniapp-tab",
                  locked
                    ? "cursor-not-allowed text-muted-foreground hover:bg-transparent"
                    : isActive
                      ? "miniapp-tab-active"
                      : "hover:text-foreground hover:bg-foreground/10"
                )
              }
            >
              <Icon className="h-5 w-5" />
              <span className="whitespace-nowrap">{tab.label}</span>
              {locked && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
};

export default TabLayout;
