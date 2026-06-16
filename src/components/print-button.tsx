"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-xl bg-gradient-to-r from-red-500 to-orange-400 px-5 py-3 text-sm font-black text-white shadow-sm"
    >
      Печат
    </button>
  );
}
