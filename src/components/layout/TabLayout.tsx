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
  ArrowLeft,
} from "lucide-react";

// Tab 页面组件
import ClientsTab from "@/pages/tabs/ClientsTab";
import ProjectsTab from "@/pages/tabs/ProjectsTab";
import DealsTab from "@/pages/tabs/DealsTab";
import DailyFormTab from "@/pages/tabs/DailyFormTab";
import RemindersTab from "@/pages/tabs/RemindersTab";
import KanbanTab from "@/pages/tabs/KanbanTab";
import BusinessDataTab from "@/pages/tabs/BusinessDataTab";

type TabKey =
  | "business"
  | "kanban"
  | "clients"
  | "projects"
  | "deals"
  | "daily"
  | "reminders";

interface TabItem {
  key: TabKey;
  label: string;
  icon: React.ElementType;
}

const tabs: TabItem[] = [
  { key: "kanban", label: "看板视图", icon: LayoutGrid },
  { key: "business", label: "业务数据", icon: Database },
  { key: "daily", label: "每日表单", icon: ClipboardList },
  { key: "reminders", label: "提醒预览", icon: Bell },
];

const FULL_ACCESS_USERS = new Set(["袁晓南", "邹思敏", "黄毅", "侯昭薇", "陈凯蒂"]);

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
}

const HomeOverview: React.FC<HomeOverviewProps> = ({
  userName,
  todayLabel,
  overviewCounts,
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
        <span className="miniapp-chip">每日 10:00 提醒</span>
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
        </div>
        <div className="mt-3 grid gap-3">
          <NavLink to="daily" className="miniapp-quick">
            <ClipboardList className="h-4 w-4 text-primary" />
            <div>
              <div className="text-sm font-semibold">每日表单</div>
              <div className="text-xs text-muted-foreground">新增与更新业务数据</div>
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
  const hasFullAccess = FULL_ACCESS_USERS.has(userName);
  const defaultPath = hasFullAccess ? "/app" : "/app/kanban";
  const allowedTabs = hasFullAccess
    ? tabs
    : tabs.filter((tab) => tab.key === "kanban" || tab.key === "business");
  const guardRoute = (key: TabKey, element: React.ReactElement) =>
    hasFullAccess || key === "kanban" || key === "business" ? element : <Navigate to={defaultPath} replace />;

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

      <main className="relative z-10 flex-1 pb-32">
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
                    hasFullAccess ? (
                      <HomeOverview
                        userName={user?.name || "伙伴"}
                        todayLabel={todayLabel}
                        overviewCounts={overviewCounts}
                      />
                    ) : (
                      <Navigate to={defaultPath} replace />
                    )
                  }
                />

                <Route path="business" element={guardRoute("business", <BusinessDataTab />)} />
                <Route path="kanban" element={guardRoute("kanban", <KanbanTab />)} />
                <Route path="clients" element={guardRoute("clients", <ClientsTab />)} />
                <Route path="projects" element={guardRoute("projects", <ProjectsTab />)} />
                <Route path="deals" element={guardRoute("deals", <DealsTab />)} />
                <Route path="daily" element={guardRoute("daily", <DailyFormTab />)} />
                <Route path="reminders" element={guardRoute("reminders", <RemindersTab />)} />

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
          return (
            <NavLink
              key={tab.key}
              to={tab.key}
              className={({ isActive }) =>
                cn(
                  "miniapp-tab",
                  isActive ? "miniapp-tab-active" : "hover:text-foreground hover:bg-foreground/10"
                )
              }
            >
              <Icon className="h-5 w-5" />
              <span className="whitespace-nowrap">{tab.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
};

export default TabLayout;
