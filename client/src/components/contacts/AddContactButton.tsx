"use client";

import { useState } from "react";
import { PlusCircle } from "lucide-react";
import { AddContactModal } from "./AddContactModal";

export function AddContactButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md bg-[#4F6DFF] px-3 py-2 text-sm font-semibold text-white shadow-[0_4px_14px_rgba(14, 165, 233,0.35)] transition-all hover:-translate-y-0.5 hover:bg-[#3B4FE6]"
      >
        <PlusCircle className="h-4 w-4" />
        Add contact
      </button>
      {open && <AddContactModal onClose={() => setOpen(false)} />}
    </>
  );
}
