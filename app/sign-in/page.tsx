import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { PmiWordmark } from "@/components/brand/PmiWordmark";
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
  await redirectLoopbackIpToLocalhost();

  const user = await getSignedInUser();

  if (user) {
    redirect("/ask");
  }

  const params = await searchParams;
  const config = readServerConfig();
  const initialError = typeof params?.error === "string" ? params.error : null;

  return (
    <main className="auth-page">
      <PmiWordmark variant="hero" />
      <section className="auth-panel">
        <p className="auth-product-name">{PRODUCT_NAME}</p>
        <h1>Sign in to continue.</h1>
        <SignInPanel
          allowedHostedDomain={config.allowedHostedDomain}
          initialError={initialError}
          localDemoEnabled={config.localDemoAuth}
        />
      </section>
    </main>
  );
}

async function redirectLoopbackIpToLocalhost() {
  const host = (await headers()).get("host");

  if (!host?.startsWith("127.0.0.1:")) {
    return;
  }

  const port = host.slice("127.0.0.1:".length);
  redirect(`http://localhost:${port}/sign-in`);
}

async function getSignedInUser() {
  try {
    return await getCurrentUser();
  } catch {
    return null;
  }
}
