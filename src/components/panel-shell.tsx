import { TopBar } from "./top-bar";
import { BottomTabBar } from "./bottom-tab-bar";

export function PanelShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <main className="min-w-0 pb-20 lg:pb-0">{children}</main>
      <BottomTabBar />
    </div>
  );
}
