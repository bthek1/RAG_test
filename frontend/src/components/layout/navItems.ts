import type { LucideIcon } from "lucide-react";
import { BookOpen, Bot, Globe, Search } from "lucide-react";

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
}

export const navItems: NavItem[] = [
  { label: "Ollama Chat", to: "/chat", icon: Bot },
  { label: "Documents", to: "/rag/documents", icon: BookOpen },
  { label: "Search", to: "/rag/search", icon: Search },
  { label: "Researcher", to: "/researcher/search", icon: Globe },
];
