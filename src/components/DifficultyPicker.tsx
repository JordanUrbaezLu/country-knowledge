import {
  DIFFICULTIES,
  DIFFICULTY_BLURB,
  DIFFICULTY_LABELS,
  type Difficulty,
} from "../game/questions";
import SegmentedToggle from "./SegmentedToggle";

/** Segmented Easy / Medium / Hard selector with a one-line blurb for the choice. */
export default function DifficultyPicker({
  value,
  onChange,
}: {
  value: Difficulty;
  onChange: (d: Difficulty) => void;
}) {
  const options = DIFFICULTIES.map((d) => ({ value: d, label: DIFFICULTY_LABELS[d] }));
  return (
    <div>
      <SegmentedToggle options={options} value={value} onChange={onChange} shape="segment" size="sm" />
      <p className="mt-2 text-center text-xs text-slate-400">{DIFFICULTY_BLURB[value]}</p>
    </div>
  );
}
