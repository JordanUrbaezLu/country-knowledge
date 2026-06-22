import SegmentedToggle from "./SegmentedToggle";

export type AppMode = "explore" | "solo" | "multiplayer";

const OPTIONS = [
  { value: "explore" as const, label: "Explore" },
  { value: "solo" as const, label: "Solo" },
  { value: "multiplayer" as const, label: "Online" },
];

export default function ModeSwitcher({
  mode,
  onChange,
}: {
  mode: AppMode;
  onChange: (m: AppMode) => void;
}) {
  return (
    <div className="pointer-events-auto rounded-full shadow-lg shadow-black/30">
      <SegmentedToggle options={OPTIONS} value={mode} onChange={onChange} shape="pill" size="sm" />
    </div>
  );
}
