"use client";
import { AlertsBell } from "./AlertsBell";
import { MobileSidebar } from "./MobileSidebar";
import { TenantSwitcher } from "./TenantSwitcher";
import { UserMenu } from "./UserMenu";
import { SearchTrigger } from "./SearchTrigger";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { CustomizacaoPopover } from "@/components/branding/CustomizacaoPopover";

export function TopBar() {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-2 border-b bg-background/95 px-3 backdrop-blur md:gap-4 md:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <MobileSidebar />
        <TenantSwitcher />
      </div>
      {/* A busca ocupa o meio da barra (antes cabia só "Buscar..."): é o ⌘K
          para achar contato, conversa ou tela sem passar pelo menu. */}
      <div className="flex min-w-0 flex-1 justify-center md:max-w-2xl">
        <SearchTrigger />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <CustomizacaoPopover />
        {/* O único botão de tema: havia outro no UserMenu (dois iguais lado a lado). */}
        <ThemeToggle />
        <AlertsBell />
        <UserMenu />
      </div>
    </header>
  );
}
