export interface EdgeListBindings {
	EDGE_CONFIG: KVNamespace;
}

export interface EdgeListConfig {
	accessKey: string;
	secretKey: string;
	issuer?: string;
}

export const CONFIG_KEYS = {
	auth: "config:auth",
	storages: "config:storages",
	metas: "config:metas",
} as const;

export async function readConfig(
	kv: KVNamespace,
	key: string,
): Promise<unknown | null> {
	const value = await kv.get(key, "json");
	return value ?? null;
}
