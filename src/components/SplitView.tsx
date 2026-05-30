import { useState, useCallback } from "react";
import { Terminal } from "./Terminal";

interface SplitViewProps {
  sessionId: string;
  direction?: "horizontal" | "vertical";
}

export function SplitView({ sessionId, direction = "vertical" }: SplitViewProps) {
  const [splits, setSplits] = useState<string[]>([sessionId]);
  const [splitDir] = useState(direction);

  const addSplit = useCallback(() => {
    setSplits((prev) => [...prev, sessionId]);
  }, [sessionId]);

  const removeSplit = useCallback((index: number) => {
    setSplits((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const isHorizontal = splitDir === "horizontal";

  return (
    <div
      className={`w-full h-full flex ${isHorizontal ? "flex-row" : "flex-col"}`}
    >
      {splits.map((sid, index) => (
        <div
          key={`${sid}-${index}`}
          className={`relative ${isHorizontal ? "h-full" : "w-full"}`}
          style={{
            flex: `1 1 ${100 / splits.length}%`,
          }}
        >
          {/* Split controls */}
          <div className="absolute top-1 right-1 z-10 flex gap-1">
            {splits.length > 1 && (
              <button
                onClick={() => removeSplit(index)}
                className="w-5 h-5 flex items-center justify-center text-fg-2 hover:text-error bg-bg-2/80 rounded text-2xs"
                title="Close split"
              >
                X
              </button>
            )}
          </div>
          <Terminal sessionId={sid} />
          {/* Divider */}
          {index < splits.length - 1 && (
            <div
              className={`absolute ${
                isHorizontal
                  ? "right-0 top-0 bottom-0 w-px bg-border cursor-col-resize"
                  : "bottom-0 left-0 right-0 h-px bg-border cursor-row-resize"
              }`}
            />
          )}
        </div>
      ))}
      {/* Add split button */}
      <div
        className={`absolute ${isHorizontal ? "right-1 top-1/2 -translate-y-1/2" : "bottom-1 left-1/2 -translate-x-1/2"} z-10`}
      >
        <button
          onClick={addSplit}
          className="w-5 h-5 flex items-center justify-center text-fg-2 hover:text-fg-0 bg-bg-2/80 rounded text-2xs"
          title="Split"
        >
          +
        </button>
      </div>
    </div>
  );
}
