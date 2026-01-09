import React, { useEffect, useState } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LayoutGrid } from 'lucide-react';

const KanbanTab: React.FC = () => {
  const [embedUrl, setEmbedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadEmbed = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch('/api/dashboard/embed', { cache: 'no-store' });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) {
          throw new Error(json?.error || `Request failed with status ${res.status}`);
        }
        setEmbedUrl(json?.data?.url || null);
      } catch (e: any) {
        setError(e?.message || '加载仪表盘失败');
      } finally {
        setLoading(false);
      }
    };

    void loadEmbed();
  }, []);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <LayoutGrid className="h-5 w-5 text-primary" />
            <CardTitle>仪表盘视图</CardTitle>
          </div>
          <Badge variant="outline">嵌入已接入</Badge>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            已通过嵌入链接加载飞书仪表盘，支持在小程序内直接查看整块组件。
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">仪表盘预览</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {loading && <div>正在加载仪表盘...</div>}
          {!loading && error && <div>暂时无法加载仪表盘，请稍后再试。</div>}
          {!loading && !error && !embedUrl && <div>暂无可用的仪表盘。</div>}
          {!loading && !error && embedUrl && (
            <div className="overflow-hidden rounded-md border border-border">
              <iframe
                title="Feishu Dashboard"
                src={embedUrl}
                className="h-[70vh] w-full"
                allow="clipboard-read; clipboard-write; fullscreen"
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default KanbanTab;
