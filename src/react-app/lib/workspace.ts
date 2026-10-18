/**
 * What the app knows about the deployment, loaded once.
 *
 * Three reads the whole interface depends on — who is signed in, which storages
 * are mounted, and what each driver can do — and they are loaded together because
 * every one of them is needed before the first listing can be drawn sensibly:
 *
 * - the **mount list** is what tells the client whether a directory can be written
 *   to at all, and whether a large file can go up in parts;
 * - the **driver registry** is what names a storage's driver in the storage table
 *   and in a listing's tooltip;
 * - `me` is what decides whether the management pages are reachable.
 *
 * A module store rather than context, for the same reason the token store is: a
 * `lib/` function that has to refuse an upload needs the answer, and it should not
 * need a React tree to ask. One `useWorkspace()` subscribes for the components that
 * render from it.
 *
 * Every read fails on its own. A driver list that could not be fetched leaves the
 * *capabilities* unknown while the storages still resolve, and unknown is treated
 * as permissive everywhere it is read — a transient error must not lock the write
 * buttons that the server would have accepted.
 */

import { useSyncExternalStore } from "react";
import { fetchMe, listDrivers, listStorages } from "./api";
import type { DriverInfo, MeResult, StorageConfig } from "./types";

export type Workspace = {
	/** The signed-in identity, or `null` before the first read and on failure. */
	me: MeResult | null;
	storages: StorageConfig[];
	drivers: DriverInfo[];
	/** Mount paths, in the order the server returned them. */
	mounts: string[];
	/** Mounts whose driver can reassemble a split upload. */
	chunkable: string[];
	/** `true` once the three reads have settled, successfully or not. */
	loaded: boolean;
	/** Whether the storage read succeeded. `false` means "unknown", not "none". */
	storagesLoaded: boolean;
};

const EMPTY: Workspace = {
	me: null,
	storages: [],
	drivers: [],
	mounts: [],
	chunkable: [],
	loaded: false,
	storagesLoaded: false,
};

let workspace: Workspace = EMPTY;
const listeners = new Set<() => void>();
let inFlight: Promise<void> | null = null;

function emit() {
	for (const listener of listeners) listener();
}

function mountPathOf(storage: StorageConfig): string | null {
	if (typeof storage.mount_path !== "string") return null;
	const trimmed = storage.mount_path.replace(/\/+$/, "");
	return trimmed || "/";
}

/** The mounts whose driver declares `multipart`. */
function chunkableMounts(storages: StorageConfig[], drivers: DriverInfo[]): string[] {
	const capable = new Set(
		drivers
			.filter((driver) => (driver.capabilities ?? []).includes("multipart"))
			.map((driver) => String(driver.key).toLowerCase()),
	);
	const mounts: string[] = [];
	for (const storage of storages) {
		const mount = mountPathOf(storage);
		if (!mount || typeof storage.driver !== "string") continue;
		if (!capable.has(String(storage.driver).toLowerCase())) continue;
		mounts.push(mount);
	}
	return mounts;
}

/**
 * Loads the workspace.
 *
 * De-duplicated: three components mounting at once must not issue three copies of
 * every read. `refresh` forces a new round, which the storage page does after a
 * write.
 */
export function loadWorkspace(refresh = false): Promise<void> {
	if (inFlight && !refresh) return inFlight;
	inFlight = (async () => {
		const [me, storages, drivers] = await Promise.all([
			fetchMe().catch(() => null),
			listStorages()
				.then((page) => page.content ?? [])
				.catch(() => null),
			listDrivers().catch(() => null),
		]);
		const resolvedStorages = storages ?? workspace.storages;
		const resolvedDrivers = drivers ?? workspace.drivers;
		workspace = {
			me: me ?? workspace.me,
			storages: resolvedStorages,
			drivers: resolvedDrivers,
			mounts: resolvedStorages.map(mountPathOf).filter((mount): mount is string => mount !== null),
			chunkable: chunkableMounts(resolvedStorages, resolvedDrivers),
			loaded: true,
			storagesLoaded: storages !== null,
		};
		inFlight = null;
		emit();
	})();
	return inFlight;
}

/** Clears the workspace, e.g. on sign-out. */
export function resetWorkspace() {
	workspace = EMPTY;
	inFlight = null;
	emit();
}

export function getWorkspace(): Workspace {
	return workspace;
}

export function subscribeWorkspace(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function useWorkspace(): Workspace {
	return useSyncExternalStore(subscribeWorkspace, getWorkspace, getWorkspace);
}

/** The driver definition serving a storage, tolerating OpenList's spelling. */
export function driverFor(drivers: readonly DriverInfo[], key: string): DriverInfo | undefined {
	const value = String(key).toLowerCase();
	return drivers.find((driver) => driver.key.toLowerCase() === value || driver.name.toLowerCase() === value);
}

/** A driver's label, falling back to the raw key before the registry loads. */
export function driverLabel(drivers: readonly DriverInfo[], key: string): string {
	return driverFor(drivers, key)?.name ?? String(key);
}
