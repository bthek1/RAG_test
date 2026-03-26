import type { LucideIcon } from "lucide-react";
import { BarChart2, Bot, Globe } from "lucide-react";

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
}

export const navItems: NavItem[] = [
  { label: "Dashboard", to: "/demo/chart", icon: BarChart2 },
  { label: "Ollama Chat", to: "/chat", icon: Bot },
  { label: "Researcher", to: "/researcher/search", icon: Globe },
];
