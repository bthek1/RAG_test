import { LogOut, User } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useLogout } from "@/hooks/useAuth";

interface AccountMenuProps {
  displayName: string;
}

export function AccountMenu({ displayName }: AccountMenuProps) {
  const logout = useLogout();
  const navigate = useNavigate();

  function handleLogout() {
    // Clear tokens and cache immediately
    logout();
    // Navigate immediately to login (don't wait for queries to update)
    navigate({ to: "/login", replace: true });
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <User className="h-4 w-4" />
          <span className="hidden text-sm sm:inline">{displayName}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56">
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium leading-none text-muted-foreground">
              Signed in as
            </p>
            <p className="text-sm font-medium">{displayName}</p>
          </div>
          <Button
            variant="destructive"
            size="sm"
            className="w-full gap-2"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
