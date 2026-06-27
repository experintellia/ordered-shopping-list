import {
  Fragment,
  ReactNode,
  RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Draggable, DraggableData } from "./draggable";
import {
  addCustomAisle,
  deleteCustomAisle,
  deleteItem,
  effectiveAisleOrder,
  exportState,
  importState,
  isCustomAisle,
  itemsByAisle,
  recategorize,
  renameItem,
  setAisleOrder,
} from "../store";
import { LangPref } from "../i18n";
import { useStore } from "../react-store";
import { CompletedMode } from "../visibility";
import { ActionRow, DoneButton, Sheet, SheetTitle, useUI } from "./ui";

// ---- item menu ---------------------------------------------------------------

export function ItemSheet(props: { id: string; onClose: () => void }) {
  const { t, label } = useUI();
  useStore();
  const [moveOpen, setMoveOpen] = useState(false);
  const item = itemsByAisle()
    .flatMap((g) => g.items)
    .find((i) => i.id === props.id);

  useEffect(() => {
    if (!item) props.onClose();
  }, [item, props]);
  if (!item) return null;

  return (
    <Sheet>
      <SheetTitle title={item.name} subtitle={label(item.category)} />
      {!moveOpen ? (
        <>
          <ActionRow
            label={"↔︎ " + t("menu_move")}
            onClick={() => setMoveOpen(true)}
          />
          <ActionRow
            label={"✏️ " + t("menu_rename")}
            onClick={() => {
              const next = window.prompt(t("rename_prompt"), item.name);
              if (next != null && next.trim()) renameItem(item.id, next);
              props.onClose();
            }}
          />
          <ActionRow
            label={"🗑 " + t("menu_delete")}
            danger
            onClick={() => {
              deleteItem(item.id);
              props.onClose();
            }}
          />
        </>
      ) : (
        <>
          <div className="section-label">{t("sheet_move_label")}</div>
          {effectiveAisleOrder().map((cat) => (
            <ActionRow
              key={cat}
              label={label(cat)}
              ticked={cat === item.category}
              onClick={() => {
                if (cat !== item.category) recategorize(item.id, cat);
                props.onClose();
              }}
            />
          ))}
        </>
      )}
    </Sheet>
  );
}

// ---- manage aisles (react-draggable reorder + custom groups) -----------------

function DraggableRow(props: {
  cat: string;
  index: number;
  count: number;
  order: string[];
  label: string;
  countLabel: string;
  custom: boolean;
  onCommit: (next: string[]) => void;
  onDelete: () => void;
  onDragMove: (from: number, to: number) => void;
  onDragEnd: () => void;
}) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const rowH = useRef(56);
  const lastTo = useRef(props.index);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  const targetFor = (dy: number) =>
    Math.max(
      0,
      Math.min(props.count - 1, props.index + Math.round(dy / rowH.current)),
    );

  return (
    <Draggable
      axis="y"
      handle=".drag-handle"
      nodeRef={nodeRef as RefObject<HTMLElement>}
      position={pos}
      onStart={() => {
        rowH.current = nodeRef.current?.offsetHeight || 56;
        lastTo.current = props.index;
        props.onDragMove(props.index, props.index);
      }}
      onDrag={(_e: unknown, d: DraggableData) => {
        setPos({ x: 0, y: d.y });
        const to = targetFor(d.y);
        if (to !== lastTo.current) {
          lastTo.current = to;
          props.onDragMove(props.index, to);
        }
      }}
      onStop={(_e: unknown, d: DraggableData) => {
        setPos({ x: 0, y: 0 });
        const target = targetFor(d.y);
        if (target !== props.index) {
          const next = [...props.order];
          const [m] = next.splice(props.index, 1);
          next.splice(target, 0, m);
          props.onCommit(next);
        }
        props.onDragEnd();
      }}
    >
      <div
        ref={nodeRef}
        className={"manage-row" + (props.custom ? " custom-aisle" : "")}
        data-cat={props.cat}
      >
        <span className="drag-handle" aria-hidden="true">
          ≡
        </span>
        <span className="name">
          {props.label}
          {props.countLabel}
        </span>
        {props.custom ? (
          <button
            className="del-aisle"
            aria-label="Delete group"
            onClick={props.onDelete}
          >
            ✕
          </button>
        ) : null}
      </div>
    </Draggable>
  );
}

export function ManageSheet(props: { onClose: () => void }) {
  const { t, label } = useUI();
  useStore();
  const ext = effectiveAisleOrder();
  const extKey = ext.join("|");
  const [order, setOrder] = useState<string[]>(ext);
  const [newName, setNewName] = useState("");
  // live drop indicator: where the dragged row would land
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);

  // adopt external order changes (e.g. a peer reordered, or a group was added)
  useEffect(() => {
    setOrder((prev) => (prev.join("|") === extKey ? prev : extKey.split("|")));
  }, [extKey]);

  const counts = new Map<string, number>();
  for (const g of itemsByAisle()) counts.set(g.category, g.items.length);

  const commit = (next: string[]) => {
    setOrder(next);
    setAisleOrder(next);
  };
  const addGroup = () => {
    const n = newName.trim();
    if (!n) return;
    addCustomAisle(n);
    setNewName("");
  };

  // show the line above the target row when moving up, below it when moving down
  const lineBefore = (i: number) =>
    drag && drag.to === i && drag.to < drag.from;
  const lineAfter = (i: number) => drag && drag.to === i && drag.to > drag.from;

  return (
    <Sheet>
      <SheetTitle title={t("manage_title")} subtitle={t("manage_subtitle")} />
      <div className={"manage-list" + (drag ? " dragging" : "")}>
        {order.map((cat, index) => {
          const c = counts.get(cat) || 0;
          return (
            <Fragment key={cat}>
              {lineBefore(index) ? <div className="drop-line" /> : null}
              <DraggableRow
                cat={cat}
                index={index}
                count={order.length}
                order={order}
                custom={isCustomAisle(cat)}
                label={label(cat)}
                countLabel={c ? ` · ${c}` : " " + t("empty_suffix")}
                onCommit={commit}
                onDelete={() => {
                  if (window.confirm(t("delete_group_confirm")))
                    deleteCustomAisle(cat);
                }}
                onDragMove={(from, to) => setDrag({ from, to })}
                onDragEnd={() => setDrag(null)}
              />
              {lineAfter(index) ? <div className="drop-line" /> : null}
            </Fragment>
          );
        })}
      </div>
      <div className="add-group">
        <input
          value={newName}
          placeholder={t("manage_new_group")}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addGroup();
          }}
        />
        <button onClick={addGroup}>{t("manage_add_group")}</button>
      </div>
      <DoneButton onClick={props.onClose} label={t("done")} />
    </Sheet>
  );
}

// ---- settings ----------------------------------------------------------------

export function SettingsSheet(props: {
  completedMode: CompletedMode;
  setCompletedMode: (m: CompletedMode) => void;
  showWho: boolean;
  setShowWho: (v: boolean) => void;
  langPref: LangPref;
  setLangPref: (p: LangPref) => void;
  onClose: () => void;
  openExport: () => void;
  openImport: () => void;
}) {
  const { t } = useUI();
  const modes: CompletedMode[] = ["show", "session", "hide"];
  const langs: LangPref[] = ["auto", "en", "de"];
  return (
    <Sheet>
      <SheetTitle title={t("settings_title")} />
      <div className="settings">
        <SettingsGroup label={t("settings_completed")}>
          {modes.map((m) => (
            <RadioRow
              key={m}
              label={t("completed_" + m)}
              selected={props.completedMode === m}
              onClick={() => props.setCompletedMode(m)}
            />
          ))}
        </SettingsGroup>

        <SettingsGroup label={t("settings_display")}>
          <SwitchRow
            label={t("settings_show_who")}
            on={props.showWho}
            onToggle={() => props.setShowWho(!props.showWho)}
          />
        </SettingsGroup>

        <SettingsGroup label={t("settings_language")}>
          {langs.map((p) => (
            <RadioRow
              key={p}
              label={t("lang_" + p)}
              selected={props.langPref === p}
              onClick={() => props.setLangPref(p)}
            />
          ))}
        </SettingsGroup>

        <SettingsGroup label={t("settings_data")}>
          <NavRow label={t("data_export")} onClick={props.openExport} />
          <NavRow label={t("data_import")} onClick={props.openImport} />
        </SettingsGroup>
      </div>
      <DoneButton onClick={props.onClose} label={t("done")} />
    </Sheet>
  );
}

function SettingsGroup(props: { label: string; children: ReactNode }) {
  return (
    <div className="settings-group">
      <div className="settings-group-label">{props.label}</div>
      <div className="settings-card">{props.children}</div>
    </div>
  );
}

function RadioRow(props: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={"settings-row" + (props.selected ? " selected" : "")}
      onClick={props.onClick}
    >
      <span>{props.label}</span>
      {props.selected ? <span className="radio-tick">✓</span> : null}
    </button>
  );
}

function NavRow(props: { label: string; onClick: () => void }) {
  return (
    <button className="settings-row" onClick={props.onClick}>
      <span>{props.label}</span>
      <span className="chevron">›</span>
    </button>
  );
}

function SwitchRow(props: {
  label: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      className="settings-row"
      role="switch"
      aria-checked={props.on}
      onClick={props.onToggle}
    >
      <span>{props.label}</span>
      <span className={"switch" + (props.on ? " on" : "")}>
        <span className="knob" />
      </span>
    </button>
  );
}

// ---- export / import ---------------------------------------------------------

export function ExportSheet(props: { onClose: () => void }) {
  const { t } = useUI();
  const json = useMemo(() => JSON.stringify(exportState(), null, 2), []);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
    } catch {
      /* clipboard may be unavailable; the textarea is still selectable */
    }
  };
  const download = () => {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "grocery-list.json";
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Sheet>
      <SheetTitle title={t("export_title")} subtitle={t("export_hint")} />
      <textarea
        className="data-area"
        readOnly
        value={json}
        onFocus={(e) => e.currentTarget.select()}
      />
      <ActionRow
        label={copied ? t("export_copied") : t("export_copy")}
        onClick={copy}
      />
      <ActionRow label={t("export_download")} onClick={download} />
      <DoneButton onClick={props.onClose} label={t("done")} />
    </Sheet>
  );
}

export function ImportSheet(props: { onClose: () => void }) {
  const { t } = useUI();
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const apply = () => {
    try {
      importState(JSON.parse(text));
      props.onClose();
    } catch {
      setError(t("import_invalid"));
    }
  };
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result || ""));
    reader.readAsText(f);
  };
  return (
    <Sheet>
      <SheetTitle title={t("import_title")} subtitle={t("import_hint")} />
      <textarea
        className="data-area"
        value={text}
        placeholder="{ … }"
        onChange={(e) => {
          setText(e.target.value);
          setError("");
        }}
      />
      <input
        type="file"
        accept="application/json,.json"
        className="file-input"
        onChange={onFile}
      />
      {error ? <div className="import-error">{error}</div> : null}
      <ActionRow label={t("import_apply")} onClick={apply} danger />
      <DoneButton onClick={props.onClose} label={t("done")} />
    </Sheet>
  );
}
