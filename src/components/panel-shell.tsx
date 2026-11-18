import { TopBar } from "./top-bar";

export function PanelShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <main className="min-w-0">{children}</main>
    </div>
  );
}
