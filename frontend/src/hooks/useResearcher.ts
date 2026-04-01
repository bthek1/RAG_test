import { useMutation } from "@tanstack/react-query";

import { runSearch } from "@/api/researcher";
import type { SearchSchema } from "@/schemas/researcher";

export function useRunSearch() {
  return useMutation({ mutationFn: (vars: SearchSchema) => runSearch(vars) });
}
