import { RefObject, useEffect, useRef, useState } from "react";
import {
  AisleGroup,
  Item,
  deleteItem,
  recategorize,
  toggleChecked,
} from "../store";
import { Draggable, DraggableData } from "./draggable";
import { firstName, useUI } from "./ui";

// Body gestures on a row/card:
//   tap            → toggle checked
//   long-press     → open the item menu (move / rename / delete)
//   horizontal swipe left past a threshold → delete
// (vertical drag falls through to scrolling; the grip handle does aisle DnD.)
const SWIPE_DELETE_AT = 120;

function useRowGestures(id: string, onLongPress: (id: string) => void) {
  const [tx, setTx] = useState(0);
  const [animate, setAnimate] = useState(true);
  const st = useRef({
    timer: 0,
    longFired: false,
    sx: 0,
    sy: 0,
    mode: "idle" as "idle" | "swipe" | "scroll",
    tx: 0,
  });
  const clearTimer = () => {
    if (st.current.timer) window.clearTimeout(st.current.timer);
    st.current.timer = 0;
  };
  const settle = (x: number) => {
    setAnimate(true);
    setTx(x);
    st.current.tx = x;
  };

  return {
    tx,
    animate,
    handlers: {
      onPointerDown: (e: React.PointerEvent) => {
        const s = st.current;
        s.longFired = false;
        s.sx = e.clientX;
        s.sy = e.clientY;
        s.mode = "idle";
        s.tx = tx;
        setAnimate(false);
        try {
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
        } catch {
          /* not supported (e.g. happy-dom) — fine */
        }
        s.timer = window.setTimeout(() => {
          s.longFired = true;
          navigator.vibrate?.(10);
          onLongPress(id);
        }, 500);
      },
      onPointerMove: (e: React.PointerEvent) => {
        const s = st.current;
        const dx = e.clientX - s.sx;
        const dy = e.clientY - s.sy;
        if (s.mode === "idle") {
          if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) {
            s.mode = "swipe";
            clearTimer();
          } else if (Math.abs(dy) > 10) {
            s.mode = "scroll";
            clearTimer();
          }
        }
        if (s.mode === "swipe") {
          const nx = Math.max(-220, Math.min(0, dx));
          s.tx = nx;
          setTx(nx);
        }
      },
      onPointerUp: () => {
        const s = st.current;
        clearTimer();
        if (s.mode === "swipe") {
          if (s.tx <= -SWIPE_DELETE_AT) deleteItem(id);
          else settle(0);
        } else if (s.mode === "idle" && !s.longFired) {
          toggleChecked(id);
        }
      },
      onPointerCancel: () => {
        clearTimer();
        settle(0);
      },
    },
  };
}

// Drag an item by its grip and drop it onto another aisle's column/section.
// The drop target is found by hit-testing the dragged node's centre against any
// ancestor carrying a [data-aisle] attribute.
function useItemDrag(item: Item, onDropAisle: (a: string | null) => void) {
  const nodeRef = useRef<HTMLElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  const aisleAtCentre = (): string | null => {
    const node = nodeRef.current;
    if (!node) return null;
    const r = node.getBoundingClientRect();
    const els = document.elementsFromPoint(
      r.left + r.width / 2,
      r.top + r.height / 2,
    );
    for (const el of els) {
      if (node.contains(el)) continue; // skip the dragged card itself
      const target = (el as HTMLElement).closest?.("[data-aisle]");
      if (target) return target.getAttribute("data-aisle");
    }
    return null;
  };

  return {
    nodeRef,
    draggable: {
      nodeRef: nodeRef as RefObject<HTMLElement>,
      position: pos,
      onDrag: (_e: unknown, d: DraggableData) => {
        setPos({ x: d.x, y: d.y });
        onDropAisle(aisleAtCentre());
      },
      onStop: () => {
        const aisle = aisleAtCentre();
        setPos({ x: 0, y: 0 });
        onDropAisle(null);
        if (aisle && aisle !== item.category) recategorize(item.id, aisle);
      },
    },
  };
}

// stop pointer events on the grip from reaching the body's tap/swipe handlers
// (react-draggable uses mouse/touch events, which still get through)
const stopPointer = {
  onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
  onPointerUp: (e: React.PointerEvent) => e.stopPropagation(),
};

function Grip() {
  return (
    <span className="item-drag-handle" aria-label="Move item" {...stopPointer}>
      ⠿
    </span>
  );
}

function SwipeHint() {
  return (
    <div className="swipe-delete" aria-hidden="true">
      <span>🗑</span>
    </div>
  );
}

function EmptyState() {
  const { t } = useUI();
  return (
    <div className="empty">
      <div className="big">🛒</div>
      <div>{t("empty_title")}</div>
      <div>{t("empty_subtitle")}</div>
    </div>
  );
}

function swipeStyle(tx: number, animate: boolean) {
  return {
    transform: `translateX(${tx}px)`,
    transition: animate ? "transform 0.18s ease" : "none",
  };
}

// ---- list view ---------------------------------------------------------------

function Row(props: {
  item: Item;
  showWho: boolean;
  onLongPress: (id: string) => void;
  onDropAisle: (a: string | null) => void;
}) {
  const { tx, animate, handlers } = useRowGestures(
    props.item.id,
    props.onLongPress,
  );
  const { nodeRef, draggable } = useItemDrag(props.item, props.onDropAisle);
  return (
    <Draggable handle=".item-drag-handle" {...draggable}>
      <li ref={nodeRef as RefObject<HTMLLIElement>} className="row-outer">
        <SwipeHint />
        <div
          className={"row" + (props.item.checked ? " checked" : "")}
          style={swipeStyle(tx, animate)}
          {...handlers}
        >
          <span className="check">{props.item.checked ? "✓" : ""}</span>
          <span className="name">{props.item.name}</span>
          {props.showWho && props.item.addedBy ? (
            <span className="who">{firstName(props.item.addedBy)}</span>
          ) : null}
          <Grip />
        </div>
      </li>
    </Draggable>
  );
}

export function ListView(props: {
  groups: AisleGroup[];
  showWho: boolean;
  onLongPress: (id: string) => void;
}) {
  const { label } = useUI();
  const [dropAisle, setDropAisle] = useState<string | null>(null);
  if (props.groups.length === 0) return <EmptyState />;
  return (
    <div>
      {props.groups.map((g) => {
        const remaining = g.items.filter((i) => !i.checked).length;
        return (
          <section
            className={
              "section" + (dropAisle === g.category ? " drop-target" : "")
            }
            key={g.category}
            data-aisle={g.category}
          >
            <h2>
              <span>{label(g.category)}</span>
              <span>{remaining}</span>
            </h2>
            <ul className="card-list">
              {g.items.map((item) => (
                <Row
                  key={item.id}
                  item={item}
                  showWho={props.showWho}
                  onLongPress={props.onLongPress}
                  onDropAisle={setDropAisle}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

// ---- columns (kanban) view ---------------------------------------------------

function Card(props: {
  item: Item;
  showWho: boolean;
  onLongPress: (id: string) => void;
  onDropAisle: (a: string | null) => void;
}) {
  const { tx, animate, handlers } = useRowGestures(
    props.item.id,
    props.onLongPress,
  );
  const { nodeRef, draggable } = useItemDrag(props.item, props.onDropAisle);
  return (
    <Draggable handle=".item-drag-handle" {...draggable}>
      <div ref={nodeRef as RefObject<HTMLDivElement>} className="kcard-outer">
        <SwipeHint />
        <div
          className={"kcard" + (props.item.checked ? " checked" : "")}
          style={swipeStyle(tx, animate)}
          {...handlers}
        >
          <span className="check">{props.item.checked ? "✓" : ""}</span>
          <span className="name">{props.item.name}</span>
          {props.showWho && props.item.addedBy ? (
            <span className="who">{firstName(props.item.addedBy)}</span>
          ) : null}
          <Grip />
        </div>
      </div>
    </Draggable>
  );
}

export function BoardView(props: {
  groups: AisleGroup[];
  showWho: boolean;
  onLongPress: (id: string) => void;
}) {
  const { label } = useUI();
  const boardRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [dropAisle, setDropAisle] = useState<string | null>(null);

  const count = props.groups.length;
  useEffect(() => {
    if (active > count - 1) setActive(Math.max(0, count - 1));
  }, [count, active]);

  if (count === 0) return <EmptyState />;

  const jump = (idx: number) => {
    const board = boardRef.current;
    board?.querySelectorAll<HTMLElement>(".column")[idx]?.scrollIntoView({
      behavior: "smooth",
      inline: "start",
      block: "nearest",
    });
    setActive(idx);
  };

  // track the column nearest the left edge as the user scrolls horizontally
  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const board = e.currentTarget;
    const cols = [...board.querySelectorAll<HTMLElement>(".column")];
    let best = 0;
    let bestD = Infinity;
    cols.forEach((c, i) => {
      const d = Math.abs(c.offsetLeft - board.scrollLeft);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (best !== active) setActive(best);
  };

  return (
    <div className="board-wrap">
      <div className="aisle-switch sticky">
        {props.groups.map((g, idx) => (
          <button
            key={g.category}
            className={"chip" + (idx === active ? " active" : "")}
            onClick={() => jump(idx)}
          >
            {label(g.category)} {g.items.filter((i) => !i.checked).length}
          </button>
        ))}
      </div>
      <div className="board" ref={boardRef} onScroll={onScroll}>
        {props.groups.map((g) => (
          <div
            className={
              "column" + (dropAisle === g.category ? " drop-target" : "")
            }
            key={g.category}
            data-aisle={g.category}
          >
            <h2>{label(g.category)}</h2>
            <div className="cards">
              {g.items.map((item) => (
                <Card
                  key={item.id}
                  item={item}
                  showWho={props.showWho}
                  onLongPress={props.onLongPress}
                  onDropAisle={setDropAisle}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
