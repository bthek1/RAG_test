import { useQuery } from "@tanstack/react-query";
import { getOllamaStatus } from "@/api/chat";
import { queryKeys } from "@/api/queryKeys";

export function useOllamaStatus() {
  const { data, isPending, isError } = useQuery({
    queryKey: queryKeys.chat.status,
    queryFn: getOllamaStatus,
    refetchInterval: 30_000,
    retry: 1,
    staleTime: 15_000,
  });

  return {
    ollamaStatus: data,
    isConnected: data?.connected ?? false,
    isPending,
    isError,
  };
}
