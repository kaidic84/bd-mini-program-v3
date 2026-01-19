import React from "react";
import { useNavigate } from "react-router-dom";
import { Users, FolderKanban, FileCheck } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const BusinessDataTab: React.FC = () => {
  const navigate = useNavigate();

  const items = [
    {
      key: "clients",
      label: "客户",
      description: "查看客户信息",
      icon: Users,
    },
    {
      key: "projects",
      label: "项目",
      description: "查看项目进度与详情",
      icon: FolderKanban,
    },
    {
      key: "deals",
      label: "立项",
      description: "查看立项数据",
      icon: FileCheck,
    },
  ] as const;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>业务数据</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          请选择要查看的业务数据类型
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.key} className="hover:border-primary/50 transition-colors">
              <CardContent className="flex items-center justify-between gap-3 pt-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-md bg-primary/10 p-2 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">{item.label}</div>
                    <div className="text-xs text-muted-foreground">{item.description}</div>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/app/${item.key}`)}
                >
                  进入
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default BusinessDataTab;
