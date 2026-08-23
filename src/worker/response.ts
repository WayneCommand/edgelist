import type { Context } from "hono";

export interface OpenListResponse<T> {
	code: number;
	message: string;
	data: T;
}

export interface OpenListPage<T> {
	content: T[];
	total: number;
}

export function success<T>(data: T, message = "success"): OpenListResponse<T> {
	return { code: 200, message, data };
}

export function emptySuccess(): OpenListResponse<null> {
	return success(null);
}

export function failure(message: string, code: number): Response {
	return Response.json({ code, message, data: null } satisfies OpenListResponse<null>, {
		status: code,
	});
}

export function respond<T>(c: Context, data: T, message = "success") {
	return c.json(success(data, message));
}
