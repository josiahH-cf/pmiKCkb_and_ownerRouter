// Compatibility re-export for the explicit Test routes that stage 3 removes. Live persistence
// boundaries import the neutrally named module directly so their runtime graph stays Test-free.
export {
  assertTestDataModeWriteAllowed,
  assertTestLaneSurfaceAllowed,
} from "@/lib/environment/data-mode-write-boundary";
