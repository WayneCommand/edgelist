import type { ReactNode } from "react";

export function StorageField({ label, required = false, children }: { label: string; required?: boolean; children: ReactNode }) {
	return <label className="block text-sm font-medium text-slate-700"><span className="mb-1.5 block">{label}{required && <span className="ml-1 text-red-500">*</span>}</span>{children}</label>;
}
