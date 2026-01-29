import React, { useState, useEffect } from 'react';
import { dataService } from '@/services/dataService';
import type { Deal, Project } from '@/types/bd';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
// 飞书时间戳兜底展示
import { formatDateSafe } from '@/lib/date';

const DealsTab: React.FC = () => {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [filteredDeals, setFilteredDeals] = useState<Deal[]>([]);
  const [monthFilter, setMonthFilter] = useState<string>('all');
  const [signCompanyFilter, setSignCompanyFilter] = useState<string>('all');
  const [finishFilter, setFinishFilter] = useState<string>('all');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const controlClass = "h-[clamp(34px,3.2vw,44px)] text-[clamp(12px,1.1vw,14px)]";
  const triggerClass = `${controlClass} w-auto min-w-[120px] px-3 whitespace-nowrap shrink-0`;
  const triggerWideClass = `${controlClass} w-auto min-w-[150px] px-3 whitespace-nowrap shrink-0`;
  const cardBaseClass =
    "flex h-full min-h-[200px] flex-col justify-center gap-2 px-5 py-5 sm:min-h-[220px] sm:gap-3 sm:px-6 sm:py-6";
  const cardTitleClass = "text-[clamp(15px,1.35vw,18px)] font-medium text-foreground leading-snug";
  const cardMetaClass = "text-[clamp(12px,1.05vw,14px)] text-muted-foreground";
  const statLabelClass = "text-[clamp(12px,1.05vw,14px)] text-muted-foreground";
  const statValueClass = "text-[clamp(16px,1.6vw,20px)] font-semibold";
  const pillClass =
    "rounded-full border border-border/70 bg-muted/40 px-3 py-1 text-[clamp(11px,1vw,13px)] font-medium text-foreground/90";

  const formatSignCompanyLabel = (value?: string | null) => {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    if (raw === '橙果视界（上海）科技有限公司') return '橙果（上海）';
    if (raw === '橙果视界（深圳）科技有限公司') return '橙果（深圳）';
    if (raw === 'OranAI. LTD.') return '橙果（海外）';
    return raw;
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    filterDeals();
  }, [deals, projects, searchKeyword, monthFilter, signCompanyFilter, finishFilter]);

  const loadData = async () => {
    const [dealsData, projectsData] = await Promise.all([
      dataService.getAllDeals(),
      dataService.getAllProjects(),
    ]);
    setDeals(dealsData);
    setProjects(projectsData);
  };

  const normalizeYearMonth = (raw: any) => {
    if (raw === null || raw === undefined) return '';
    const str = String(raw).trim();
    if (!str) return '';
    const zhMatch = str.match(/(\d{4})\s*年\s*(\d{1,2})\s*月/);
    if (zhMatch) {
      const year = zhMatch[1];
      const month = String(Number(zhMatch[2])).padStart(2, '0');
      return `${year}.${month}`;
    }
    const sepMatch = str.match(/(\d{4})[./-](\d{1,2})/);
    if (sepMatch) {
      const year = sepMatch[1];
      const month = String(Number(sepMatch[2])).padStart(2, '0');
      return `${year}.${month}`;
    }
    const compactMatch = str.match(/^(\d{4})(\d{2})$/);
    if (compactMatch) {
      return `${compactMatch[1]}.${compactMatch[2]}`;
    }
    return '';
  };

  const getYearMonthValue = (raw?: string) => {
    const normalized = normalizeYearMonth(raw);
    if (!normalized) return 0;
    const num = Number(normalized.replace('.', ''));
    return Number.isFinite(num) ? num : 0;
  };

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

  const filterDeals = () => {
    let result = [...deals];

    if (searchKeyword) {
      const keyword = searchKeyword.toLowerCase();
      result = result.filter((d) =>
        getProjectName(d).toLowerCase().includes(keyword)
      );
    }

    if (monthFilter !== 'all') {
      result = result.filter((d) => normalizeYearMonth(d.month) === monthFilter);
    }

    if (signCompanyFilter !== 'all') {
      result = result.filter(d => String(d.signCompany || '').trim() === signCompanyFilter);
    }

    if (finishFilter !== 'all') {
      const match = finishFilter === 'yes';
      result = result.filter((d) => {
        const raw = d.isFinished;
        const normalized =
          raw === true || raw === 'true' || raw === '是' || raw === '已完结'
            ? true
            : raw === false || raw === 'false' || raw === '否' || raw === '进行中'
              ? false
              : undefined;
        return normalized === match;
      });
    }

    result.sort((a, b) => {
      const monthDiff = getYearMonthValue(b.month) - getYearMonthValue(a.month);
      if (monthDiff !== 0) return monthDiff;
      return getDateValue(b.createdAt) - getDateValue(a.createdAt);
    });
    setFilteredDeals(result);
  };

  const projectNameMap = new Map(
    projects.map((p) => [String(p.projectId || '').trim(), String(p.projectName || '').trim()])
  );

  const getProjectName = (deal: Deal): string => {
    const directName = String(deal.projectName || '').trim();
    if (directName) return directName;
    const key = String(deal.projectId || deal.dealId || '').trim();
    return projectNameMap.get(key) || '-';
  };

  const formatAmount = (value?: number | string | null): string => {
    if (value === undefined || value === null || value === '') return '/';
    const n = Number(value);
    if (!Number.isFinite(n)) return '/';
    const formatted = new Intl.NumberFormat('zh-CN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
    return `¥${formatted}`;
  };

  const formatPercent = (value?: number | string | null): string => {
    if (value === undefined || value === null || value === '') return '/';
    const n = Number(value);
    if (!Number.isFinite(n)) return '/';
    const normalized = n > 1 ? n : n * 100;
    return `${normalized.toFixed(2)}%`;
  };

  const formatDateDisplay = (value?: string | null): string => {
    if (!value) return '/';
    const formatted = formatDateSafe(value);
    return formatted || '/';
  };

  const formatText = (value?: string | null): string => {
    const raw = String(value ?? '').trim();
    return raw ? raw : '/';
  };

  const renderFinishStatus = (raw: any) => {
    if (raw === true || raw === 'true' || raw === '是') return '已完结';
    if (raw === false || raw === 'false' || raw === '否') return '进行中';
    return raw || '-';
  };

  const handleDealClick = (deal: Deal) => {
    setSelectedDeal(deal);
    setShowDetail(true);
  };

  // 统计数据
  const totalIncome = filteredDeals.reduce((sum, d) => sum + (Number(d.incomeWithTax) || 0), 0);
  const totalReceived = filteredDeals.reduce((sum, d) => sum + (Number(d.receivedAmount) || 0), 0);
  const totalRemaining = filteredDeals.reduce((sum, d) => sum + (Number(d.remainingReceivable) || 0), 0);
  const monthOptions = Array.from(
    new Set(
      deals
        .map((d) => normalizeYearMonth(d.month))
        .filter((v) => v)
    )
  ).sort((a, b) => a.localeCompare(b));
  const signCompanyOptions = Array.from(
    new Set(deals.map((d) => String(d.signCompany || '').trim()).filter((v) => v))
  );

  return (
    <div className="space-y-4">
      {/* 筛选栏 */}
      <Card>
        <CardContent className="flex min-h-[88px] items-center p-4 sm:min-h-[96px] sm:p-5">
          <div className="mx-auto w-full max-w-6xl">
            <div className="flex w-full flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
              <div className="relative w-full lg:flex-[1.15] lg:max-w-[560px]">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="搜索项目名称..."
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  className={`${controlClass} pl-9`}
                />
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3 lg:flex-1 lg:justify-end lg:gap-4">
                <Select value={monthFilter} onValueChange={setMonthFilter}>
                  <SelectTrigger className={triggerClass}>
                    <SelectValue placeholder="选择年月" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部年月</SelectItem>
                    {monthOptions.map(month => (
                      <SelectItem key={month} value={month}>
                        {month}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={signCompanyFilter} onValueChange={setSignCompanyFilter}>
                  <SelectTrigger className={triggerWideClass}>
                    <SelectValue placeholder="签约公司主体" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部公司主体</SelectItem>
                    {signCompanyOptions.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={finishFilter} onValueChange={setFinishFilter}>
                  <SelectTrigger className={triggerClass}>
                    <SelectValue placeholder="是否完结" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部状态</SelectItem>
                    <SelectItem value="yes">已完结</SelectItem>
                    <SelectItem value="no">进行中</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 统计卡片 */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="flex h-full min-h-[110px] flex-col justify-center px-5 py-5 sm:min-h-[120px] sm:px-6 sm:py-6">
            <div className={statLabelClass}>总收入（含税）</div>
            <div className={cn("mt-1 text-foreground", statValueClass)}>
              {formatAmount(totalIncome)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex h-full min-h-[110px] flex-col justify-center px-5 py-5 sm:min-h-[120px] sm:px-6 sm:py-6">
            <div className={statLabelClass}>已收金额</div>
            <div className={cn("mt-1 text-success", statValueClass)}>
              {formatAmount(totalReceived)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex h-full min-h-[110px] flex-col justify-center px-5 py-5 sm:min-h-[120px] sm:px-6 sm:py-6">
            <div className={statLabelClass}>剩余应收</div>
            <div className={cn("mt-1 text-warning", statValueClass)}>
              {formatAmount(totalRemaining)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 立项卡片 */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filteredDeals.map((deal, idx) => {
          const finishText = renderFinishStatus(deal.isFinished);
          const finishVariant = finishText === '已完结' ? 'default' : 'secondary';
          return (
            <Card
              key={`${deal.dealId || 'deal'}-${deal.projectId || idx}`}
              className="cursor-pointer transition-all hover:shadow-md hover:border-primary/50"
              onClick={() => handleDealClick(deal)}
            >
              <CardContent className={cardBaseClass}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className={cn("line-clamp-2", cardTitleClass)}>{getProjectName(deal)}</div>
                  </div>
                  <Badge variant={finishVariant} className="text-xs shrink-0">
                    {finishText}
                  </Badge>
                </div>
                <div className={cn("mt-2", cardMetaClass)}>
                  立项编号：{formatText(deal.serialNo)}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={pillClass}>
                    {formatText(deal.belong)}
                  </Badge>
                  <Badge variant="outline" className={pillClass}>
                    {formatSignCompanyLabel(deal.signCompany) || '/'}
                  </Badge>
                </div>
                <div className={cn("mt-3 grid grid-cols-2 gap-x-5 gap-y-2", cardMetaClass)}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">含税收入</span>
                    <span className="text-foreground/90">{formatAmount(deal.incomeWithTax)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">毛利</span>
                    <span className="text-foreground/90">{formatAmount(deal.grossProfit)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">毛利率</span>
                    <span className="text-foreground/90">{formatPercent(deal.grossMargin)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">已收金额</span>
                    <span className="text-foreground/90">{formatAmount(deal.receivedAmount)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filteredDeals.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          暂无立项数据
        </div>
      )}

      <Dialog open={showDetail} onOpenChange={setShowDetail}>
        <DialogContent className="max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{selectedDeal ? getProjectName(selectedDeal) : '立项详情'}</DialogTitle>
          </DialogHeader>
          {selectedDeal && (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">立项编号：</span>
                <span>{formatText(selectedDeal.serialNo)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">项目ID：</span>
                <span className="font-mono">{formatText(selectedDeal.projectId)}</span>
              </div>
              <div className="col-span-2">
                <span className="text-muted-foreground">项目名称：</span>
                <span>{getProjectName(selectedDeal)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">是否完结：</span>
                <span>{renderFinishStatus(selectedDeal.isFinished)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">归属：</span>
                <span>{formatText(selectedDeal.belong)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">项目开始：</span>
                <span>{formatDateDisplay(selectedDeal.startDate)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">项目结束：</span>
                <span>{formatDateDisplay(selectedDeal.endDate)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">已付项目成本【三方】：</span>
                <span>{formatAmount(selectedDeal.paidThirdPartyCost)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">毛利：</span>
                <span>{formatAmount(selectedDeal.grossProfit)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">毛利率：</span>
                <span>{formatPercent(selectedDeal.grossMargin)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">预计下一次到款时间：</span>
                <span>{formatDateDisplay(selectedDeal.firstPaymentDate)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">全款实际到款时间：</span>
                <span>{formatDateDisplay(selectedDeal.finalPaymentDate)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">已收金额：</span>
                <span>{formatAmount(selectedDeal.receivedAmount)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">剩余应收金额：</span>
                <span>{formatAmount(selectedDeal.remainingReceivable)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">含税收入：</span>
                <span>{formatAmount(selectedDeal.incomeWithTax)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">不含税收入：</span>
                <span>{formatAmount(selectedDeal.incomeWithoutTax)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">签约主体：</span>
                <span>{formatText(selectedDeal.signCompany)}</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DealsTab;
