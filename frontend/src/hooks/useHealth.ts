import { useQuery } from "@tanstack/react-query";
import { getHealth } from "@/api/health";
import { queryKeys } from "@/api/queryKeys";

export function useHealth() {
  const { data, isError, isPending } = useQuery({
    queryKey: queryKeys.health,
    queryFn: getHealth,
    refetchInterval: 30_000,
    retry: 1,
  });

  const isConnected = !isPending && !isError && data?.status === "ok";

  return { isConnected, isPending };
}
