import React from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LayoutGrid } from "lucide-react";

const KanbanTab: React.FC = () => {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [embedUrl, setEmbedUrl] = React.useState<string | null>(null);

  const loadEmbed = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/kanban/embed", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || `Request failed with status ${res.status}`);
      }
      const url = String(json?.data?.url || "").trim();
      if (!url) throw new Error("看板链接为空，请检查服务端配置");
      setEmbedUrl(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err ?? "");
      setError(message || "加载看板失败");
      setEmbedUrl(null);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadEmbed();
  }, [loadEmbed]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <LayoutGrid className="h-5 w-5" />
            看板视图
          </CardTitle>
          <CardDescription>实时查看飞书看板的分组进度与关键流转，无需额外登录即可浏览。</CardDescription>
        </CardHeader>
      </Card>

      {loading && <Skeleton className="h-[60vh] w-full rounded-2xl" />}

      {!loading && error && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center text-sm text-muted-foreground">
            <div>{error}</div>
            <Button variant="outline" size="sm" onClick={loadEmbed}>
              重新加载
            </Button>
          </CardContent>
        </Card>
      )}

      {!loading && !error && embedUrl && (
        <div className="rounded-2xl border border-border/70 bg-card/70 p-2 shadow-sm">
          <div className="relative h-[70vh] min-h-[480px] w-full overflow-hidden rounded-xl bg-muted">
            <iframe
              title="飞书看板"
              src={embedUrl}
              className="h-full w-full"
              loading="eager"
              referrerPolicy="no-referrer-when-downgrade"
              allow="clipboard-read; clipboard-write; fullscreen"
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-muted-foreground">
            <span>内容来自飞书看板嵌套视图</span>
            <a
              href={embedUrl}
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              新窗口打开
            </a>
          </div>
        </div>
      )}
    </div>
  );
};

export default KanbanTab;
