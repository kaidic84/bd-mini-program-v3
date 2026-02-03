import React, { useState, useEffect, useRef } from 'react';
import { dataService } from '@/services/dataService';
import type { Project, ProjectStage, ProjectPriority } from '@/types/bd';
import {
  BD_OPTIONS,
  PROJECT_STAGE_BADGE_CLASS,
  PROJECT_STAGE_OPTIONS,
  PROJECT_TYPE_OPTIONS,
  PROJECT_PRIORITY_OPTIONS,
  SERVICE_TYPE_OPTIONS,
} from '@/config/bdOptions';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Search, Calendar, FolderKanban } from 'lucide-react';
import { cn } from '@/lib/utils';
import { initUserProfileFromWindow, renderUserProfile } from '@/lib/feishuUserProfile';
// 飞书时间戳兜底展示
import { formatDateSafe } from '@/lib/date';
import { useAuth } from '@/contexts/AuthContext';
import { getAccess } from '@/lib/access';

const getDateValue = (raw?: string) => {
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
};

const getYearMonthValue = (raw?: string) => {
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
};

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
    return <span className={className}>{name || '-'}</span>;
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn('text-primary underline underline-offset-2', className)}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {name || '-'}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[360px] p-2">
        <div ref={mountRef} />
      </PopoverContent>
    </Popover>
  );
};

const ProjectsTab: React.FC = () => {
  const { user } = useAuth();
  const access = getAccess(String(user?.name || ""));
  const [projects, setProjects] = useState<Project[]>([]);
  const [filteredProjects, setFilteredProjects] = useState<Project[]>([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [serviceTypeFilter, setServiceTypeFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [bdFilter, setBdFilter] = useState<string>('all');
  const [monthFilter, setMonthFilter] = useState<string>('all');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [projectFilterOptions, setProjectFilterOptions] = useState({
    stages: [...PROJECT_STAGE_OPTIONS],
    types: [...PROJECT_TYPE_OPTIONS],
    serviceTypes: [...SERVICE_TYPE_OPTIONS],
    priorities: [...PROJECT_PRIORITY_OPTIONS],
    months: Array.from({ length: 12 }, (_, i) => String(i + 1)),
  });

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    let timer: number | null = null;
    const syncOptions = async () => {
      const data = await dataService.getProjectFieldOptions([
        '所属年月',
        '所属月份',
        '服务类型',
        '项目类别',
        '项目进度',
        '优先级',
      ]);
      const months =
        data['所属年月']?.length
          ? data['所属年月']
          : data['所属月份']?.length
            ? data['所属月份']
            : Array.from({ length: 12 }, (_, i) => String(i + 1));
      const next = {
        stages: data['项目进度']?.length ? data['项目进度'] : [...PROJECT_STAGE_OPTIONS],
        types: data['项目类别']?.length ? data['项目类别'] : [...PROJECT_TYPE_OPTIONS],
        serviceTypes: data['服务类型']?.length ? data['服务类型'] : [...SERVICE_TYPE_OPTIONS],
        priorities: data['优先级']?.length ? data['优先级'] : [...PROJECT_PRIORITY_OPTIONS],
        months,
      };
      setProjectFilterOptions(next);
      if (stageFilter !== 'all' && !next.stages.includes(stageFilter)) setStageFilter('all');
      if (typeFilter !== 'all' && !next.types.includes(typeFilter)) setTypeFilter('all');
      if (serviceTypeFilter !== 'all' && !next.serviceTypes.includes(serviceTypeFilter)) setServiceTypeFilter('all');
      if (priorityFilter !== 'all' && !next.priorities.includes(priorityFilter)) setPriorityFilter('all');
      if (monthFilter !== 'all' && !next.months.includes(monthFilter)) setMonthFilter('all');
    };
    syncOptions();
    timer = window.setInterval(syncOptions, 30000);
    return () => {
      if (timer) window.clearInterval(timer);
    };
  }, [monthFilter, priorityFilter, serviceTypeFilter, stageFilter, typeFilter]);

  useEffect(() => {
    filterProjects();
  }, [projects, searchKeyword, stageFilter, typeFilter, serviceTypeFilter, priorityFilter, bdFilter, monthFilter]);

  const loadProjects = async () => {
    const data = await dataService.getAllProjects();
    setProjects(data);
  };

  const filterProjects = () => {
    let result = [...projects];

    if (searchKeyword) {
      const keyword = searchKeyword.toLowerCase();
      result = result.filter((p) =>
        (p.projectName || '').toLowerCase().includes(keyword) ||
        (p.shortName || '').toLowerCase().includes(keyword) ||
        String(p.projectId || '').toLowerCase().includes(keyword),
      );
    }

    if (stageFilter !== 'all') {
      result = result.filter((p) => p.stage === stageFilter);
    }

    if (typeFilter !== 'all') {
      result = result.filter((p) => p.projectType === typeFilter);
    }

    if (serviceTypeFilter !== 'all') {
      result = result.filter((p) => p.serviceType === serviceTypeFilter);
    }

    if (priorityFilter !== 'all') {
      result = result.filter((p) => p.priority === priorityFilter);
    }

    if (bdFilter !== 'all') {
      result = result.filter((p) => p.bd === bdFilter);
    }

    if (monthFilter !== 'all') {
      const normalizeMonthKey = (raw: any) => {
        if (raw === null || raw === undefined) return '';
        const str = String(raw).trim();
        if (!str) return '';
        const match = str.match(/(\d{4})\D*?(\d{1,2})/);
        if (match) {
          const year = match[1];
          const month = String(match[2]).padStart(2, '0');
          return `${year}-${month}`;
        }
        const only = str.replace(/[^\d]/g, '');
        if (only.length >= 6) return `${only.slice(0, 4)}-${only.slice(4, 6)}`;
        if (only.length >= 5) return `${only.slice(0, 4)}-0${only.slice(4, 5)}`;
        return str;
      };
      result = result.filter((p) => normalizeMonthKey(p.month) === normalizeMonthKey(monthFilter));
    }

    result.sort((a, b) => {
      const monthDiff = getYearMonthValue(b.month) - getYearMonthValue(a.month);
      if (monthDiff !== 0) return monthDiff;
      return getDateValue(b.createdAt) - getDateValue(a.createdAt);
    });
    setFilteredProjects(result);
  };

  const handleProjectClick = (project: Project) => {
    setSelectedProject(project);
    setShowDetail(true);
  };

  const getStageBadgeClass = (stage: ProjectStage) => PROJECT_STAGE_BADGE_CLASS[stage] || '';

  const getPriorityBadgeVariant = (priority: ProjectPriority) => {
    switch (priority) {
      case 'P0':
        return 'default';
      case 'P1':
        return 'secondary';
      case 'P2':
        return 'outline';
      default:
        return 'outline';
    }
  };

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

  const controlClass = "h-[clamp(34px,3.2vw,44px)] text-[clamp(12px,1.1vw,14px)]";
  const triggerClass = `${controlClass} w-auto min-w-[120px] px-3 whitespace-nowrap shrink-0`;
  const triggerWideClass = `${controlClass} w-auto min-w-[140px] px-3 whitespace-nowrap shrink-0`;
  const cardBaseClass =
    "flex h-full min-h-[180px] flex-col justify-center gap-2 px-5 py-5 sm:min-h-[200px] sm:gap-3 sm:px-6 sm:py-6";
  const cardTitleClass = "text-[clamp(14px,1.25vw,17px)] font-medium text-foreground leading-snug";
  const cardMetaClass = "text-[clamp(11px,1vw,13px)] text-muted-foreground";
  const badgeTextClass = "text-[clamp(10px,0.9vw,12px)]";

  return (
    <div className="space-y-4">
      {/** 月份选项改为 1-12 */}
      {/* 筛选栏 */}
      <Card>
        <CardContent className="flex min-h-[88px] items-center p-4 sm:min-h-[96px] sm:p-5">
          {/** 月份使用数字 1-12 */}
          <div className="mx-auto w-full max-w-6xl">
            <div className="flex w-full flex-col gap-3">
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="搜索项目名称..."
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  className={`${controlClass} pl-9`}
                />
              </div>
              <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Select value={stageFilter} onValueChange={setStageFilter}>
                  <SelectTrigger className={cn(triggerClass, "w-full")}>
                    <SelectValue placeholder="进度" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部进度</SelectItem>
                    {projectFilterOptions.stages.map((stage) => (
                      <SelectItem key={stage} value={stage}>
                        {stage}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className={cn(triggerClass, "w-full")}>
                    <SelectValue placeholder="类别" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部类别</SelectItem>
                    {projectFilterOptions.types.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={serviceTypeFilter} onValueChange={setServiceTypeFilter}>
                  <SelectTrigger className={cn(triggerWideClass, "w-full")}>
                    <SelectValue placeholder="服务类型" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部服务</SelectItem>
                    {projectFilterOptions.serviceTypes.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                  <SelectTrigger className={cn(triggerWideClass, "w-full")}>
                    <SelectValue placeholder="优先级" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部优先级</SelectItem>
                    {projectFilterOptions.priorities.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={bdFilter} onValueChange={setBdFilter}>
                  <SelectTrigger className={cn(triggerWideClass, "w-full")}>
                    <SelectValue placeholder="BD" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部BD</SelectItem>
                    {BD_OPTIONS.map((bd) => (
                      <SelectItem key={bd} value={bd}>
                        {bd}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={monthFilter} onValueChange={setMonthFilter}>
                  <SelectTrigger className={cn(triggerClass, "w-full")}>
                    <SelectValue placeholder="月份" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部月份</SelectItem>
                    {projectFilterOptions.months.map((month) => (
                      <SelectItem key={month} value={month}>
                        {month}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filteredProjects.map((project) => (
          <Card
            key={project.projectId}
            className="cursor-pointer transition-all hover:shadow-md hover:border-primary/50"
            onClick={() => handleProjectClick(project)}
          >
            <CardContent className={cardBaseClass}>
              <div className="flex items-start justify-between mb-2 gap-2">
                <div className="min-w-0">
                  <div className={cn("line-clamp-2", cardTitleClass)}>
                    {project.projectName || '-'}
                  </div>
                  <div className={cn("mt-1 font-mono", cardMetaClass)}>
                    {project.projectId}
                  </div>
                </div>
                <Badge
                  variant={getPriorityBadgeVariant(project.priority)}
                  className={cn("text-xs shrink-0", badgeTextClass)}
                >
                  {project.priority || '-'}
                </Badge>
              </div>

              <div className="flex flex-wrap gap-2 mt-2 sm:mt-3">
                <Badge variant="outline" className={cn("text-xs", badgeTextClass)}>
                  {project.serviceType || '-'}
                </Badge>
                <Badge variant="outline" className={cn("text-xs", badgeTextClass)}>
                  {project.projectType || '-'}
                </Badge>
                <Badge
                  variant="outline"
                  className={cn('text-xs', badgeTextClass, getStageBadgeClass(project.stage))}
                >
                  {project.stage || '-'}
                </Badge>
              </div>

              <div className={cn("mt-2 flex items-center justify-between", cardMetaClass)}>
                <span>
                  BD: <UserProfileName name={project.bd || '-'} openId={project.bdOpenId} />
                  <span className="ml-2">AM: {project.am || '-'}</span>
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {formatDateSafe(project.createdAt) || '-'}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredProjects.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">暂无项目数据</div>
      )}

      {/* 详情弹窗 */}
            {/* 详情弹窗 */}
            {/* 详情弹窗 */}
      <Dialog open={showDetail} onOpenChange={setShowDetail}>
        <DialogContent className="max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderKanban className="h-5 w-5" />
              {selectedProject?.projectName || '项目详情'}
            </DialogTitle>
          </DialogHeader>

          {selectedProject && (
            <ScrollArea className="max-h-[calc(90vh-100px)]">
              <div className="space-y-4">
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm">基本信息</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-muted-foreground">项目ID：</span>
                        <span className="font-mono">{selectedProject.projectId || '-'}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">客户ID：</span>
                        <span className="font-mono">{selectedProject.customerId || '-'}</span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-muted-foreground">项目名称：</span>
                        <span>{selectedProject.projectName || '-'}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">客户/部门简称：</span>
                        <span>{selectedProject.shortName || '-'}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">服务类型：</span>
                        <span>{selectedProject.serviceType || '-'}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">项目类别：</span>
                        <Badge variant="outline" className="ml-2">
                          {selectedProject.projectType || '-'}
                        </Badge>
                      </div>
                      <div>
                        <span className="text-muted-foreground">项目进度：</span>
                        <Badge
                          variant="outline"
                          className={cn('ml-2', getStageBadgeClass(selectedProject.stage))}
                        >
                          {selectedProject.stage || '-'}
                        </Badge>
                      </div>
                      <div>
                        <span className="text-muted-foreground">优先级：</span>
                        <Badge variant={getPriorityBadgeVariant(selectedProject.priority)} className="ml-2">
                          {selectedProject.priority || '-'}
                        </Badge>
                      </div>
                      <div>
                        <span className="text-muted-foreground">所属年月：</span>
                        <span>{selectedProject.month || '-'}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">活动&交付名称：</span>
                        <span>{selectedProject.campaignName || '-'}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">平台：</span>
                        <span>{selectedProject.platform || selectedProject.deliverableName || '-'}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">BD：</span>
                        <span>{selectedProject.bd || '-'}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">AM：</span>
                        <span>{selectedProject.am || '-'}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm">进阶信息</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-muted-foreground">预估项目金额：</span>
                        <span>{access.canProjectAmount ? formatCurrency(selectedProject.expectedAmount) : "已锁定"}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">累计商务时间(hr)：</span>
                        <span>{selectedProject.totalBdHours ?? '-'}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">最近更新日期：</span>
                        <span>{formatDateSafe(selectedProject.lastUpdateDate) || '-'}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">距上次更新天数：</span>
                        <span>{Number.isFinite(selectedProject.daysSinceUpdate) ? selectedProject.daysSinceUpdate : '-'}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">创建时间：</span>
                        <span>{formatDateSafe(selectedProject.createdAt) || '-'}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>



    </div>
  );
};

export default ProjectsTab;
