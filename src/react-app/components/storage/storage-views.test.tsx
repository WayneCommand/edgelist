import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DriverInfo } from "../../lib/drivers";
import type { Storage } from "../../lib/types";
import { StorageFields } from "./StorageFields";
import { StorageTable } from "./StorageTable";

/**
 * Render smoke tests, in the same spirit as the file views: `react-dom/server`
 * catches a crashing render or a prop that no longer lines up without pulling a
 * DOM implementation into the suite. Behaviour lives in `lib/drivers.test.ts`.
 */

const S3: DriverInfo = {
	key: "object",
	name: "S3",
	common: [
		{ name: "mount_path", type: "string", default: "", required: true, help: "Unique mount path" },
		{ name: "order", type: "number", default: "0" },
	],
	additional: [
		{ name: "endpoint", type: "string", default: "", required: true },
		{ name: "force_path_style", type: "bool", default: "false" },
		{ name: "list_object_version", type: "select", default: "v2", options: "v1,v2" },
	],
};

const WEBDAV: DriverInfo = {
	key: "webdav",
	name: "WebDav",
	common: [{ name: "mount_path", type: "string", default: "", required: true }],
	additional: [{ name: "url", type: "string", default: "", required: true }],
};

const DRIVERS = [S3, WEBDAV];

function storage(overrides: Partial<Storage> = {}): Storage {
	return {
		id: 1,
		mount_path: "/waynecos",
		driver: "object",
		addition: JSON.stringify({ endpoint: "https://s3.example.com", list_object_version: "v2" }),
		remark: "cos",
		order: 3,
		status: "work",
		...overrides,
	};
}

const noop = () => {};

describe("storage table", () => {
	const tableProps = { drivers: DRIVERS, busyId: null, onOpen: noop, onEdit: noop, onToggle: noop, onDelete: noop };

	it("shows the mount path, driver, order and status", () => {
		const html = renderToStaticMarkup(<StorageTable items={[storage()]} {...tableProps} />);
		expect(html).toContain("/waynecos");
		expect(html).toContain("S3");
		expect(html).toContain(">3<");
		expect(html).toContain("Enabled");
		expect(html).toContain("cos");
	});

	it("offers Disable for a live mount and Enable for a disabled one", () => {
		const live = renderToStaticMarkup(<StorageTable items={[storage()]} {...tableProps} />);
		expect(live).toContain("Disable");
		expect(live).not.toContain(">Enable<");

		const off = renderToStaticMarkup(
			<StorageTable items={[storage({ disabled: true, status: "disabled" })]} {...tableProps} />,
		);
		expect(off).toContain("Disabled");
		expect(off).toContain(">Enable<");
	});

	it("renders a row per storage", () => {
		const html = renderToStaticMarkup(
			<StorageTable
				items={[storage(), storage({ id: 2, mount_path: "/jianguoyun", driver: "webdav" })]}
				{...tableProps}
			/>,
		);
		expect(html).toContain("/waynecos");
		expect(html).toContain("/jianguoyun");
		expect(html).toContain("WebDav");
	});

	it("disables the row actions while that storage is busy", () => {
		const html = renderToStaticMarkup(<StorageTable items={[storage()]} {...tableProps} busyId={1} />);
		expect(html.match(/disabled=""/g)).toHaveLength(3);
	});
});

describe("storage form fields", () => {
	// The fields are rendered without the dialog: a HeroUI modal goes through a
	// portal, which has nowhere to land in a server render, and the fields are
	// the part worth pinning anyway.
	const formProps = { drivers: DRIVERS, onChange: noop, onOpenJson: noop };

	it("builds every field from the registry, labelled", () => {
		const html = renderToStaticMarkup(<StorageFields draft={storage()} {...formProps} />);
		// Common items and driver items both come from the definition.
		expect(html).toContain("Mount Path");
		expect(html).toContain("Order");
		expect(html).toContain("Endpoint");
		expect(html).toContain("List Object Version");
		expect(html).toContain("Unique mount path");
	});

	it("offers each driver and only the chosen one's fields", () => {
		const html = renderToStaticMarkup(<StorageFields draft={storage()} {...formProps} />);
		expect(html).toContain('value="object"');
		expect(html).toContain('value="webdav"');
		// WebDAV's field must not leak into an S3 form.
		expect(html).not.toContain("Url");
	});

	it("renders the driver fields of the selected driver", () => {
		const html = renderToStaticMarkup(
			<StorageFields draft={storage({ driver: "webdav", addition: "{}" })} {...formProps} />,
		);
		expect(html).toContain("WebDav settings");
		expect(html).toContain("Url");
		expect(html).not.toContain("Endpoint");
	});

	it("marks the required items", () => {
		const html = renderToStaticMarkup(<StorageFields draft={storage()} {...formProps} />);
		// mount_path and endpoint are required; order and the select are not.
		expect(html.match(/required=""/g)).toHaveLength(2);
	});

	it("renders a select for a select item, using its declared choices", () => {
		const html = renderToStaticMarkup(<StorageFields draft={storage()} {...formProps} />);
		expect(html).toContain('aria-label="List Object Version"');
		expect(html).toContain('<option value="v1">v1</option>');
		expect(html).toContain('<option value="v2" selected');
	});

	it("renders a checkbox for a bool item, checked from the stored value", () => {
		const on = renderToStaticMarkup(
			<StorageFields draft={storage({ addition: JSON.stringify({ force_path_style: true }) })} {...formProps} />,
		);
		expect(on).toContain('aria-label="Force Path Style"');
		expect(on).toContain("Enabled");

		const off = renderToStaticMarkup(
			<StorageFields draft={storage({ addition: JSON.stringify({ force_path_style: false }) })} {...formProps} />,
		);
		expect(off).toContain("Disabled");
	});

	it("masks a secret and shows the stored value of the rest", () => {
		const withSecret: DriverInfo = {
			...S3,
			additional: [...S3.additional, { name: "secret_access_key", type: "string", default: "", secret: true }],
		};
		const html = renderToStaticMarkup(
			<StorageFields
				draft={storage({ addition: JSON.stringify({ secret_access_key: "hunter2", endpoint: "https://e" }) })}
				{...formProps}
				drivers={[withSecret, WEBDAV]}
			/>,
		);
		expect(html).toContain('type="password"');
		expect(html).toContain('value="hunter2"');
	});

	it("waits for the registry before drawing the fields", () => {
		const html = renderToStaticMarkup(<StorageFields draft={storage()} {...formProps} drivers={[]} />);
		expect(html).toContain("Loading drivers");
	});
});
