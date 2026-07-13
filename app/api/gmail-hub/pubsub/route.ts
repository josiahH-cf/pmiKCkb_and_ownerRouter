import { NextResponse } from "next/server";

import { getGmailHubDependencies } from "@/lib/gmail-hub/dependencies";
import { gmailHubErrorResponse } from "@/lib/gmail-hub/http";
import { verifyPubSubPushRequest } from "@/lib/gmail-hub/pubsub";
import {
  GMAIL_HUB_ACTIONS,
  GmailHubGateError,
  processGmailPushNotification,
} from "@/lib/gmail-hub/service";

export async function POST(request: Request) {
  try {
    // Service-auth first: signature/audience/account validation occurs before body decoding.
    const notification = await verifyPubSubPushRequest(request);
    const dependencies = getGmailHubDependencies();
    if (!dependencies.isActionExecutable(GMAIL_HUB_ACTIONS.read)) {
      throw new GmailHubGateError(GMAIL_HUB_ACTIONS.read);
    }
    const result = await processGmailPushNotification({
      ...notification,
      store: dependencies.store,
      client: dependencies.createClient(notification.mailboxEmail),
      now: dependencies.now,
    });
    return NextResponse.json(result);
  } catch (error) {
    return gmailHubErrorResponse(error);
  }
}
