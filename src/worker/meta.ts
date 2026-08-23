export interface MetaConfig {
	id: number;
	path: string;
	read_users?: number[];
	read_users_sub?: boolean;
	write_users?: number[];
	write_users_sub?: boolean;
	password?: string;
	write?: boolean;
	[key: string]: unknown;
}
