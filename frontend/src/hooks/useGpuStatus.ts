import { useQuery } from "@tanstack/react-query";
import { getGpuStatus } from "@/api/health";
import { queryKeys } from "@/api/queryKeys";

export function useGpuStatus() {
  const { data, isPending, isError } = useQuery({
    queryKey: queryKeys.gpuStatus,
    queryFn: getGpuStatus,
    refetchInterval: 30_000, // refresh every 30 s
    retry: 1,
    staleTime: 15_000,
  });

  return {
    gpuStatus: data,
    isAvailable: data?.available ?? false,
    isPending,
    isError,
  };
}
