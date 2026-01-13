import React, { useState, useEffect, useCallback, useRef } from 'react';
import { dataService } from '@/services/dataService';
import type { UnfinishedReminderItem, FinishedReminderItem, SignedReminderItem, ReminderLevel } from '@/types/bd';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Bell, AlertTriangle, Calendar, Clock, CheckCircle2, FileText, FolderOpen, FileCheck } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { initUserProfileFromWindow, renderUserProfile } from '@/lib/feishuUserProfile';
import { formatDateSafe } from '@/lib/date';
import { useAuth } from '@/contexts/AuthContext';

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

const matchBdName = (value: unknown, expected: string) => {
  const target = String(expected || '').trim();
  if (!target) return true;
  if (Array.isArray(value)) {
    return value.map((v) => String(v || '').trim()).filter(Boolean).includes(target);
  }
  const raw = String(value || '').trim();
  if (!raw) return false;
  if (raw === target) return true;
  const parts = raw.split(/[\s,，、/]+/).map((v) => v.trim()).filter(Boolean);
  return parts.includes(target);
};

const toInputDate = (value?: string) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(raw)) return raw.replace(/\//g, '-');
  const normalized = raw.replace(/[./]/g, '-');
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return '';
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const RemindersTab: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'unfinished' | 'finished' | 'signed'>('unfinished');
  const [unfinishedReminders, setUnfinishedReminders] = useState<UnfinishedReminderItem[]>([]);
  const [finishedReminders, setFinishedReminders] = useState<FinishedReminderItem[]>([]);
  const [signedReminders, setSignedReminders] = useState<SignedReminderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmingIds, setConfirmingIds] = useState<Set<string>>(new Set());
  const [updatingStageIds, setUpdatingStageIds] = useState<Set<string>>(new Set());
  const [updatingDealIds, setUpdatingDealIds] = useState<Set<string>>(new Set());
  const [finishingDealIds, setFinishingDealIds] = useState<Set<string>>(new Set());
  const [dealEndDateDrafts, setDealEndDateDrafts] = useState<Record<string, string>>({});

  const formatTodaySlash = () => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}/${mm}/${dd}`;
  };

  const loadReminders = useCallback(async () => {
    setLoading(true);
    try {
      const [unfinished, finished, signed] = await Promise.all([
        dataService.getUnfinishedReminders(),
        dataService.getFinishedReminders(),
        dataService.getSignedReminders(),
      ]);
      const userBdName = String(user?.name || '').trim();
      const filterByUser = <T extends { bd?: string }>(items: T[]) =>
        userBdName ? items.filter((item) => matchBdName(item.bd, userBdName)) : items;
      setUnfinishedReminders(filterByUser(unfinished));
      setFinishedReminders(filterByUser(finished));
      setSignedReminders(filterByUser(signed));
    } catch (error) {
      console.error('加载提醒数据失败:', error);
      toast.error('加载提醒数据失败');
    } finally {
      setLoading(false);
    }
  }, [user?.name]);

  useEffect(() => {
    loadReminders();
  }, [loadReminders]);

  const removeReminderByProjectId = (projectId: string) => {
    setUnfinishedReminders((prev) => prev.filter((item) => item.projectId !== projectId));
    setFinishedReminders((prev) => prev.filter((item) => item.projectId !== projectId));
  };

  const handleConfirmFollowUp = async (projectId: string) => {
    setConfirmingIds(prev => new Set(prev).add(projectId));
    try {
      const success = await dataService.confirmFollowUp(projectId);
      if (success) {
        toast.success('已确认跟进，项目从列表中移除');
        removeReminderByProjectId(projectId);
      } else {
        toast.error('确认跟进失败');
      }
    } catch (error) {
      console.error('确认跟进失败:', error);
      toast.error('确认跟进失败');
    } finally {
      setConfirmingIds(prev => {
        const next = new Set(prev);
        next.delete(projectId);
        return next;
      });
    }
  };

  const handleUpdateStage = async (projectId: string, nextStage: 'FA' | '丢单') => {
    setUpdatingStageIds(prev => new Set(prev).add(projectId));
    try {
      const success = await dataService.updateProject(projectId, {
        stage: nextStage,
        lastUpdateDate: formatTodaySlash(),
      });
      if (success) {
        toast.success(`项目阶段已更新为 ${nextStage}`);
        setUnfinishedReminders((prev) => prev.filter((item) => item.projectId !== projectId));
      } else {
        toast.error('更新项目阶段失败');
      }
    } catch (error) {
      console.error('更新项目阶段失败:', error);
      toast.error('更新项目阶段失败');
    } finally {
      setUpdatingStageIds(prev => {
        const next = new Set(prev);
        next.delete(projectId);
        return next;
      });
    }
  };

  const handleEndDateChange = (dealId: string, nextValue: string) => {
    setDealEndDateDrafts((prev) => ({ ...prev, [dealId]: nextValue }));
  };

  const handleSaveEndDate = async (item: FinishedReminderItem) => {
    if (!item.dealId) {
      toast.error('缺少立项ID，无法更新结束时间');
      return;
    }
    const draft = dealEndDateDrafts[item.dealId] ?? toInputDate(item.projectEndDate);
    if (!draft) {
      toast.error('请选择项目结束时间');
      return;
    }
    setUpdatingDealIds((prev) => new Set(prev).add(item.dealId));
    try {
      const success = await dataService.updateDeal(item.dealId, { endDate: draft });
      if (success) {
        toast.success('项目结束时间已更新');
        setDealEndDateDrafts((prev) => ({ ...prev, [item.dealId]: draft }));
        await loadReminders();
      } else {
        toast.error('更新项目结束时间失败');
      }
    } catch (error) {
      console.error('更新项目结束时间失败:', error);
      toast.error('更新项目结束时间失败');
    } finally {
      setUpdatingDealIds((prev) => {
        const next = new Set(prev);
        next.delete(item.dealId);
        return next;
      });
    }
  };

  const handleMarkDealFinished = async (item: FinishedReminderItem) => {
    if (!item.dealId) {
      toast.error('缺少立项ID，无法更新是否完结');
      return;
    }
    setFinishingDealIds((prev) => new Set(prev).add(item.dealId));
    setUpdatingDealIds((prev) => new Set(prev).add(item.dealId));
    try {
      const success = await dataService.updateDeal(item.dealId, { isFinished: '是' });
      if (success) {
        toast.success('已标记为完结');
        setFinishedReminders((prev) => prev.filter((reminder) => reminder.dealId !== item.dealId));
        setFinishingDealIds((prev) => {
          const next = new Set(prev);
          next.delete(item.dealId);
          return next;
        });
        await loadReminders();
      } else {
        toast.error('更新是否完结失败');
        setFinishingDealIds((prev) => {
          const next = new Set(prev);
          next.delete(item.dealId);
          return next;
        });
      }
    } catch (error) {
      console.error('更新是否完结失败:', error);
      toast.error('更新是否完结失败');
      setFinishingDealIds((prev) => {
        const next = new Set(prev);
        next.delete(item.dealId);
        return next;
      });
    } finally {
      setUpdatingDealIds((prev) => {
        const next = new Set(prev);
        next.delete(item.dealId);
        return next;
      });
    }
  };

  const getReminderBadge = (level: ReminderLevel) => {
    switch (level) {
      case 'red':
        return (
          <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 text-xs">
            红色提醒
          </Badge>
        );
      case 'yellow':
        return (
          <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30 text-xs">
            黄色提醒
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="bg-muted text-muted-foreground border-muted-foreground/30 text-xs">
            普通提醒
          </Badge>
        );
    }
  };

  const getStageBadgeClass = (stage: string) => {
    switch (stage) {
      case 'POC':
        return 'bg-warning/10 text-warning border-warning/30';
      case '谈判':
        return 'bg-success/10 text-success border-success/30';
      case '方案&报价':
        return 'bg-primary/10 text-primary border-primary/30';
      case '需求确认':
        return 'bg-info/10 text-info border-info/30';
      default:
        return '';
    }
  };

  const getProjectTypeBadgeClass = (type: string) => {
    switch (type) {
      case 'POC':
        return 'bg-warning/10 text-warning border-warning/30';
      case '签单':
        return 'bg-success/10 text-success border-success/30';
      default:
        return 'bg-muted text-muted-foreground border-muted-foreground/30';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">加载中...</div>
      </div>
    );
  }

  const totalReminders = unfinishedReminders.length + finishedReminders.length + signedReminders.length;

  return (
    <div className="space-y-4">
      {/* 统计卡片 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Bell className="h-5 w-5" />
            提醒预览
          </CardTitle>
          <CardDescription>
            系统将在每日早上 10:00 向 BD 发送汇总提醒通知
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              <span className="text-lg font-semibold">{totalReminders}</span>
              <span className="text-muted-foreground">个项目需要提醒</span>
            </div>
            <div className="text-sm text-muted-foreground">
              （进行中 {unfinishedReminders.length} / 已签单 {signedReminders.length} / 已立项 {finishedReminders.length}）
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 子 Tab 切换 */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'unfinished' | 'finished' | 'signed')}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="unfinished" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            进行中项目
            {unfinishedReminders.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                {unfinishedReminders.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="signed" className="flex items-center gap-2">
            <FileCheck className="h-4 w-4" />
            已签单项目
            {signedReminders.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                {signedReminders.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="finished" className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4" />
            已立项项目
            {finishedReminders.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                {finishedReminders.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* 进行中项目列表 */}
        <TabsContent value="unfinished" className="mt-4">
          {unfinishedReminders.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <CheckCircle2 className="h-12 w-12 opacity-30" />
                  <p>暂无需要提醒的进行中项目</p>
                  <p className="text-sm">所有项目都在正常跟进中</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* PC端表格 */}
              <div className="hidden md:block">
                <Card>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[200px]">项目名称</TableHead>
                          <TableHead className="w-[80px]">客户</TableHead>
                          <TableHead className="w-[60px]">BD</TableHead>
                          <TableHead className="w-[70px]">项目类别</TableHead>
                          <TableHead className="w-[80px]">项目阶段</TableHead>
                          <TableHead className="w-[90px]">最近更新</TableHead>
                          <TableHead className="w-[80px]">提醒状态</TableHead>
                          <TableHead className="w-[160px]">操作</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {unfinishedReminders.map(item => (
                          <TableRow key={item.projectId}>
                            <TableCell className="max-w-[200px] truncate font-medium" title={item.projectName}>
                              {item.projectName}
                            </TableCell>
                            <TableCell>{item.shortName}</TableCell>
                            <TableCell>
                              <UserProfileName name={item.bd || '-'} openId={item.bdOpenId} />
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={cn('text-xs', getProjectTypeBadgeClass(item.projectType))}>
                                {item.projectType}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={cn('text-xs', getStageBadgeClass(item.stage))}>
                                {item.stage}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {formatDateSafe(item.lastUpdateDate) || '-'}
                              <div className="text-destructive">({item.daysSinceUpdate}天前)</div>
                            </TableCell>
                            <TableCell>
                              {getReminderBadge(item.reminderLevel)}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-2">
                                  <Checkbox
                                    checked={Boolean(item.isFollowedUp) || confirmingIds.has(item.projectId)}
                                    onCheckedChange={() => handleConfirmFollowUp(item.projectId)}
                                    disabled={
                                      Boolean(item.isFollowedUp) ||
                                      confirmingIds.has(item.projectId) ||
                                      updatingStageIds.has(item.projectId)
                                    }
                                  />
                                  <span className="text-xs text-muted-foreground">已跟进</span>
                                </div>
                                {item.stage === '停滞' && (
                                  <div className="flex items-center gap-2">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="h-7 px-2 text-xs"
                                      onClick={() => handleUpdateStage(item.projectId, 'FA')}
                                      disabled={updatingStageIds.has(item.projectId)}
                                    >
                                      FA
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="h-7 px-2 text-xs"
                                      onClick={() => handleUpdateStage(item.projectId, '丢单')}
                                      disabled={updatingStageIds.has(item.projectId)}
                                    >
                                      丢单
                                    </Button>
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>

              {/* 移动端卡片 */}
              <div className="md:hidden space-y-3">
                {unfinishedReminders.map(item => (
                  <Card key={item.projectId}>
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm line-clamp-2">{item.projectName}</div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {item.shortName} - <UserProfileName name={item.bd || '-'} openId={item.bdOpenId} />
                          </div>
                        </div>
                        {getReminderBadge(item.reminderLevel)}
                      </div>

                      <div className="flex flex-wrap gap-2 mt-2">
                        <Badge variant="outline" className={cn('text-xs', getProjectTypeBadgeClass(item.projectType))}>
                          {item.projectType}
                        </Badge>
                        <Badge variant="outline" className={cn('text-xs', getStageBadgeClass(item.stage))}>
                          {item.stage}
                        </Badge>
                      </div>

                      <div className="flex flex-wrap gap-3 mt-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          更新: {formatDateSafe(item.lastUpdateDate) || '-'}
                          <span className="text-destructive">({item.daysSinceUpdate}天前)</span>
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center justify-end gap-2 mt-3 pt-3 border-t">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleConfirmFollowUp(item.projectId)}
                          disabled={
                            Boolean(item.isFollowedUp) ||
                            confirmingIds.has(item.projectId) ||
                            updatingStageIds.has(item.projectId)
                          }
                          className="h-8 text-xs"
                        >
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          确认已跟进
                        </Button>
                        {item.stage === '停滞' && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleUpdateStage(item.projectId, 'FA')}
                              disabled={updatingStageIds.has(item.projectId)}
                              className="h-8 text-xs"
                            >
                              FA
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleUpdateStage(item.projectId, '丢单')}
                              disabled={updatingStageIds.has(item.projectId)}
                              className="h-8 text-xs"
                            >
                              丢单
                            </Button>
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </TabsContent>

        {/* 已立项项目列表 */}
        <TabsContent value="finished" className="mt-4">
          {finishedReminders.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <CheckCircle2 className="h-12 w-12 opacity-30" />
                  <p>暂无需要提醒的已立项项目</p>
                  <p className="text-sm">所有项目结束时间都在 7 天以后</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* PC端表格 */}
              <div className="hidden md:block">
                <Card>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[200px]">项目名称</TableHead>
                          <TableHead className="w-[80px]">客户</TableHead>
                          <TableHead className="w-[60px]">BD</TableHead>
                          <TableHead className="w-[100px]">项目结束时间</TableHead>
                          <TableHead className="w-[80px]">提醒状态</TableHead>
                          <TableHead className="w-[80px]">操作</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {finishedReminders.map(item => (
                          <TableRow key={item.dealId}>
                            <TableCell className="max-w-[200px] truncate font-medium" title={item.projectName}>
                              {item.projectName}
                            </TableCell>
                            <TableCell>{item.shortName}</TableCell>
                            <TableCell>
                              <UserProfileName name={item.bd || '-'} openId={item.bdOpenId} />
                            </TableCell>
                            <TableCell className="text-xs">
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                  <Input
                                    type="date"
                                    value={dealEndDateDrafts[item.dealId] ?? toInputDate(item.projectEndDate)}
                                    onChange={(e) => handleEndDateChange(item.dealId, e.target.value)}
                                    className="h-7 w-[140px] text-xs"
                                  />
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-7 px-2 text-xs"
                                    onClick={() => handleSaveEndDate(item)}
                                    disabled={updatingDealIds.has(item.dealId)}
                                  >
                                    保存
                                  </Button>
                                </div>
                                <div className={cn(
                                  item.daysUntilEnd < 0 ? 'text-destructive' :
                                  item.daysUntilEnd === 0 ? 'text-warning' : 'text-muted-foreground'
                                )}>
                                  {item.daysUntilEnd < 0
                                    ? `(已过期 ${Math.abs(item.daysUntilEnd)} 天)`
                                    : item.daysUntilEnd === 0
                                      ? '(今天到期)'
                                      : `(还剩${item.daysUntilEnd}天)`}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              {getReminderBadge(item.reminderLevel)}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-2">
                                  <Checkbox
                                    checked={Boolean(item.isFollowedUp) || confirmingIds.has(item.projectId)}
                                    onCheckedChange={() => handleConfirmFollowUp(item.projectId)}
                                    disabled={Boolean(item.isFollowedUp) || confirmingIds.has(item.projectId)}
                                  />
                                  <span className="text-xs text-muted-foreground">已跟进</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Checkbox
                                    checked={finishingDealIds.has(item.dealId)}
                                    onCheckedChange={(checked) => {
                                      if (checked !== true) return;
                                      handleMarkDealFinished(item);
                                    }}
                                    disabled={updatingDealIds.has(item.dealId)}
                                  />
                                  <span className="text-xs text-muted-foreground">是否完结</span>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>

              {/* 移动端卡片 */}
              <div className="md:hidden space-y-3">
                {finishedReminders.map(item => (
                  <Card key={item.dealId}>
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm line-clamp-2">{item.projectName}</div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {item.shortName} - <UserProfileName name={item.bd || '-'} openId={item.bdOpenId} />
                          </div>
                        </div>
                        {getReminderBadge(item.reminderLevel)}
                      </div>

                      <div className="flex items-center gap-2 mt-3 text-xs">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        <span>结束时间:</span>
                        <Input
                          type="date"
                          value={dealEndDateDrafts[item.dealId] ?? toInputDate(item.projectEndDate)}
                          onChange={(e) => handleEndDateChange(item.dealId, e.target.value)}
                          className="h-7 w-[140px] text-xs"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => handleSaveEndDate(item)}
                          disabled={updatingDealIds.has(item.dealId)}
                        >
                          保存
                        </Button>
                      </div>
                      <div className={cn(
                        'mt-2 text-xs',
                        item.daysUntilEnd < 0 ? 'text-destructive' :
                        item.daysUntilEnd === 0 ? 'text-warning' : 'text-muted-foreground'
                      )}>
                        {item.daysUntilEnd < 0
                          ? `(已过期 ${Math.abs(item.daysUntilEnd)} 天)`
                          : item.daysUntilEnd === 0
                            ? '(今天到期)'
                            : `(还剩${item.daysUntilEnd}天)`}
                      </div>

                      <div className="flex flex-col gap-2 mt-3 pt-3 border-t">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={finishingDealIds.has(item.dealId)}
                            onCheckedChange={(checked) => {
                              if (checked !== true) return;
                              handleMarkDealFinished(item);
                            }}
                            disabled={updatingDealIds.has(item.dealId)}
                          />
                          <span className="text-xs text-muted-foreground">是否完结</span>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleConfirmFollowUp(item.projectId)}
                          disabled={Boolean(item.isFollowedUp) || confirmingIds.has(item.projectId)}
                          className="h-8 text-xs"
                        >
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          确认已跟进
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </TabsContent>

        {/* 已签单项目列表 */}
        <TabsContent value="signed" className="mt-4">
          {signedReminders.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <CheckCircle2 className="h-12 w-12 opacity-30" />
                  <p>暂无需要提醒的已签单项目</p>
                  <p className="text-sm">所有已签单项目都已及时更新</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* PC端表格 */}
              <div className="hidden md:block">
                <Card>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[220px]">项目名称</TableHead>
                          <TableHead className="w-[100px]">客户</TableHead>
                          <TableHead className="w-[120px]">最近更新</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {signedReminders.map((item) => (
                          <TableRow key={item.dealId || item.projectId}>
                            <TableCell className="max-w-[220px] truncate font-medium" title={item.projectName}>
                              {item.projectName}
                            </TableCell>
                            <TableCell>{item.shortName || '-'}</TableCell>
                            <TableCell className="text-destructive text-xs">24小时未更新</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>

              {/* 移动端卡片 */}
              <div className="md:hidden space-y-3">
                {signedReminders.map((item) => (
                  <Card key={item.dealId || item.projectId}>
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm line-clamp-2">{item.projectName}</div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {item.shortName || '-'}
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-destructive">24小时未更新</div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* 提醒规则说明 */}
      <Card className="bg-muted/50">
        <CardContent className="pt-4">
          <div className="text-xs text-muted-foreground space-y-2">
            <p className="font-medium">📋 提醒规则说明：</p>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <p className="font-medium mb-1">进行中项目：</p>
                <ul className="list-disc list-inside ml-2 space-y-0.5">
                  <li>仅对 <strong>POC、方案&报价</strong> 类别启用提醒</li>
                  <li><strong>FA、丢单</strong> 阶段不设提醒</li>
                  <li>每 <strong>4 个自然日</strong> 未跟新触发提醒</li>
                  <li>超过<strong>7 个自然日</strong>未更新 → 黄色提醒</li>
                  <li>超过<strong>14 个自然日</strong>未更新 → 红色提醒</li>
                </ul>
              </div>
              <div>
                <p className="font-medium mb-1">已签单项目：</p>
                <div className="ml-2 text-xs text-muted-foreground">最后更新时间超过 1 个工作日 → 红色提醒</div>
                <p className="font-medium mt-3">已立项项目：</p>
                <ul className="list-disc list-inside ml-2 space-y-0.5">
                  <li>结束时间 = 今日 → 黄色提醒</li>
                  <li>已过结束时间 → 红色提醒</li>
                </ul>
              </div>
            </div>
            <p className="mt-3">📢 <strong>飞书通知：</strong>系统将在每日早上 10:00 向各 BD 发送汇总提醒（当前为模拟功能）</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default RemindersTab;
