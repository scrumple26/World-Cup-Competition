"use client";

import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { TeamBadge } from "../TeamBadge";

interface Team {
  id: number;
  name: string;
  logo: string;
}

const POS_LABELS = ["1st", "2nd", "3rd", "4th"];
const POS_NOTE   = ["advances", "advances", "3rd place", "eliminated"];

function Row({
  team,
  index,
  total,
  disabled,
  onMoveUp,
  onMoveDown,
}: {
  team: Team;
  index: number;
  total: number;
  disabled: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: team.id, disabled });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 ${
        index === 2
          ? "border-[var(--gold)]/40 bg-[var(--gold)]/5"
          : "border-[var(--border)] bg-[var(--bg-elev)]"
      } ${isDragging ? "opacity-70 ring-1 ring-[var(--accent-2)]" : ""}`}
    >
      <span className="w-7 shrink-0 text-center text-sm font-bold text-[var(--muted)]">
        {POS_LABELS[index]}
      </span>

      <span className="flex-1 truncate">
        <TeamBadge name={team.name} logo={team.logo} />
      </span>

      <span
        className={`hidden text-[10px] sm:inline ${
          index === 3 ? "text-red-300/70" : index === 2 ? "text-[var(--gold)]" : "text-[var(--accent)]"
        }`}
      >
        {POS_NOTE[index]}
      </span>

      {!disabled && (
        <div className="flex items-center gap-0.5 shrink-0">
          {/* ↑↓ arrow buttons — primary for mobile, also available on desktop */}
          <button
            type="button"
            onClick={onMoveUp}
            disabled={index === 0}
            aria-label={`Move ${team.name} up`}
            className="flex h-7 w-7 items-center justify-center rounded text-[var(--muted)] transition hover:bg-[var(--bg-card)] hover:text-[var(--fg)] disabled:opacity-30"
          >
            ▲
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={index === total - 1}
            aria-label={`Move ${team.name} down`}
            className="flex h-7 w-7 items-center justify-center rounded text-[var(--muted)] transition hover:bg-[var(--bg-card)] hover:text-[var(--fg)] disabled:opacity-30"
          >
            ▼
          </button>
          {/* Drag handle — touch-action:none prevents the page from scrolling
               when the user touches this specific element, letting dnd-kit take over */}
          <button
            {...attributes}
            {...listeners}
            aria-label={`Drag to reorder ${team.name}`}
            style={{ touchAction: "none" }}
            className="flex h-7 w-7 cursor-grab items-center justify-center rounded text-[var(--muted)] hover:bg-[var(--bg-card)] active:cursor-grabbing"
          >
            ⠿
          </button>
        </div>
      )}
    </div>
  );
}

export function GroupFinishOrder({
  teams,
  order,
  disabled = false,
  onReorder,
}: {
  teams: Team[];
  order: number[];
  disabled?: boolean;
  onReorder: (order: number[]) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const byId = new Map(teams.map((t) => [t.id, t]));
  const ordered = order.map((id) => byId.get(id)).filter(Boolean) as Team[];

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = order.indexOf(Number(active.id));
    const newIndex = order.indexOf(Number(over.id));
    onReorder(arrayMove(order, oldIndex, newIndex));
  }

  function moveUp(index: number) {
    if (index === 0) return;
    onReorder(arrayMove(order, index, index - 1));
  }

  function moveDown(index: number) {
    if (index === order.length - 1) return;
    onReorder(arrayMove(order, index, index + 1));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={order} strategy={verticalListSortingStrategy}>
        <div className="space-y-1.5">
          {ordered.map((t, i) => (
            <Row
              key={t.id}
              team={t}
              index={i}
              total={ordered.length}
              disabled={disabled}
              onMoveUp={() => moveUp(i)}
              onMoveDown={() => moveDown(i)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
