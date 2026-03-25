import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/api/queryKeys";
import { listModels } from "@/api/chat";
import { useChatStore } from "@/store/chat";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function ModelSelector() {
  const { data: models, isLoading } = useQuery({
    queryKey: queryKeys.chat.models,
    queryFn: listModels,
    staleTime: 60_000,
  });
  const selectedModel = useChatStore((s) => s.selectedModel);
  const setModel = useChatStore((s) => s.setModel);

  if (isLoading) {
    return (
      <div
        className="h-9 w-48 animate-pulse rounded-md bg-muted"
        aria-label="Loading models"
      />
    );
  }

  return (
    <Select value={selectedModel} onValueChange={setModel}>
      <SelectTrigger className="w-48 text-sm" aria-label="Select model">
        <SelectValue placeholder="Select model" />
      </SelectTrigger>
      <SelectContent>
        {models?.map((m) => (
          <SelectItem key={m.name} value={m.name}>
            {m.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
