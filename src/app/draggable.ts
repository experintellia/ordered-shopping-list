import { ComponentType, ReactNode, RefObject } from "react";
import RawDraggable, { DraggableData } from "react-draggable";

export type { DraggableData };

// react-draggable's bundled types mark every prop required; cast to a permissive
// component type so we can pass just the props we use. (Drag itself is enabled
// app-wide via `define: process.env.DRAGGABLE_DEBUG` in the Vite configs.)
export const Draggable = RawDraggable as unknown as ComponentType<{
  axis?: "x" | "y" | "both" | "none";
  handle?: string;
  nodeRef?: RefObject<HTMLElement>;
  position?: { x: number; y: number };
  onStart?: () => void;
  onDrag?: (e: unknown, data: DraggableData) => void;
  onStop?: (e: unknown, data: DraggableData) => void;
  children?: ReactNode;
}>;
