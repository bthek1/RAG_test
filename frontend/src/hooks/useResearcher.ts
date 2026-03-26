import { useMutation } from "@tanstack/react-query";

import { runSearch } from "@/api/researcher";

export function useRunSearch() {
  return useMutation({ mutationFn: runSearch });
}
