import { BottomTabBar } from "./bottom-tab-bar";
import { Sidebar } from "./sidebar";

export function PanelShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="pb-20 sm:ml-64 sm:pb-0">{children}</main>
      <BottomTabBar />
    </div>
  );
}
