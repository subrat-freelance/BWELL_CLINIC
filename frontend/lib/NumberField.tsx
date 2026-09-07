"use client";

import { useEffect, useState } from "react";

type Props = { value: number; onChange: (n: number) => void } & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type"
>;

/**
 * A number box that is allowed to be empty while you type in it.
 *
 * The obvious `value={n}` + `onChange={Number(e.target.value)}` turns a cleared
 * box into "0", so the next keystroke lands after that zero and you get "02000".
 * Holding the typed text locally avoids it; the parent still only sees a number,
 * and blur normalises whatever was typed back to the canonical form.
 */
export default function NumberField({ value, onChange, ...rest }: Props) {
  const [text, setText] = useState(String(value));

  // Re-sync when the value changes from outside — Discard, or switching patient.
  useEffect(() => {
    if (text === "" ? value !== 0 : Number(text) !== value) setText(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <input
      {...rest}
      type="number"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onChange(e.target.value === "" ? 0 : Number(e.target.value));
      }}
      onBlur={(e) => {
        setText(String(value));
        rest.onBlur?.(e);
      }}
    />
  );
}
