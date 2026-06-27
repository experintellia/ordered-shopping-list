import { useSyncExternalStore } from "react";
import { getSnapshot, subscribe } from "./store";

/** Subscribe a component to shared-doc changes. Returns nothing; call store read
 *  functions directly in render — this just triggers a re-render on any change. */
export function useStore(): void {
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
