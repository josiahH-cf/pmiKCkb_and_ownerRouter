import { describe, expect, it } from "vitest";

import { classifyLocation, decideGoogleStep } from "../../scripts/auth/google-step";

// S112: the only automated interaction the canary sign-in may perform on a Google page is selecting
// the expected account tile. Every other Google state is a human step, reported and never worked
// around.

const appOrigin = "https://pmi-kc-app-kq6wuvpiva-uc.a.run.app";

describe("classifyLocation", () => {
  it("separates the app, its sign-in page, the Firebase handler, and Google", () => {
    expect(classifyLocation(`${appOrigin}/`, appOrigin)).toBe("app");
    expect(classifyLocation(`${appOrigin}/sign-in?error=forbidden`, appOrigin)).toBe(
      "app-sign-in",
    );
    expect(
      classifyLocation(
        "https://pmi-kc-kb-prod.firebaseapp.com/__/auth/handler?x=1",
        appOrigin,
      ),
    ).toBe("auth-handler");
    expect(
      classifyLocation(
        "https://accounts.google.com/v3/signin/identifier?flowName=x",
        appOrigin,
      ),
    ).toBe("google");
    expect(classifyLocation("https://example.com/", appOrigin)).toBe("other");
    expect(classifyLocation("not a url", appOrigin)).toBe("other");
  });
});

describe("decideGoogleStep", () => {
  const base = {
    appOrigin,
    exactAccountTileVisible: false,
    accountTileClicked: false,
    passwordOrChallengeVisible: false,
  };

  it("finishes when the app is reached off the sign-in page", () => {
    expect(decideGoogleStep({ ...base, url: `${appOrigin}/` }).action).toBe("app");
    expect(decideGoogleStep({ ...base, url: `${appOrigin}/sign-in` }).action).toBe(
      "wait",
    );
  });

  it("clicks the expected account tile exactly once and never anything else", () => {
    const chooser =
      "https://accounts.google.com/o/oauth2/auth/oauthchooseaccount?client_id=x";
    expect(
      decideGoogleStep({ ...base, url: chooser, exactAccountTileVisible: true }).action,
    ).toBe("click-account");
    expect(
      decideGoogleStep({
        ...base,
        url: chooser,
        exactAccountTileVisible: true,
        accountTileClicked: true,
      }).action,
    ).toBe("wait");
    expect(decideGoogleStep({ ...base, url: chooser }).action).toBe("human");
  });

  it("hands every credential, challenge, consent, or identifier page to a human", () => {
    for (const url of [
      "https://accounts.google.com/v3/signin/identifier?flowName=GlifWebSignIn",
      "https://accounts.google.com/v3/signin/challenge/pwd?x=1",
      "https://accounts.google.com/signin/v2/challenge/totp",
      "https://accounts.google.com/signin/oauth/consent?authuser=0",
    ]) {
      const decision = decideGoogleStep({ ...base, url });
      expect(decision.action).toBe("human");
      expect(decision.reason.length).toBeGreaterThan(0);
    }
    expect(
      decideGoogleStep({
        ...base,
        url: "https://accounts.google.com/anything",
        exactAccountTileVisible: true,
        passwordOrChallengeVisible: true,
      }).action,
    ).toBe("human");
  });

  it("waits on the Firebase handler and on unknown Google pages without a signal", () => {
    expect(
      decideGoogleStep({
        ...base,
        url: "https://pmi-kc-kb-prod.firebaseapp.com/__/auth/handler?apiKey=x",
      }).action,
    ).toBe("wait");
    expect(
      decideGoogleStep({ ...base, url: "https://accounts.google.com/CheckCookie?x" })
        .action,
    ).toBe("wait");
  });
});
