import React from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LayoutGrid } from "lucide-react";
import type { KanbanBoard } from "@/types/bd";
import { useAuth } from "@/contexts/AuthContext";
import { isPmUser } from "@/lib/access";

const KanbanTab: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [boards, setBoards] = React.useState<KanbanBoard[]>([]);
  const [activeBoardId, setActiveBoardId] = React.useState("");
  const [embedUrl, setEmbedUrl] = React.useState<string | null>(null);

  const loadBoards = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/kanban/boards", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || `Request failed with status ${res.status}`);
      }
      const nextBoards = Array.isArray(json?.data) ? json.data : [];
      if (nextBoards.length === 0) {
        throw new Error("未配置任何看板，请检查服务端环境变量");
      }
      setBoards(nextBoards);
      setActiveBoardId((prev) =>
        nextBoards.some((board: KanbanBoard) => board.id === prev)
          ? prev
          : String(nextBoards[0]?.id || "")
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err ?? "");
      setError(message || "加载看板失败");
      setEmbedUrl(null);
      setBoards([]);
      setActiveBoardId("");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadBoards();
  }, [loadBoards]);

  const visibleBoards = React.useMemo(() => {
    const name = user?.name || user?.username || "";
    if (isPmUser(name)) {
      return boards.filter((board) => board.name !== "立项看板");
    }
    return boards;
  }, [boards, user?.name, user?.username]);

  React.useEffect(() => {
    if (!visibleBoards.length) {
      setActiveBoardId("");
      return;
    }
    if (!visibleBoards.some((board) => board.id === activeBoardId)) {
      setActiveBoardId(String(visibleBoards[0]?.id || ""));
    }
  }, [visibleBoards, activeBoardId]);

  const activeBoard = React.useMemo(() => {
    if (!visibleBoards.length) return null;
    return visibleBoards.find((board) => board.id === activeBoardId) || visibleBoards[0];
  }, [visibleBoards, activeBoardId]);

  React.useEffect(() => {
    if (!activeBoard) {
      setEmbedUrl(null);
      return;
    }
    const url = String(activeBoard.embedUrl || "").trim();
    if (!url) {
      setEmbedUrl(null);
      setError("看板链接为空，请检查服务端配置");
      return;
    }
    setError(null);
    setEmbedUrl(url);
  }, [activeBoard]);

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

      {!loading && visibleBoards.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">选择看板</CardTitle>
            <CardDescription>切换不同看板视角查看各板块的业务进度。</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {visibleBoards.map((board, index) => {
              const isActive = board.id === (activeBoard?.id || "");
              return (
                <Button
                  key={board.id}
                  type="button"
                  size="sm"
                  variant={isActive ? "default" : "outline"}
                  onClick={() => setActiveBoardId(board.id)}
                >
                  {board.name || `看板 ${index + 1}`}
                </Button>
              );
            })}
          </CardContent>
        </Card>
      )}

      {loading && <Skeleton className="h-[60vh] w-full rounded-2xl" />}

      {!loading && error && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center text-sm text-muted-foreground">
            <div>{error}</div>
            <Button variant="outline" size="sm" onClick={loadBoards}>
              重新加载
            </Button>
          </CardContent>
        </Card>
      )}

      {!loading && !error && embedUrl && (
        <div className="rounded-2xl border border-border/70 bg-card/70 p-2 shadow-sm">
          <div className="relative h-[70vh] min-h-[480px] w-full overflow-hidden rounded-xl bg-muted">
            <iframe
              title={activeBoard?.name || "飞书看板"}
              src={embedUrl}
              className="h-full w-full"
              loading="eager"
              referrerPolicy="no-referrer-when-downgrade"
              allow="clipboard-read; clipboard-write; fullscreen"
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-muted-foreground">
            <span>
              {activeBoard?.name || "当前看板"} · 内容来自飞书看板嵌套视图
            </span>
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
