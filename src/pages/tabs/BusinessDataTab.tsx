import React from "react";
import { useNavigate } from "react-router-dom";
import { Database, Users, FolderKanban, FileCheck, Lock } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { getAccess } from "@/lib/access";

const BusinessDataTab: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const access = getAccess(String(user?.name || ""));

  const items = [
    {
      key: "clients",
      label: "客户",
      description: "查看客户信息",
      icon: Users,
      locked: !access.canBusinessClients,
    },
    {
      key: "projects",
      label: "项目",
      description: "查看项目进度与详情",
      icon: FolderKanban,
      locked: !access.canBusinessProjects,
    },
    {
      key: "deals",
      label: "立项",
      description: "查看立项数据",
      icon: FileCheck,
      locked: !access.canBusinessDeals,
    },
  ] as const;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Database className="h-5 w-5" />
            业务数据
          </CardTitle>
          <CardDescription>汇总客户、项目与立项核心信息，快速进入对应数据模块。</CardDescription>
        </CardHeader>
      </Card>

      <div className="flex min-h-[52vh] items-center">
        <div className="mx-auto grid w-full max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <Card
                key={item.key}
                className="group relative min-h-[150px] border-border/70 bg-card/80 transition-all hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-[0_22px_60px_-46px_rgba(255,140,72,0.45)]"
              >
                <CardContent className="flex h-full items-center justify-between gap-4 px-6 py-6 lg:px-7 lg:py-7">
                  <div className="flex items-start gap-4">
                    <div className="rounded-2xl bg-primary/10 p-3 text-primary shadow-[inset_0_0_0_1px_rgba(255,156,88,0.25)]">
                      <Icon className="h-6 w-6" />
                    </div>
                    <div className="space-y-1">
                      <div className="text-base font-semibold">{item.label}</div>
                      <div className="text-sm text-muted-foreground">{item.description}</div>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="default"
                    onClick={() => navigate(`/app/${item.key}`)}
                    disabled={item.locked}
                  >
                    进入
                  </Button>
                </CardContent>
                {item.locked && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-background/60 text-muted-foreground">
                    <div className="flex items-center gap-2 rounded-full border border-border/60 bg-card/80 px-3 py-1 text-xs">
                      <Lock className="h-3.5 w-3.5" />
                      权限受限
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default BusinessDataTab;
