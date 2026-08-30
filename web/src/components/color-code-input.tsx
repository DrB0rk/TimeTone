"use client";

import { useState } from "react";

const COLORS = [
  { code: "A", label: "Coral", color: "#ef6f61" },
  { code: "B", label: "Ocean", color: "#3d8bfd" },
  { code: "C", label: "Lime", color: "#9acb3c" },
  { code: "D", label: "Violet", color: "#9b72cf" },
];

export function ColorCodeInput({ name }: { name: string }) {
  const [value, setValue] = useState("");
  return (
    <div className="space-y-3">
      <input type="hidden" name={name} value={value} />
      <div className="grid grid-cols-4 gap-2">
        {COLORS.map((item) => (
          <button
            key={item.code}
            type="button"
            disabled={value.length >= 8}
            onClick={() => setValue((current) => current + item.code)}
            className="h-14 rounded-xl text-xs font-semibold text-white shadow-sm transition-transform hover:-translate-y-0.5 disabled:opacity-40"
            style={{ backgroundColor: item.color }}
            aria-label={`Add ${item.label}`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between rounded-lg bg-[#f5f6f2] px-3 py-2">
        <span className="tracking-[.35em] text-[#17211b]" aria-label={`${value.length} colors selected`}>
          {value ? "● ".repeat(value.length).trim() : "Choose colors"}
        </span>
        <button type="button" onClick={() => setValue("")} className="text-xs font-semibold text-black/45 hover:text-black/75">Clear</button>
      </div>
    </div>
  );
}
