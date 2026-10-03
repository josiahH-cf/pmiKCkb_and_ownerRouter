import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { PmiWordmark } from "@/components/brand/PmiWordmark";
import { SignInPanel } from "@/components/auth/SignInPanel";
import { Appearance } from "@/components/layout/Appearance";
import { RETURN_TO_COOKIE, safeReturnPath } from "@/lib/auth/return-to";
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
  const params = await searchParams;
  const initialError = typeof params?.error === "string" ? params.error : null;
  // S165: the page a signed-out person was opening, remembered by the request proxy. Validated
  // here and again in the panel; anything that is not a path inside the staff app is dropped.
  const returnTo = safeReturnPath((await cookies()).get(RETURN_TO_COOKIE)?.value);

  if (user) {
    // A signed-in account that a page refused arrives here with an error. Send it to the
    // Dashboard, never back to the refused page, so the two redirects cannot chase each other.
    redirect(initialError ? "/" : (returnTo ?? "/"));
  }

  const config = readServerConfig();

  return (
    <main className="auth-page">
      <div className="public-appearance">
        <Appearance />
      </div>
      <PmiWordmark variant="hero" />
      <section className="auth-panel">
        <p className="auth-product-name">{PRODUCT_NAME}</p>
        <h1>Sign in to continue.</h1>
        <SignInPanel
          allowedHostedDomain={config.allowedHostedDomain}
          initialError={initialError}
          localDemoEnabled={config.localDemoAuth}
          returnTo={returnTo}
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
