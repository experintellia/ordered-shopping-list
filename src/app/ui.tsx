import { createContext, ReactNode, useContext } from "react";
import { Lang, categoryLabel, t } from "../i18n";

// ---- language context --------------------------------------------------------

export const LangContext = createContext<Lang>("en");

export function useUI() {
  const lang = useContext(LangContext);
  return {
    lang,
    t: (key: string) => t(key, lang),
    label: (cat: string) => categoryLabel(cat, lang),
  };
}

// ---- shared presentational bits ---------------------------------------------

export function Overlay(props: { onClose: () => void; children: ReactNode }) {
  return (
    <div
      className="overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      {props.children}
    </div>
  );
}

export function Sheet(props: { children: ReactNode }) {
  return (
    <div className="sheet">
      <div className="grip" />
      {props.children}
    </div>
  );
}

export function SheetTitle(props: { title: string; subtitle?: string }) {
  return (
    <div className="sheet-title">
      {props.title}
      {props.subtitle ? <small>{props.subtitle}</small> : null}
    </div>
  );
}

export function ActionRow(props: {
  label: ReactNode;
  onClick: () => void;
  danger?: boolean;
  ticked?: boolean;
}) {
  return (
    <button
      className={"action" + (props.danger ? " danger" : "")}
      onClick={props.onClick}
    >
      {props.label}
      {props.ticked ? <span className="tick">✓</span> : null}
    </button>
  );
}

export function DoneButton(props: { onClick: () => void; label: string }) {
  return (
    <button className="done" onClick={props.onClick}>
      {props.label}
    </button>
  );
}

export function firstName(addr: string): string {
  return addr.split(/[@\s]/)[0];
}
