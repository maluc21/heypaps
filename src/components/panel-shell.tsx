import { BottomTabBar } from "./bottom-tab-bar";

export function PanelShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-background">
      <main className="min-w-0 pb-[calc(5.25rem+env(safe-area-inset-bottom))] lg:min-h-[calc(100dvh-4rem)] lg:pb-0">{children}</main>
      <BottomTabBar />
    </div>
  );
}
