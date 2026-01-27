import React, { useState, useEffect, useCallback, useRef } from 'react';
import { dataService } from '@/services/dataService';
import type {
  UnfinishedReminderItem,
  FinishedReminderItem,
  SignedReminderItem,
  ReceivableReminderItem,
  ReminderLevel,
} from '@/types/bd';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Bell, AlertTriangle, Calendar, Clock, CheckCircle2, FileText, FolderOpen, FileCheck, Wallet } from 'lucide-react';
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
  const [activeTab, setActiveTab] = useState<'unfinished' | 'receivable' | 'deal'>('unfinished');
  const [dealTab, setDealTab] = useState<'signed' | 'finished'>('signed');
  const [unfinishedReminders, setUnfinishedReminders] = useState<UnfinishedReminderItem[]>([]);
  const [receivableReminders, setReceivableReminders] = useState<ReceivableReminderItem[]>([]);
  const [finishedReminders, setFinishedReminders] = useState<FinishedReminderItem[]>([]);
  const [signedReminders, setSignedReminders] = useState<SignedReminderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmingIds, setConfirmingIds] = useState<Set<string>>(new Set());
  const [updatingStageIds, setUpdatingStageIds] = useState<Set<string>>(new Set());
  const [updatingDealIds, setUpdatingDealIds] = useState<Set<string>>(new Set());
  const [finishingDealIds, setFinishingDealIds] = useState<Set<string>>(new Set());
  const [dealEndDateDrafts, setDealEndDateDrafts] = useState<Record<string, string>>({});
  const [nextPaymentDateDrafts, setNextPaymentDateDrafts] = useState<Record<string, string>>({});
  const [updatingNextPaymentIds, setUpdatingNextPaymentIds] = useState<Set<string>>(new Set());
  const [receivedAmountDrafts, setReceivedAmountDrafts] = useState<Record<string, string>>({});
  const [updatingReceivedIds, setUpdatingReceivedIds] = useState<Set<string>>(new Set());
  const [updatingReceivableFollowIds, setUpdatingReceivableFollowIds] = useState<Set<string>>(new Set());
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);
  const [receiptDialogItem, setReceiptDialogItem] = useState<ReceivableReminderItem | null>(null);
  const [receiptDialogAmount, setReceiptDialogAmount] = useState<number | null>(null);
  const [receiptDialogDate, setReceiptDialogDate] = useState('');
  const userBdName = String(user?.name || '').trim();
  const filterByUser = <T extends { bd?: string },>(items: T[]) =>
    userBdName ? items.filter((item) => matchBdName(item.bd, userBdName)) : items;

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
      const [unfinished, finished, signed, receivable] = await Promise.all([
        dataService.getUnfinishedReminders(),
        dataService.getFinishedReminders(),
        dataService.getSignedReminders(),
        dataService.getReceivableReminders(),
      ]);
      setUnfinishedReminders(filterByUser(unfinished));
      setFinishedReminders(filterByUser(finished));
      setSignedReminders(filterByUser(signed));
      setReceivableReminders(filterByUser(receivable));
    } catch (error) {
      console.error('加载提醒数据失败:', error);
      toast.error('加载提醒数据失败');
    } finally {
      setLoading(false);
    }
  }, [userBdName]);

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
        await loadReminders();
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

  const handleNextPaymentDateChange = (dealId: string, nextValue: string) => {
    setNextPaymentDateDrafts((prev) => ({ ...prev, [dealId]: nextValue }));
  };

  const handleReceivedAmountChange = (dealId: string, nextValue: string) => {
    setReceivedAmountDrafts((prev) => ({ ...prev, [dealId]: nextValue }));
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

  const handleSaveNextPaymentDate = async (item: ReceivableReminderItem) => {
    if (!item.dealId) {
      toast.error('缺少立项ID，无法更新到款时间');
      return;
    }
    const draft = nextPaymentDateDrafts[item.dealId] ?? toInputDate(item.firstPaymentDate);
    if (!draft) {
      toast.error('请选择预计下次到款时间');
      return;
    }
    setUpdatingNextPaymentIds((prev) => new Set(prev).add(item.dealId));
    try {
      const success = await dataService.updateDeal(item.dealId, { firstPaymentDate: draft });
      if (success) {
        toast.success('预计下次到款时间已更新');
        setNextPaymentDateDrafts((prev) => ({ ...prev, [item.dealId]: draft }));
        await loadReminders();
      } else {
        toast.error('更新预计下次到款时间失败');
      }
    } catch (error) {
      console.error('更新预计下次到款时间失败:', error);
      toast.error('更新预计下次到款时间失败');
    } finally {
      setUpdatingNextPaymentIds((prev) => {
        const next = new Set(prev);
        next.delete(item.dealId);
        return next;
      });
    }
  };

  const handleReceivableFollowUp = async (item: ReceivableReminderItem) => {
    if (!item.dealId) {
      toast.error('缺少立项ID，无法确认已跟进');
      return;
    }
    setUpdatingReceivableFollowIds((prev) => new Set(prev).add(item.dealId));
    try {
      const success = await dataService.confirmReceivableFollowUp(item.dealId);
      if (success) {
        toast.success('已确认跟进，4 天内不再提醒');
        setReceivableReminders((prev) => prev.filter((reminder) => reminder.dealId !== item.dealId));
      } else {
        toast.error('确认已跟进失败');
      }
    } catch (error) {
      console.error('确认已跟进失败:', error);
      toast.error('确认已跟进失败');
    } finally {
      setUpdatingReceivableFollowIds((prev) => {
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
          <Badge
            variant="outline"
            className="whitespace-nowrap bg-destructive/10 text-destructive border-destructive/30 text-xs"
          >
            红色提醒
          </Badge>
        );
      case 'yellow':
        return (
          <Badge
            variant="outline"
            className="whitespace-nowrap bg-warning/10 text-warning border-warning/30 text-xs"
          >
            黄色提醒
          </Badge>
        );
      default:
        return (
          <Badge
            variant="outline"
            className="whitespace-nowrap bg-muted text-muted-foreground border-muted-foreground/30 text-xs"
          >
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

  const normalizeCurrencyInput = (value: unknown) => {
    if (value === undefined || value === null) return null;
    const raw = String(value).replace(/[,\s¥￥]/g, '').trim();
    if (!raw) return null;
    const num = Number(raw);
    return Number.isNaN(num) ? null : num;
  };

  const roundCurrency = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

  const openReceiptDialog = (item: ReceivableReminderItem, delta: number) => {
    const initialDate =
      (item.dealId ? nextPaymentDateDrafts[item.dealId] : '') || toInputDate(item.firstPaymentDate);
    setReceiptDialogItem(item);
    setReceiptDialogAmount(delta);
    setReceiptDialogDate(initialDate || '');
    setReceiptDialogOpen(true);
  };

  const handleSaveReceivedAmount = async (item: ReceivableReminderItem) => {
    if (!item.dealId) {
      toast.error('缺少立项ID，无法更新');
      return;
    }

    const draft = receivedAmountDrafts[item.dealId] ?? '';
    const delta = normalizeCurrencyInput(draft);
    if (delta === null || delta <= 0) {
      toast.error('请输入有效的本次收款金额');
      return;
    }
    openReceiptDialog(item, delta);
  };

  const handleConfirmReceipt = async () => {
    if (!receiptDialogItem?.dealId || receiptDialogAmount === null) return;
    const nextDate = receiptDialogDate.trim();
    if (!nextDate) {
      toast.error('请填写预计下次到款时间');
      return;
    }

    const dealId = receiptDialogItem.dealId;
    setUpdatingReceivedIds((prev) => new Set(prev).add(dealId));
    try {
      const currentReceived = normalizeCurrencyInput(receiptDialogItem.receivedAmount) ?? 0;
      const nextTotal = roundCurrency(currentReceived + receiptDialogAmount);
      const success = await dataService.updateDeal(dealId, {
        receivedAmount: nextTotal,
        firstPaymentDate: nextDate,
      });
      if (success) {
        const currentRemaining = normalizeCurrencyInput(receiptDialogItem.remainingReceivable);
        const nextRemaining =
          currentRemaining === null
            ? receiptDialogItem.remainingReceivable
            : roundCurrency(Math.max(0, currentRemaining - receiptDialogAmount));
        setReceivableReminders((prev) =>
          prev.map((reminder) =>
            reminder.dealId === dealId
              ? {
                  ...reminder,
                  receivedAmount: nextTotal,
                  remainingReceivable: nextRemaining,
                  firstPaymentDate: nextDate,
                }
              : reminder
          )
        );
        setReceivedAmountDrafts((prev) => ({ ...prev, [dealId]: '' }));
        setNextPaymentDateDrafts((prev) => ({ ...prev, [dealId]: nextDate }));
        setReceiptDialogOpen(false);
        setReceiptDialogItem(null);
        setReceiptDialogAmount(null);
        toast.success('本次收款已更新');
        // 异步刷新剩余应收金额（由表格公式计算）
        setTimeout(async () => {
          try {
            const refreshed = await dataService.getReceivableReminders();
            setReceivableReminders(filterByUser(refreshed));
          } catch (error) {
            console.warn('刷新待收款项目失败:', error);
          }
        }, 800);
      } else {
        toast.error('更新本次收款失败');
      }
    } catch (error) {
      console.error('更新本次收款失败:', error);
      toast.error('更新本次收款失败');
    } finally {
      setUpdatingReceivedIds((prev) => {
        const next = new Set(prev);
        next.delete(dealId);
        return next;
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">加载中...</div>
      </div>
    );
  }

  const totalReminders =
    unfinishedReminders.length +
    receivableReminders.length +
    finishedReminders.length +
    signedReminders.length;

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
            系统将在每个工作日 10:00 向 BD 发送项目汇总提醒通知
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
              （进行中 {unfinishedReminders.length}  / 已签单 {signedReminders.length} / 已立项 {finishedReminders.length} / 待收款 {receivableReminders.length}）
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 子 Tab 切换 */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'unfinished' | 'receivable' | 'deal')}>
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
          <TabsTrigger value="deal" className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4" />
            立项项目
            {(signedReminders.length + finishedReminders.length) > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                {signedReminders.length + finishedReminders.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="receivable" className="flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            待收款项目
            {receivableReminders.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                {receivableReminders.length}
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
                          <TableHead className="w-[120px]">项目类别</TableHead>
                          <TableHead className="w-[110px]">项目阶段</TableHead>
                          <TableHead className="w-[90px]">最近更新</TableHead>
                          <TableHead className="w-[120px]">提醒状态</TableHead>
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
                              <Badge
                                variant="outline"
                                className={cn('text-xs whitespace-nowrap', getProjectTypeBadgeClass(item.projectType))}
                              >
                                {item.projectType}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={cn('text-xs whitespace-nowrap', getStageBadgeClass(item.stage))}
                              >
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
                            {item.shortName}
                          </div>
                        </div>
                        {getReminderBadge(item.reminderLevel)}
                      </div>

                      <div className="flex flex-wrap gap-2 mt-2">
                        <Badge
                          variant="outline"
                          className={cn('text-xs whitespace-nowrap', getProjectTypeBadgeClass(item.projectType))}
                        >
                          {item.projectType}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={cn('text-xs whitespace-nowrap', getStageBadgeClass(item.stage))}
                        >
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

        {/* 代收款项目列表 */}
        <TabsContent value="receivable" className="mt-4">
          {receivableReminders.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <CheckCircle2 className="h-12 w-12 opacity-30" />
                  <p>暂无需要提醒的待收款项目</p>
                  <p className="text-sm">当前没有剩余应收金额的项目</p>
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
                          <TableHead className="w-[240px] text-right">本次收款金额</TableHead>
                          <TableHead className="w-[180px]">预计下次到款时间</TableHead>
                          <TableHead className="w-[160px] text-right">剩余应收金额</TableHead>
                          <TableHead className="w-[100px]">操作</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {receivableReminders.map((item) => {
                          const canUpdate = Boolean(item.dealId);
                          const receivedDraft = item.dealId ? receivedAmountDrafts[item.dealId] ?? '' : '';
                          const canFollow = Boolean(item.dealId);
                          return (
                          <TableRow key={item.dealId || item.projectId}>
                            <TableCell className="max-w-[220px] truncate font-medium" title={item.projectName}>
                              {item.projectName}
                            </TableCell>
                            <TableCell>{item.shortName || '-'}</TableCell>
                            <TableCell className="text-right text-xs">
                              <div className="ml-auto w-full max-w-[220px] rounded-lg border border-muted-foreground/20 bg-muted/10 p-2">
                                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                  <span>累计收款</span>
                                  <span className="font-medium text-foreground">{formatCurrency(item.receivedAmount)}</span>
                                </div>
                                <div className="mt-2 flex items-center gap-2">
                                  <Input
                                    type="text"
                                    inputMode="decimal"
                                    placeholder="本次收款金额"
                                    value={receivedDraft}
                                    onChange={(e) => {
                                      if (item.dealId) handleReceivedAmountChange(item.dealId, e.target.value);
                                    }}
                                    className="h-7 w-[120px] text-right text-xs"
                                    disabled={!canUpdate}
                                  />
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    className="h-7 px-2 text-xs"
                                    onClick={() => handleSaveReceivedAmount(item)}
                                    disabled={!canUpdate || (item.dealId ? updatingReceivedIds.has(item.dealId) : true)}
                                  >
                                    确认
                                  </Button>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-xs">
                              <div className="inline-flex items-center gap-2 rounded-lg border border-muted-foreground/20 bg-muted/10 px-2 py-1.5">
                                <Input
                                  type="date"
                                  value={nextPaymentDateDrafts[item.dealId] ?? toInputDate(item.firstPaymentDate)}
                                  onChange={(e) => handleNextPaymentDateChange(item.dealId, e.target.value)}
                                  className="h-7 w-[140px] text-xs"
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => handleSaveNextPaymentDate(item)}
                                  disabled={updatingNextPaymentIds.has(item.dealId)}
                                >
                                  保存
                                </Button>
                              </div>
                            </TableCell>
                            <TableCell className="text-right text-xs">
                              {formatCurrency(item.remainingReceivable)}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Checkbox
                                  checked={canFollow && updatingReceivableFollowIds.has(item.dealId)}
                                  onCheckedChange={(checked) => {
                                    if (checked !== true) return;
                                    handleReceivableFollowUp(item);
                                  }}
                                  disabled={!canFollow || updatingReceivableFollowIds.has(item.dealId)}
                                />
                                <span className="text-xs text-muted-foreground">已跟进</span>
                              </div>
                            </TableCell>
                          </TableRow>
                        )})}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>

              {/* 移动端卡片 */}
              <div className="md:hidden space-y-3">
                {receivableReminders.map((item) => {
                  const canUpdate = Boolean(item.dealId);
                  const receivedDraft = item.dealId ? receivedAmountDrafts[item.dealId] ?? '' : '';
                  const canFollow = Boolean(item.dealId);
                  return (
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
                      <div className="mt-2 space-y-3 text-xs text-muted-foreground">
                        <div className="rounded-lg border border-muted-foreground/20 bg-muted/10 p-2">
                          <div className="flex items-center justify-between text-[11px]">
                            <span>累计收款</span>
                            <span className="text-foreground">{formatCurrency(item.receivedAmount)}</span>
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            <Input
                              type="text"
                              inputMode="decimal"
                              placeholder="本次收款金额"
                              value={receivedDraft}
                              onChange={(e) => {
                                if (item.dealId) handleReceivedAmountChange(item.dealId, e.target.value);
                              }}
                              className="h-7 w-[140px] text-xs"
                              disabled={!canUpdate}
                            />
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => handleSaveReceivedAmount(item)}
                              disabled={!canUpdate || (item.dealId ? updatingReceivedIds.has(item.dealId) : true)}
                            >
                              确认
                            </Button>
                          </div>
                        </div>
                        <div className="rounded-lg border border-muted-foreground/20 bg-muted/10 p-2">
                          <div className="flex items-center gap-2">
                            <span>预计下次到款时间</span>
                            <Input
                              type="date"
                              value={nextPaymentDateDrafts[item.dealId] ?? toInputDate(item.firstPaymentDate)}
                              onChange={(e) => handleNextPaymentDateChange(item.dealId, e.target.value)}
                              className="h-7 w-[140px] text-xs"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => handleSaveNextPaymentDate(item)}
                              disabled={updatingNextPaymentIds.has(item.dealId)}
                            >
                              保存
                            </Button>
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>剩余应收金额</span>
                          <span className="text-foreground">{formatCurrency(item.remainingReceivable)}</span>
                        </div>
                        <div className="flex items-center gap-2 pt-1">
                          <Checkbox
                            checked={canFollow && updatingReceivableFollowIds.has(item.dealId)}
                            onCheckedChange={(checked) => {
                              if (checked !== true) return;
                              handleReceivableFollowUp(item);
                            }}
                            disabled={!canFollow || updatingReceivableFollowIds.has(item.dealId)}
                          />
                          <span className="text-xs text-muted-foreground">已跟进</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )})}
              </div>
            </>
          )}
        </TabsContent>

        {/* 立项项目列表 */}
        <TabsContent value="deal" className="mt-4">
          <Tabs value={dealTab} onValueChange={(v) => setDealTab(v as 'signed' | 'finished')}>
            <TabsList className="grid w-full grid-cols-2">
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
                                <TableCell className="text-destructive text-xs">未走立项流程</TableCell>
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
                          <div className="text-xs text-destructive">未走立项流程</div>
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
                      <p className="text-sm">所有项目结束时间都在 7 天后</p>
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
                          <TableHead className="w-[100px]">项目结束时间</TableHead>
                          <TableHead className="w-[120px]">提醒状态</TableHead>
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
                                {item.shortName}
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
          </Tabs>
        </TabsContent>
      </Tabs>

      <Dialog
        open={receiptDialogOpen}
        onOpenChange={(open) => {
          setReceiptDialogOpen(open);
          if (!open) {
            setReceiptDialogItem(null);
            setReceiptDialogAmount(null);
            setReceiptDialogDate('');
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>填写预计下次到款时间</DialogTitle>
            <DialogDescription>
              已录入本次收款金额后，需要补充预计下次到款时间才能保存。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-muted-foreground/20 bg-muted/10 p-3">
              <div className="text-sm font-medium text-foreground">
                {receiptDialogItem?.projectName || '-'}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {receiptDialogItem?.shortName || '-'}
              </div>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">本次收款金额</span>
              <span className="font-semibold text-foreground">
                {formatCurrency(receiptDialogAmount ?? 0)}
              </span>
            </div>
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">预计下次到款时间</div>
              <Input
                type="date"
                value={receiptDialogDate}
                onChange={(e) => setReceiptDialogDate(e.target.value)}
                className="h-9"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setReceiptDialogOpen(false)}>
              取消
            </Button>
            <Button
              onClick={handleConfirmReceipt}
              disabled={
                !receiptDialogDate ||
                !receiptDialogItem?.dealId ||
                updatingReceivedIds.has(receiptDialogItem.dealId)
              }
            >
              保存并同步
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 提醒规则说明 */}
      <Card className="mt-6 bg-muted/50">
        <CardContent className="flex min-h-[240px] items-center py-8 lg:min-h-[300px] lg:py-12">
          <div className="mx-auto w-full max-w-5xl text-xs text-muted-foreground space-y-2">
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
                <ul className="list-disc list-inside ml-2 space-y-0.5">
                  <li>
                    <strong>含税收入为空</strong> 且 <strong>立项创建时间超过 1 个工作日</strong> → 未走立项流程
                  </li>
                </ul>
                <p className="font-medium mt-3">待收款项目：</p>
                <ul className="list-disc list-inside ml-2 space-y-0.5">
                  <li>
                    <strong>预计下次到款时间 ≤ 今日</strong> 且 <strong>剩余应收金额 &gt; 0</strong> → 进入提醒
                  </li>
                  <li><strong>确认已跟进</strong> 后，<strong>4 个自然日</strong> 内不再提醒</li>
                </ul>
                <p className="font-medium mt-3">已立项项目：</p>
                <ul className="list-disc list-inside ml-2 space-y-0.5">
                  <li><strong>确认已跟进</strong> 后，<strong>4 个自然日</strong> 内不再提醒</li>
                  <li><strong>4 天到期且未更新</strong> → 恢复按结束时间判断</li>
                  <li><strong>结束时间 = 今日</strong> → 黄色提醒</li>
                  <li><strong>已过结束时间</strong> → 红色提醒</li>
                </ul>
              </div>
            </div>
            <p className="mt-3">📢 <strong>飞书通知：</strong>系统将在每日早上 10:00 向 BD 发送汇总提醒</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default RemindersTab;
