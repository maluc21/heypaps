import { connection } from "next/server";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { getCurrentStore } from "@/lib/store-context";
import { TagManager, type EditableTag } from "@/components/tag-manager";
import { PanelShell } from "@/components/panel-shell";

export const metadata = {
  title: "Etiquetas · Panel",
  description: "Organiza tus productos con etiquetas",
};

export const instant = false;

export default async function TagsPage() {
  await connection();
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const store = await getCurrentStore(user.id);

  if (!store) {
    return (
      <PanelShell>
        <div className="p-4">
          <p className="rounded-xl border bg-card p-6 text-center text-muted-foreground">
            Todavía no tienes una tienda.{" "}
            <a href="/onboarding" className="underline">
              Crea la primera
            </a>
            .
          </p>
        </div>
      </PanelShell>
    );
  }

  const { data: tags } = await supabase
    .from("tags")
    .select("id, name, color, position")
    .eq("store_id", store.id)
    .order("position", { ascending: true });

  return (
    <PanelShell>
      <div className="p-4">
        <TagManager storeId={store.id} tags={(tags ?? []) as EditableTag[]} />
      </div>
    </PanelShell>
  );
}
