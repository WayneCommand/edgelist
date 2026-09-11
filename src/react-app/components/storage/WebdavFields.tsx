import type { S3Form } from "../../lib/storage";
import { StorageField } from "./StorageField";
import { StorageToggle } from "./StorageToggle";

export function WebdavFields({
	addition,
	update,
	input,
}: {
	addition: S3Form;
	update: (field: string, value: string | number | boolean) => void;
	input: (field: string, fallback?: string) => string;
}) {
	return (
		<section>
			<h3 className="mb-3 text-base font-semibold">WebDAV 连接凭证</h3>
			<div className="grid gap-3 sm:grid-cols-2">
				<StorageField label="供应商">
					<select
						value={input("provider", "other")}
						onChange={(event) => update("provider", event.target.value)}
						className="w-full rounded-lg border border-slate-200 px-3 py-2"
					>
						<option value="other">其他</option>
						<option value="jianguoyun">坚果云</option>
						<option value="nextcloud">Nextcloud</option>
						<option value="owncloud">ownCloud</option>
					</select>
				</StorageField>
				<StorageField label="地址" required>
					<input
						required
						value={input("url", input("address"))}
						onChange={(event) => update("url", event.target.value)}
						placeholder="https://dav.example.com/dav/"
						className="w-full rounded-lg border border-slate-200 px-3 py-2"
					/>
				</StorageField>
				<StorageField label="用户名" required>
					<input
						required
						value={input("username")}
						onChange={(event) => update("username", event.target.value)}
						className="w-full rounded-lg border border-slate-200 px-3 py-2"
					/>
				</StorageField>
				<StorageField label="密码" required>
					<input
						required
						type="password"
						value={input("password")}
						onChange={(event) => update("password", event.target.value)}
						className="w-full rounded-lg border border-slate-200 px-3 py-2"
					/>
				</StorageField>
				<StorageField label="根文件夹路径" required>
					<input
						required
						value={input("root_folder_path", "/")}
						onChange={(event) => update("root_folder_path", event.target.value)}
						className="w-full rounded-lg border border-slate-200 px-3 py-2"
					/>
				</StorageField>
				<StorageToggle
					disabled
					label="跳过 SSL 证书验证"
					checked={Boolean(addition.skip_tls_verify)}
					onChange={(value) => update("skip_tls_verify", value)}
				/>
			</div>
		</section>
	);
}
