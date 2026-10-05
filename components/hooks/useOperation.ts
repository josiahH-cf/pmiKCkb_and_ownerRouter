"use client";
import { useLayoutEffect, useState, useSyncExternalStore } from "react";
import { OperationController } from "@/lib/ui/operation";

/** One controller per owning region; changing account/record retires every older admission. */
export function useOperation(scope: string) {
  const [controller] = useState(() => new OperationController());
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  useLayoutEffect(() => {
    controller.reset();
    return () => {
      controller.reset();
    };
  }, [controller, scope]);
  return { controller, snapshot };
}
