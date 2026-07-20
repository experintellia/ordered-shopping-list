import { useRef, useState } from "react";
import {
  LangPref,
  getLangPref,
  resolveLang,
  setLangPref as persistLangPref,
} from "../i18n";
import { addItem, checkedItemNames } from "../store";
import { useStore } from "../react-store";
import { BoardView, ListView } from "./views";
import {
  ExportSheet,
  ImportSheet,
  ItemSheet,
  ManageSheet,
  SettingsSheet,
} from "./sheets";
import { CompletedMode, visibleGroups } from "../visibility";
import { LangContext, Overlay, useUI } from "./ui";

type View = "list" | "columns";
type OverlayState =
  | { kind: "item"; id: string }
  | { kind: "manage" }
  | { kind: "settings" }
  | { kind: "export" }
  | { kind: "import" }
  | null;

// localStorage-backed UI preferences (per device, not synced)
function usePref<T extends string>(key: string, def: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => (localStorage.getItem(key) as T) || def);
  return [
    v,
    (next: T) => {
      localStorage.setItem(key, next);
      setV(next);
    },
  ];
}
function Header(props: {
  view: View;
  setView: (v: View) => void;
  onSettings: () => void;
  onManage: () => void;
}) {
  const { t } = useUI();
  return (
    <header className="bar">
      <div className="titlerow">
        <h1>{t("app_title")}</h1>
        <div className="headerbtns">
          <button
            className="iconbtn"
            aria-label={t("header_settings")}
            onClick={props.onSettings}
          >
            ⚙
          </button>
          <button className="iconbtn" onClick={props.onManage}>
            {t("header_aisles")}
          </button>
        </div>
      </div>
      <div className="segmented">
        <button
          className={props.view === "list" ? "active" : ""}
          onClick={() => props.setView("list")}
        >
          {t("view_list")}
        </button>
        <button
          className={props.view === "columns" ? "active" : ""}
          onClick={() => props.setView("columns")}
        >
          {t("view_columns")}
        </button>
      </div>
    </header>
  );
}

function AddBar() {
  const { t } = useUI();
  useStore();
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // which suggestion the current pointer went down on — a pointerup only picks
  // if the press started on the same button and never left it, so a drag that
  // merely ends on the list can't add anything
  const armed = useRef<string | null>(null);
  // Custom in-page suggestion list instead of <datalist>: the native popup is
  // broken in Android WebView and covers the on-screen keyboard.
  const query = value.trim().toLowerCase();
  const suggestions = checkedItemNames()
    .filter((n) => n.toLowerCase().includes(query) && n.toLowerCase() !== query)
    .slice(0, 6);
  return (
    <form
      className="addbar"
      onSubmit={(e) => {
        e.preventDefault();
        addItem(value);
        setValue("");
        inputRef.current?.focus();
      }}
    >
      {focused && suggestions.length > 0 && (
        <div className="suggestions" role="listbox">
          {suggestions.map((n) => {
            const pick = () => {
              addItem(n);
              setValue("");
              // the WebView blurs the input on tap despite the preventDefault;
              // refocus so consecutive picks keep the list and keyboard open
              inputRef.current?.focus();
            };
            return (
              <button
                key={n}
                type="button"
                role="option"
                aria-selected={false}
                // keep the input focused; blur would close the list
                onPointerDown={(e) => {
                  e.preventDefault();
                  armed.current = n;
                }}
                onPointerLeave={() => (armed.current = null)}
                onPointerCancel={() => (armed.current = null)}
                // add on pointerup: in the Delta Chat WebView blur fires
                // before click and unmounts the button, so click never lands.
                // A scroll gesture pointercancels first, so this stays safe.
                onPointerUp={() => {
                  if (armed.current === n) pick();
                  armed.current = null;
                }}
                // keyboard activation only (detail 0); pointer taps are
                // handled above and a real click here would double-add
                onClick={(e) => e.detail === 0 && pick()}
              >
                {n}
              </button>
            );
          })}
        </div>
      )}
      <input
        ref={inputRef}
        type="text"
        autoComplete="off"
        autoCapitalize="words"
        enterKeyHint="done"
        placeholder={t("add_placeholder")}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      <button type="submit">{t("add_button")}</button>
    </form>
  );
}

export function App() {
  useStore();
  const [view, setView] = usePref<View>("grocery.view", "list");
  const [completedMode, setCompletedMode] = usePref<CompletedMode>(
    "grocery.completed",
    "session", // hide completed after restart, but keep this session's visible
  );
  const [showWhoPref, setShowWhoPref] = usePref<"1" | "0">(
    "grocery.showWho",
    "0",
  );
  const showWho = showWhoPref === "1";
  const setShowWho = (v: boolean) => setShowWhoPref(v ? "1" : "0");
  const [notifyPref, setNotifyPref] = usePref<"1" | "0">("grocery.notify", "1");
  const notify = notifyPref === "1";
  const setNotify = (v: boolean) => setNotifyPref(v ? "1" : "0");
  const [langPref, setLangPrefState] = useState<LangPref>(getLangPref());
  const [overlay, setOverlay] = useState<OverlayState>(null);

  const lang = resolveLang(langPref);
  const changeLang = (p: LangPref) => {
    persistLangPref(p);
    setLangPrefState(p);
  };
  const close = () => setOverlay(null);
  const groups = visibleGroups(completedMode);

  return (
    <LangContext.Provider value={lang}>
      <Header
        view={view}
        setView={setView}
        onSettings={() => setOverlay({ kind: "settings" })}
        onManage={() => setOverlay({ kind: "manage" })}
      />
      <main className="content">
        {view === "list" ? (
          <ListView
            groups={groups}
            showWho={showWho}
            onOpenMenu={(id) => setOverlay({ kind: "item", id })}
          />
        ) : (
          <BoardView
            groups={groups}
            showWho={showWho}
            onOpenMenu={(id) => setOverlay({ kind: "item", id })}
          />
        )}
      </main>
      <AddBar />
      {overlay ? (
        <Overlay onClose={close}>
          {overlay.kind === "item" ? (
            <ItemSheet id={overlay.id} onClose={close} />
          ) : overlay.kind === "manage" ? (
            <ManageSheet onClose={close} />
          ) : overlay.kind === "settings" ? (
            <SettingsSheet
              completedMode={completedMode}
              setCompletedMode={setCompletedMode}
              showWho={showWho}
              setShowWho={setShowWho}
              notify={notify}
              setNotify={setNotify}
              langPref={langPref}
              setLangPref={changeLang}
              onClose={close}
              openExport={() => setOverlay({ kind: "export" })}
              openImport={() => setOverlay({ kind: "import" })}
            />
          ) : overlay.kind === "export" ? (
            <ExportSheet onClose={close} />
          ) : (
            <ImportSheet onClose={close} />
          )}
        </Overlay>
      ) : null}
    </LangContext.Provider>
  );
}
