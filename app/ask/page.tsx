import { AskForm } from "@/components/ask/AskForm";
import { AppShell } from "@/components/layout/AppShell";
import { requirePageCapability } from "@/lib/auth/page-guards";

export default async function AskPage() {
  const user = await requirePageCapability("read");

  return (
    <AppShell user={user}>
      <section className="content">
        <h1 className="section-title">Ask</h1>
        <AskForm />
      </section>
    </AppShell>
  );
}
