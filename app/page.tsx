import { AppShell } from "@/components/layout/AppShell";
import { OperationsConsoleHome } from "@/components/home/OperationsConsoleHome";
import { requirePageCapability } from "@/lib/auth/page-guards";

export default async function HomePage() {
  const user = await requirePageCapability("read");

  return (
    <AppShell user={user}>
      <OperationsConsoleHome />
    </AppShell>
  );
}
