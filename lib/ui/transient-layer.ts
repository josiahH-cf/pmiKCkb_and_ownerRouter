export type TransientLayerFamily =
  | "appearance"
  | "notifications"
  | "navigation"
  | "infotip";

interface TransientLayerRegistration {
  id: string;
  family: TransientLayerFamily;
  parentId?: string;
  close: () => void;
}

const registrations = new Map<string, TransientLayerRegistration>();

function closeRegistration(
  registration: TransientLayerRegistration,
  closed = new Set<string>(),
) {
  if (closed.has(registration.id)) return;
  closed.add(registration.id);
  registration.close();
  for (const child of [...registrations.values()]) {
    if (child.parentId === registration.id) closeRegistration(child, closed);
  }
}

export function registerTransientLayer(registration: TransientLayerRegistration) {
  registrations.set(registration.id, registration);
  return () => {
    if (registrations.get(registration.id) === registration) {
      registrations.delete(registration.id);
    }
  };
}

export function activateTransientLayer({
  id,
  family,
}: Readonly<Pick<TransientLayerRegistration, "id" | "family" | "parentId">>) {
  const closed = new Set<string>();
  for (const registration of [...registrations.values()]) {
    if (registration.id === id) continue;

    if (family === "infotip") {
      if (registration.family === "infotip") closeRegistration(registration, closed);
      continue;
    }

    // Root shell families are mutually exclusive. Opening one also clears every non-modal help
    // layer. An InfoTip deliberately leaves its parent mounted only in the branch above, where the
    // layer being activated is itself an InfoTip.
    closeRegistration(registration, closed);
  }
}

export function dismissTransientLayerDescendants(parentId: string) {
  const closed = new Set<string>();
  for (const registration of [...registrations.values()]) {
    if (registration.parentId === parentId) closeRegistration(registration, closed);
  }
}

export function dismissNonModalTransientLayers() {
  const closed = new Set<string>();
  for (const registration of [...registrations.values()]) {
    closeRegistration(registration, closed);
  }
}

export function resetTransientLayersForTests() {
  registrations.clear();
}
