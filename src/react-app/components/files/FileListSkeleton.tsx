import { Skeleton } from "@heroui/react";

export function FileListSkeleton() {
	return <div className="divide-y divide-separator">{Array.from({ length: 7 }, (_, index) => <div key={index} className="flex items-center gap-4 px-5 py-4"><Skeleton className="h-8 w-8 rounded-lg" /><div className="flex min-w-0 flex-1 flex-col gap-2"><Skeleton className="h-4 w-2/5 rounded-md" /><Skeleton className="h-3 w-1/4 rounded-md" /></div><Skeleton className="hidden h-3 w-24 rounded-md sm:block" /><Skeleton className="hidden h-3 w-28 rounded-md md:block" /></div>)}</div>;
}
