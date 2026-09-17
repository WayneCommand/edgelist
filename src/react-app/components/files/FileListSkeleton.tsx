import { Skeleton } from "@heroui/react";
import type { ViewMode } from "../../lib/preferences";

/** Placeholder shown while a directory loads, shaped like the view it replaces. */
export function FileListSkeleton({ view = "list" }: { view?: ViewMode }) {
	if (view === "grid") {
		return (
			<div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-5">
				{Array.from({ length: 10 }, (_, index) => (
					<div key={index} className="flex flex-col items-center gap-2 p-3">
						<Skeleton className="h-10 w-10 rounded-lg" />
						<Skeleton className="h-4 w-3/4 rounded-md" />
						<Skeleton className="h-3 w-1/3 rounded-md" />
					</div>
				))}
			</div>
		);
	}

	return (
		<>
			{/* Mirrors the real header, so nothing shifts when the rows arrive. */}
			<div className="flex items-center gap-4 border-b border-separator bg-surface-secondary px-5 py-2">
				<span className="h-4 w-4 shrink-0" />
				<span className="w-8 shrink-0" />
				<span className="min-w-0 flex-1">
					<Skeleton className="h-3 w-12 rounded-md" />
				</span>
				<span className="hidden w-32 justify-end sm:flex">
					<Skeleton className="h-3 w-8 rounded-md" />
				</span>
				<span className="hidden w-36 justify-end md:flex">
					<Skeleton className="h-3 w-14 rounded-md" />
				</span>
			</div>
			<div className="divide-y divide-separator">
				{Array.from({ length: 7 }, (_, index) => (
					<div key={index} className="flex items-center gap-4 px-5 py-4">
						<Skeleton className="h-4 w-4 shrink-0 rounded-md" />
						<Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
						<div className="flex min-w-0 flex-1 flex-col gap-2">
							<Skeleton className="h-4 w-2/5 rounded-md" />
							<Skeleton className="h-3 w-1/4 rounded-md" />
						</div>
						<Skeleton className="hidden h-3 w-24 rounded-md sm:block" />
						<Skeleton className="hidden h-3 w-28 rounded-md md:block" />
					</div>
				))}
			</div>
		</>
	);
}
