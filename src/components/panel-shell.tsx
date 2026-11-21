import { BottomTabBar } from "./bottom-tab-bar";

export function PanelShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background">
      <main className="min-w-0 pb-20 lg:pb-0">{children}</main>
      <BottomTabBar />
    </div>
  );
}
