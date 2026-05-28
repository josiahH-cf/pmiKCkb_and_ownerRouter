import { redirect } from "next/navigation";
import { SignInPanel } from "@/components/auth/SignInPanel";
import { getCurrentUser } from "@/lib/auth/session";
import { readServerConfig } from "@/lib/config/server";
import { PRODUCT_NAME } from "@/lib/constants";

interface SignInPageProps {
  searchParams?: Promise<{
    error?: string | string[];
  }>;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const user = await getSignedInUser();

  if (user) {
    redirect("/ask");
  }

  const params = await searchParams;
  const config = readServerConfig();
  const initialError = typeof params?.error === "string" ? params.error : null;

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <h1>{PRODUCT_NAME}</h1>
        <p>Sign in to continue.</p>
        <SignInPanel
          allowedHostedDomain={config.allowedHostedDomain}
          initialError={initialError}
          localDemoEnabled={config.localDemoAuth}
        />
      </section>
    </main>
  );
}

async function getSignedInUser() {
  try {
    return await getCurrentUser();
  } catch {
    return null;
  }
}
