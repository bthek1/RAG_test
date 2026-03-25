import type { LucideIcon } from "lucide-react";
import {
  BarChart2,
  BookOpen,
  Bot,
  MessageSquare,
  Search,
  Layers,
} from "lucide-react";

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
}

export const navItems: NavItem[] = [
  { label: "Dashboard", to: "/demo/chart", icon: BarChart2 },
  { label: "Ollama Chat", to: "/chat", icon: Bot },
  { label: "RAG Overview", to: "/rag", icon: Layers },
  { label: "Documents", to: "/rag/documents", icon: BookOpen },
  { label: "Search", to: "/rag/search", icon: Search },
  { label: "Chat", to: "/rag/chat", icon: MessageSquare },
];
