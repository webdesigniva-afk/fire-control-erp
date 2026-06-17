"use client";

import { useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "./input";

type PinInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export function PinInput({ className = "", ...props }: PinInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? "text" : "password"}
        inputMode="numeric"
        maxLength={4}
        className={`pr-11 ${className}`}
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-100"
        aria-label={visible ? "Скрий ПИН" : "Покажи ПИН"}
        title={visible ? "Скрий ПИН" : "Покажи ПИН"}
      >
        {visible ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </div>
  );
}
