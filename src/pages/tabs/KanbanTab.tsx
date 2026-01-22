import React, { useEffect, useMemo, useState } from 'react';
import { Cell, Pie, PieChart } from 'recharts';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { dataService } from '@/services/dataService';
import { AlertTriangle, Building2, Calendar, FileCheck, FolderKanban, Users } from 'lucide-react';

const VIVID_COLORS = [
  '#2563eb',
  '#16a34a',
  '#f97316',
  '#dc2626',
  '#8b5cf6',
  '#0ea5e9',
  '#eab308',
  '#db2777',
  '#14b8a6',
  '#84cc16',
  '#f43f5e',
  '#4f46e5',
  '#06b6d4',
  '#a855f7',
  '#f59e0b',
  '#22c55e',
];

const COLOR_OVERRIDES: Record<string, string> = {
  潜在: '#2563eb',
  合作中: '#16a34a',
};

const hashLabel = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const resolveColor = (label: string, used: Set<string>, fallbackIndex: number) => {
  const override = COLOR_OVERRIDES[label];
  if (override) {
    used.add(override);
    return override;
  }

  const key = label || `label-${fallbackIndex}`;
  const hash = hashLabel(key);
  for (let offset = 0; offset < VIVID_COLORS.length; offset += 1) {
    const color = VIVID_COLORS[(hash + offset) % VIVID_COLORS.length];
    if (!used.has(color)) {
      used.add(color);
      return color;
    }
  }

  const hue = (hash + fallbackIndex * 37) % 360;
  const color = `hsl(${hue}, 80%, 50%)`;
  used.add(color);
  return color;
};

const buildLegendConfig = (data: Array<{ name: string }>): ChartConfig =>
  data.reduce((acc, item) => {
    acc[item.name] = { label: item.name };
    return acc;
  }, {} as ChartConfig);

const KanbanTab: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<{
    totalClients: number;
    totalDeals: number;
    activeProjects: number;
    reminderRisk: number;
    annualClients: number;
    monthlyLeads: number;
    monthLabel: string;
    cooperationData: Array<{ name: string; value: number; fill: string }>;
    industryData: Array<{ name: string; value: number; fill: string }>;
  } | null>(null);

  const cooperationConfig = useMemo(
    () => buildLegendConfig(snapshot?.cooperationData ?? []),
    [snapshot?.cooperationData]
  );
  const industryConfig = useMemo(
    () => buildLegendConfig(snapshot?.industryData ?? []),
    [snapshot?.industryData]
  );

  useEffect(() => {
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

    const normalizeLabel = (value: unknown) => {
      const label = String(value ?? '').trim();
      return label || '未填写';
    };

    const buildPieData = <T,>(items: T[], picker: (item: T) => unknown) => {
      const map = new Map<string, number>();
      items.forEach((item) => {
        const label = normalizeLabel(picker(item));
        map.set(label, (map.get(label) || 0) + 1);
      });

      const usedColors = new Set<string>();
      return Array.from(map.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([name, value], index) => ({
          name,
          value,
          fill: resolveColor(name, usedColors, index),
        }));
    };

    const loadDashboard = async () => {
      try {
        setLoading(true);
        setError(null);
        const [clients, projects, deals, unfinished, finished, signed] = await Promise.all([
          dataService.getAllClients(),
          dataService.getAllProjects(),
          dataService.getAllDeals(),
          dataService.getUnfinishedReminders(),
          dataService.getFinishedReminders(),
          dataService.getSignedReminders(),
        ]);

        const inactiveStages = new Set(['丢单', 'FA', '已完成', '已暂停']);
        const activeProjects = projects.filter((project) => {
          const stage = String(project.stage || '').trim();
          return stage ? !inactiveStages.has(stage) : true;
        }).length;

        const redCount =
          unfinished.filter((item) => item.reminderLevel === 'red').length +
          finished.filter((item) => item.reminderLevel === 'red').length +
          signed.length;
        const yellowCount =
          unfinished.filter((item) => item.reminderLevel === 'yellow').length +
          finished.filter((item) => item.reminderLevel === 'yellow').length;

        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        const monthLabel = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}`;
        const monthlyLeads = clients.filter((client) => {
          const date = parseDate(client.createdAt);
          if (!date) return false;
          return date >= monthStart && date <= monthEnd;
        }).length;

        const annualClients = clients.filter((client) => Boolean(client.isAnnual)).length;
        const cooperationData = buildPieData(clients, (client) => client.cooperationStatus ?? client.status);
        const industryData = buildPieData(clients, (client) => client.industry);

        setSnapshot({
          totalClients: clients.length,
          totalDeals: deals.length,
          activeProjects,
          reminderRisk: redCount + yellowCount,
          annualClients,
          monthlyLeads,
          monthLabel,
          cooperationData,
          industryData,
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e ?? '');
        setError(message || '加载仪表盘失败');
      } finally {
        setLoading(false);
      }
    };

    void loadDashboard();
  }, []);

  return (
    <div className="space-y-4">
      {loading && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Card key={`skeleton-${index}`}>
              <CardContent className="space-y-3 pt-4">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-7 w-16" />
                <Skeleton className="h-3 w-28" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!loading && error && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {error}
          </CardContent>
        </Card>
      )}

      {!loading && !error && snapshot && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="border-border/70 bg-card/80">
              <CardContent className="space-y-2 pt-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Users className="h-4 w-4" />
                  客户总数
                </div>
                <div className="text-2xl font-semibold text-foreground tabular-nums">
                  {snapshot.totalClients}
                </div>
                <div className="text-xs text-muted-foreground">覆盖全量客户关系</div>
              </CardContent>
            </Card>
            <Card className="border-border/70 bg-card/80">
              <CardContent className="space-y-2 pt-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <FolderKanban className="h-4 w-4" />
                  活跃项目
                </div>
                <div className="text-2xl font-semibold text-foreground tabular-nums">
                  {snapshot.activeProjects}
                </div>
                <div className="text-xs text-muted-foreground">进行中与待推进项目</div>
              </CardContent>
            </Card>
            <Card className="border-border/70 bg-card/80">
              <CardContent className="space-y-2 pt-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <FileCheck className="h-4 w-4" />
                  立项累计
                </div>
                <div className="text-2xl font-semibold text-foreground tabular-nums">
                  {snapshot.totalDeals}
                </div>
                <div className="text-xs text-muted-foreground">签约/立项状态跟踪</div>
              </CardContent>
            </Card>
            <Card className="border-border/70 bg-card/80">
              <CardContent className="space-y-2 pt-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  提醒风险
                </div>
                <div className="text-2xl font-semibold text-foreground tabular-nums">
                  {snapshot.reminderRisk}
                </div>
                <div className="text-xs text-muted-foreground">红色 + 黄色提醒</div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2">
            <Card className="border-border/70 bg-card/80">
              <CardContent className="space-y-2 pt-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Building2 className="h-4 w-4" />
                  年框客户
                </div>
                <div className="text-2xl font-semibold text-foreground tabular-nums">
                  {snapshot.annualClients}
                </div>
                <div className="text-xs text-muted-foreground">客户数据表标记为年框的客户</div>
              </CardContent>
            </Card>
            <Card className="border-border/70 bg-card/80">
              <CardContent className="space-y-2 pt-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  {snapshot.monthLabel} 当月线索
                </div>
                <div className="text-2xl font-semibold text-foreground tabular-nums">
                  {snapshot.monthlyLeads}
                </div>
                <div className="text-xs text-muted-foreground">按客户创建时间统计</div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border-border/70 bg-card/80">
              <CardHeader>
                <CardTitle className="text-base">客户合作状态</CardTitle>
              </CardHeader>
              <CardContent className="pt-2">
                {snapshot.cooperationData.length === 0 ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">暂无数据</div>
                ) : (
                  <ChartContainer config={cooperationConfig} className="h-[260px] w-full !aspect-auto">
                    <PieChart>
                      <ChartTooltip content={<ChartTooltipContent nameKey="name" />} />
                      <Pie
                        data={snapshot.cooperationData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={0}
                        stroke="transparent"
                        strokeWidth={0}
                      >
                        {snapshot.cooperationData.map((entry) => (
                          <Cell key={entry.name} fill={entry.fill} />
                        ))}
                      </Pie>
                      <ChartLegend content={<ChartLegendContent nameKey="name" />} />
                    </PieChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
            <Card className="border-border/70 bg-card/80">
              <CardHeader>
                <CardTitle className="text-base">客户行业占比</CardTitle>
              </CardHeader>
              <CardContent className="pt-2">
                {snapshot.industryData.length === 0 ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">暂无数据</div>
                ) : (
                  <ChartContainer config={industryConfig} className="h-[260px] w-full !aspect-auto">
                    <PieChart>
                      <ChartTooltip content={<ChartTooltipContent nameKey="name" />} />
                      <Pie
                        data={snapshot.industryData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={0}
                        stroke="transparent"
                        strokeWidth={0}
                      >
                        {snapshot.industryData.map((entry) => (
                          <Cell key={entry.name} fill={entry.fill} />
                        ))}
                      </Pie>
                      <ChartLegend content={<ChartLegendContent nameKey="name" className="flex-wrap" />} />
                    </PieChart>
                  </ChartContainer>
                )}
                <div className="mt-2 text-xs text-muted-foreground">按客户数据表行业大类统计</div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
};

export default KanbanTab;
