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

// Body gestures on a list row:
//   tap                                   → toggle checked
//   horizontal swipe left past threshold  → delete
// (vertical drag falls through to scrolling. Item options live in the ⋮ menu;
//  in the board view the whole card is draggable to move it between aisles.)
const SWIPE_DELETE_AT = 120;

function useRowGestures(id: string) {
  const [tx, setTx] = useState(0);
  const [animate, setAnimate] = useState(true);
  const st = useRef({
    sx: 0,
    sy: 0,
    mode: "idle" as "idle" | "swipe" | "scroll",
    tx: 0,
  });
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
      },
      onPointerMove: (e: React.PointerEvent) => {
        const s = st.current;
        const dx = e.clientX - s.sx;
        const dy = e.clientY - s.sy;
        if (s.mode === "idle") {
          if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy))
            s.mode = "swipe";
          else if (Math.abs(dy) > 10) s.mode = "scroll";
        }
        if (s.mode === "swipe") {
          const nx = Math.max(-220, Math.min(0, dx));
          s.tx = nx;
          setTx(nx);
        }
      },
      onPointerUp: () => {
        const s = st.current;
        if (s.mode === "swipe") {
          if (s.tx <= -SWIPE_DELETE_AT) deleteItem(id);
          else settle(0);
        } else if (s.mode === "idle") {
          toggleChecked(id);
        }
      },
      onPointerCancel: () => settle(0),
    },
  };
}

// Drag the whole card and drop it onto another aisle's column. The drop target
// is found by hit-testing the dragged node's centre against any ancestor with a
// [data-aisle] attribute. A press that doesn't move is treated as a tap (onTap).
function useItemDrag(
  item: Item,
  onDropAisle: (a: string | null) => void,
  onTap: () => void,
) {
  const nodeRef = useRef<HTMLElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const moved = useRef(false);

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
      onStart: () => {
        moved.current = false;
      },
      onDrag: (_e: unknown, d: DraggableData) => {
        if (Math.abs(d.x) > 5 || Math.abs(d.y) > 5) moved.current = true;
        setPos({ x: d.x, y: d.y });
        onDropAisle(aisleAtCentre());
      },
      onStop: () => {
        const aisle = aisleAtCentre();
        setPos({ x: 0, y: 0 });
        onDropAisle(null);
        if (!moved.current) {
          onTap(); // a click, not a drag → toggle checked
          return;
        }
        if (aisle && aisle !== item.category) recategorize(item.id, aisle);
      },
    },
  };
}

// stop pointer events on the menu button from reaching the row's tap/swipe
// handlers (the card's drag is excluded separately via Draggable's `cancel`).
const stopPointer = {
  onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
  onPointerUp: (e: React.PointerEvent) => e.stopPropagation(),
};

// ⋮ button: opens the item menu (move / rename / delete). Replaces both the
// drag grip and the long-press gesture.
function MenuButton(props: { id: string; onOpen: (id: string) => void }) {
  return (
    <button
      className="item-menu-btn"
      aria-label="Item options"
      onClick={(e) => {
        e.stopPropagation();
        props.onOpen(props.id);
      }}
      {...stopPointer}
    >
      ⋮
    </button>
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
  onOpenMenu: (id: string) => void;
}) {
  const { tx, animate, handlers } = useRowGestures(props.item.id);
  return (
    <li className="row-outer">
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
        <MenuButton id={props.item.id} onOpen={props.onOpenMenu} />
      </div>
    </li>
  );
}

export function ListView(props: {
  groups: AisleGroup[];
  showWho: boolean;
  onOpenMenu: (id: string) => void;
}) {
  const { label } = useUI();
  if (props.groups.length === 0) return <EmptyState />;
  return (
    <div>
      {props.groups.map((g) => {
        const remaining = g.items.filter((i) => !i.checked).length;
        return (
          <section className="section" key={g.category} data-aisle={g.category}>
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
                  onOpenMenu={props.onOpenMenu}
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
  onOpenMenu: (id: string) => void;
  onDropAisle: (a: string | null) => void;
}) {
  const { nodeRef, draggable } = useItemDrag(
    props.item,
    props.onDropAisle,
    () => toggleChecked(props.item.id),
  );
  return (
    <Draggable {...draggable} cancel=".item-menu-btn">
      <div ref={nodeRef as RefObject<HTMLDivElement>} className="kcard-outer">
        <div className={"kcard" + (props.item.checked ? " checked" : "")}>
          <span className="check">{props.item.checked ? "✓" : ""}</span>
          <span className="name">{props.item.name}</span>
          {props.showWho && props.item.addedBy ? (
            <span className="who">{firstName(props.item.addedBy)}</span>
          ) : null}
          <MenuButton id={props.item.id} onOpen={props.onOpenMenu} />
        </div>
      </div>
    </Draggable>
  );
}

export function BoardView(props: {
  groups: AisleGroup[];
  showWho: boolean;
  onOpenMenu: (id: string) => void;
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
    const col = board?.querySelectorAll<HTMLElement>(".column")[idx];
    if (board && col)
      board.scrollTo({ left: col.offsetLeft, behavior: "smooth" });
    // retrigger the flash even if the same aisle is tapped twice
    col?.classList.remove("flash");
    void col?.offsetWidth;
    col?.classList.add("flash");
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
                  onOpenMenu={props.onOpenMenu}
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
