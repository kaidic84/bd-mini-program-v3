import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

const Login: React.FC = () => {
  const [status, setStatus] = useState<'idle' | 'verifying' | 'error'>('idle');
  const { loginWithToken } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const redirect = searchParams.get('redirect');

  useEffect(() => {
    if (!token) {
      setStatus('idle');
      return;
    }
    let isActive = true;
    const verify = async () => {
      setStatus('verifying');
      const success = await loginWithToken(token);
      if (!isActive) return;
      if (success) {
        toast.success('登录成功');
        const from = (location.state as any)?.from?.pathname;
        navigate(redirect || from || '/app', { replace: true });
      } else {
        toast.error('登录链接无效或无权限');
        setStatus('error');
      }
    };
    void verify();
    return () => {
      isActive = false;
    };
  }, [token, loginWithToken, navigate, redirect, location.state]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 items-center justify-center">
            <img
              src="/brand-logo-login.png"
              alt="橙果视界"
              className="h-16 w-auto max-w-[220px] object-contain"
            />
          </div>
          <h1 className="text-2xl font-bold text-foreground">每日表单系统</h1>
          <p className="mt-2 text-muted-foreground">Business Development Daily Form System</p>
        </div>

        <Card className="border-border shadow-lg">
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl">飞书链接登录</CardTitle>
            <CardDescription>请从飞书机器人消息中打开专属链接完成登录</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="rounded-lg border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                {token
                  ? status === 'error'
                    ? '登录链接无效或已过期，请从飞书机器人获取新链接。'
                    : '正在验证飞书登录链接，请稍候...'
                  : '未检测到登录链接，请从飞书机器人消息中点击专属链接。'}
              </div>
            </div>
            <div className="mt-6 rounded-lg bg-muted p-4">
              <p className="text-center text-sm text-muted-foreground">
                当前仅允许白名单用户通过飞书链接进入
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Login;
