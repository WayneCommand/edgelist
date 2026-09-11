import type { Storage } from "./types";

export type S3Form = Record<string, string | number | boolean>;

export function readS3Form(addition: string): S3Form {
	try {
		return JSON.parse(addition) as S3Form;
	} catch {
		return {};
	}
}

export function newStorage(): Storage {
	return {
		id: 0,
		mount_path: "/",
		driver: "object",
		addition: JSON.stringify({
			root_folder_path: "/",
			force_path_style: false,
			list_object_version: "v2",
			sign_url_expire: 4,
		}),
		remark: "",
		order: 0,
		status: "work",
		order_by: "name",
		order_direction: "asc",
		extract_folder: "front",
		disabled: false,
	};
}

export function storageForEditor(storage: Storage): Storage {
	return { ...storage, driver: String(storage.driver).toLowerCase() === "s3" ? "object" : storage.driver };
}
