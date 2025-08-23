import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import authApi from '@/services/auth';
import { User } from '@/services/auth/type';
import UserApi from '@/services/users';

// Query Keys
export const userQueryKeys = {
  user: ['user'] as const,
  profile: () => [...userQueryKeys.user, 'profile'] as const,
};

// 获取当前用户信息的 hook
export function useUserQuery() {
  return useQuery({
    queryKey: userQueryKeys.profile(),
    queryFn: async (): Promise<User> => {
      const { data, error } = await authApi.getCurrentUser();

      if (error || !data || !data.data) {
        throw new Error(error || '获取用户信息失败');
      }

      // 同步更新本地存储
      if (typeof window !== 'undefined') {
        localStorage.setItem('user_profile', JSON.stringify(data.data));
      }

      return data.data;
    },
    staleTime: 5 * 60 * 1000, // 5分钟内认为数据新鲜
    gcTime: 30 * 60 * 1000, // 30分钟缓存时间
    refetchOnWindowFocus: false, // 减少不必要的重新获取
    retry: 3,
  });
}

// 获取本地存储的用户数据（仅在客户端组件中使用）
export function getLocalUserData(): User | undefined {
  if (typeof window === 'undefined') return undefined;

  try {
    const cachedUser = localStorage.getItem('user_profile');

    if (cachedUser) {
      return JSON.parse(cachedUser);
    }
  } catch (error) {
    console.warn('解析本地用户数据失败:', error);
  }

  return undefined;
}

// 更新用户信息的 mutation hook
export function useUpdateUserMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: Partial<User>) => {
      return await UserApi.updateUser(updates);
    },
    onMutate: async (updates) => {
      // 取消正在进行的查询以避免冲突
      await queryClient.cancelQueries({ queryKey: userQueryKeys.profile() });

      // 获取当前用户数据
      const previousUser = queryClient.getQueryData<User>(userQueryKeys.profile());

      // 乐观更新 - 立即更新缓存
      if (previousUser) {
        queryClient.setQueryData<User>(userQueryKeys.profile(), {
          ...previousUser,
          ...updates,
        });
      }

      // 返回回滚数据
      return { previousUser };
    },
    onError: (error, variables, context) => {
      // 回滚到之前的数据
      if (context?.previousUser) {
        queryClient.setQueryData(userQueryKeys.profile(), context.previousUser);
      }

      console.error('更新用户信息失败:', error);
      toast.error('更新失败，请重试');
    },
    onSuccess: (data, variables) => {
      // 成功后重新获取最新数据
      queryClient.invalidateQueries({ queryKey: userQueryKeys.profile() });

      // 同时更新本地存储中的用户数据
      const currentUser = queryClient.getQueryData<User>(userQueryKeys.profile());

      if (currentUser && typeof window !== 'undefined') {
        localStorage.setItem('user_profile', JSON.stringify(currentUser));
      }

      const updatedFieldsCount = Object.keys(variables).length;
      toast.success(`已更新 ${updatedFieldsCount} 个字段`);
    },
  });
}

// 登出 mutation hook
export function useLogoutMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      return await authApi.logout();
    },
    onSuccess: () => {
      // 清除所有用户相关的查询缓存
      queryClient.removeQueries({ queryKey: userQueryKeys.user });

      // 清除本地存储的用户数据
      if (typeof window !== 'undefined') {
        localStorage.removeItem('user_profile');
        localStorage.removeItem('auth_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('expires_in');
        localStorage.removeItem('refresh_expires_in');
      }

      toast.success('已成功退出登录');

      // 重定向到登录页面
      window.location.href = '/auth';
    },
    onError: (error) => {
      console.error('退出登录失败:', error);
      toast.error('退出登录失败');
    },
  });
}
