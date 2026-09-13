/**
 * The message catalogue.
 *
 * Two decisions shape everything here:
 *
 * **Keys are dotted names, not the English text.** `files.noFiles` rather than
 * `"No files found"`, so that rewording English does not invalidate every
 * translation, and so the key can be found by searching for where it is used.
 * The cost is that a missing key could render as `files.noFiles` on screen —
 * which is what the fallback below exists to prevent.
 *
 * **A missing translation falls back to English, never to the key.** `ZH` is a
 * `Partial` map on purpose: translating is incremental, and a half-translated
 * catalogue has to stay shippable. `translate` therefore reads the chosen
 * language and falls back to the English entry, so an untranslated string shows
 * English — correct, if not translated — instead of leaking `some.key` into the
 * interface. A parity test keeps the shipped dictionaries in step; the fallback
 * is the safety net, not the plan.
 *
 * There is no plural engine, no date/number formatting, and no lazy loading of
 * language chunks. English and Chinese differ in whether a noun inflects, so
 * the two forms are two keys and the caller picks (`tCount`). That is the whole
 * grammar this app needs; anything more belongs in a real i18n library, which
 * is a dependency this skeleton deliberately does not take on.
 */

/** The languages the app ships. OpenList's list is far longer; these are ours. */
export const LOCALES = ["en", "zh"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/** The English catalogue. Every other language is keyed against this one. */
export const EN = {
	// Chrome
	"nav.files": "Files",
	"nav.storages": "Storages",
	"nav.metadata": "Metadata",
	"nav.backup": "Backup & restore",
	"nav.signOut": "Sign out",
	"nav.language": "Language",
	"nav.switchLanguage": "Switch language",

	// Sign in
	"login.title": "Sign in to EdgeList",
	"login.subtitle": "OpenList-compatible file management",
	"login.accessKey": "Access Key",
	"login.secretKey": "Secret Key",
	"login.signIn": "Sign in",
	"login.signingIn": "Signing in…",
	"login.failed": "Login failed",
	"login.verified": "Credentials are verified securely by the Worker.",

	// Shared action labels, used by the toolbar, the action bar and the menu
	"action.open": "Open",
	"action.rename": "Rename",
	"action.copy": "Copy",
	"action.move": "Move",
	"action.download": "Download",
	"action.copyLink": "Copy link",
	"action.delete": "Delete",
	"action.clear": "Clear",
	"action.save": "Save",
	"action.saving": "Saving…",
	"action.cancel": "Cancel",
	"action.create": "Create",
	"action.refresh": "Refresh",
	"action.close": "Close",
	"action.working": "Working…",
	"action.loading": "Loading…",

	// The file page
	"files.heading": "Files",
	"files.allFiles": "All files",
	"files.searchPlaceholder": "Search files…",
	"files.search": "Search",
	"files.searchTitle": "Search: {{query}}",
	"files.searchResultsIn": "Search results in",
	"files.noFiles": "No files found",
	"files.loadFailed": "Unable to load files",
	"files.searchFailed": "Unable to search files",
	"files.root": "Root",
	"files.editPath": "Edit path",
	"files.path": "Path",
	"files.newFolder": "New folder",
	"files.folderName": "Folder name",
	"files.folderCreated": "Folder created",
	"files.createFolderFailed": "Unable to create folder",
	"files.renamed": "Renamed",
	"files.renameFailed": "Unable to rename",
	"files.deleteFailed": "Unable to delete",
	"files.deleteOne": "Delete {{name}}?",
	"files.deleteMany": "Delete {{count}} items?",
	"files.discardTitle": "Discard changes",
	"files.discardMessage": "Discard unsaved changes?",
	"files.discard": "Discard",
	"files.previewTitle": "Preview",
	"files.uploadFailed": "Unable to upload {{name}}",
	"files.uploaded": "Uploaded",
	"files.uploadedMany": "Uploaded {{count}} files",
	"files.saved": "Saved",
	"files.saveFailed": "Unable to save file",
	"files.previewFailed": "Unable to preview file",
	"files.linkCopied": "Link copied",
	"files.copyLinkFailed": "Unable to copy link",
	"files.downloadFailed": "Unable to download {{name}}",

	// Toolbar, list and grid
	"toolbar.selectAll": "Select all",
	"toolbar.selectedCount": "{{count}} selected",
	"toolbar.upload": "Upload",
	"toolbar.uploadFolder": "Upload folder",
	"toolbar.uploading": "Uploading {{done}}/{{total}}",
	"toolbar.viewMode": "View mode",
	"toolbar.listView": "List",
	"toolbar.gridView": "Grid",
	"toolbar.dropHint": "Drop files or folders to upload",
	"table.name": "Name",
	"table.size": "Size",
	"table.modified": "Modified",
	"table.folder": "Folder",
	"table.mount": "Mount point",
	"table.select": "Select {{name}}",

	// Paging
	"pager.showingOf": "Showing {{to}} of {{total}}",
	"pager.rangeOf": "{{from}}–{{to}} of {{total}}",
	"pager.itemsOne": "{{count}} item",
	"pager.itemsOther": "{{count}} items",
	"pager.perPage": "Per page",
	"pager.all": "All",
	"pager.pages": "Pages",
	"pager.loadMore": "Load more",
	"pager.showMore": "Show more",
	"pager.pagingMode": "Paging mode",
	"pager.previous": "Previous page",
	"pager.next": "Next page",

	// Why an action is unavailable. These are tooltips, so they read as
	// explanations rather than as errors.
	"permission.nothingSelected": "Nothing is selected",
	"permission.openOne": "Open works on one entry at a time",
	"permission.renameOne": "Rename works on one entry at a time",
	"permission.noRename": "This item cannot be renamed",
	"permission.copyOneFolder": "Copy needs entries from a single folder",
	"permission.moveOneFolder": "Move needs entries from a single folder",
	"permission.virtualTransfer": "Mounted storages cannot be transferred",
	"permission.noCopy": "This item cannot be copied",
	"permission.noMove": "This item cannot be moved",
	"permission.moveNoRemove": "Moving removes the original, which this item forbids",
	"permission.noRemove": "This item cannot be deleted",
	"permission.noArchive": "Archives are not supported yet",
	"permission.noFolderLink": "Folders have no link",
	"permission.linkOne": "Copy link works on one entry at a time",

	// Copy and move
	"transfer.title": "{{verb}} {{target}}",
	"transfer.itemsOne": "{{count}} item",
	"transfer.itemsOther": "{{count}} items",
	"transfer.destination": "Destination",
	"transfer.into": "Into: {{path}}",
	"transfer.conflictLegend": "If a name already exists",
	"transfer.overwrite": "Overwrite existing",
	"transfer.skipExisting": "Skip existing",
	"transfer.merge": "Merge folders",
	"transfer.mergeCopyOnly": "(copy only)",
	"transfer.conflictNote": "Leaving all three unchecked refuses to touch a name that already exists.",
	"transfer.failed": "Transfer failed",
	"transfer.entryFailed": "failed",
	"transfer.crossStorage": "Cross-storage copy/move is not supported: {{from}} → {{to}}",
	"transfer.sameFolder": "Pick a folder other than the one being transferred from",
	"transfer.insideItself": "A folder cannot be transferred inside itself",
	"transfer.noMount": "No storage is mounted at {{path}}",
	"transfer.mountLayer": "{{path}} only exists to reach a nested mount",
	"transfer.copied": "Copied {{detail}}",
	"transfer.moved": "Moved {{detail}}",
	"transfer.skipped": "{{count}} skipped",
	"transfer.failedCount": "{{count}} failed",
	"transfer.nothingToDo": "Nothing to do",

	// Previewers
	"preview.caption.text": "Text",
	"preview.caption.markdown": "Markdown",
	"preview.caption.image": "Image",
	"preview.caption.video": "Video",
	"preview.caption.audio": "Audio",
	"preview.caption.pdf": "PDF",
	"preview.caption.office": "Office document",
	"preview.caption.file": "File",
	"preview.officeTitle": "No in-browser preview for {{extension}}",
	"preview.officeTitleGeneric": "No in-browser preview for this format",
	"preview.officeBody":
		"Word, Excel and PowerPoint files need a converter this app does not ship, and the browser has none of its own. Open the file in a desktop application to read it.",
	"preview.tooLargeTitle": "Too large to preview here",
	"preview.tooLargeBody":
		"A preview holds the whole file in memory before it shows anything, and this one is past that. Open it in an application that can stream it.",
	"preview.empty": "This file is empty.",
	"preview.codecs": "Playback depends on the codecs this browser supports.",
	"preview.pdfNote": "If nothing appears, this browser cannot display PDFs inline — download the file instead.",
	"preview.markdownView": "Markdown view",
	"preview.rendered": "Rendered",
	"preview.source": "Source",

	// The folder picker inside the transfer dialog
	"tree.expand": "Expand {{name}}",
	"tree.collapse": "Collapse {{name}}",
	"tree.noSubfolders": "No subfolders",
	"tree.listFailed": "Unable to list folders",

	// Batch results. The noun phrase and the verb are both inside the sentence,
	// because word order and inflection differ per language — a caller passing
	// "item" and "deleted" separately would be passing English grammar. The
	// caller composes `{{detail}}` from `batch.items*` and passes it in, the same
	// way `transfer.copied` takes its own.
	"batch.itemsOne": "{{count}} item",
	"batch.itemsOther": "{{count}} items",
	"batch.done": "{{detail}} deleted",
	"batch.partial": "{{detail}} deleted, {{failed}} failed: {{error}}",

	// Uploads
	"upload.ceilingHint": "This storage cannot accept a split upload — {{limit}} per file",
	"upload.ceilingReason":
		"{{name}} is {{size}}; this storage cannot accept a split upload, and one request carries at most {{limit}}",
	"upload.positiveSize": "A split upload needs a positive file size",
} as const;

/** Every key the app can ask for. A typo becomes a compile error. */
export type MessageKey = keyof typeof EN;

/** Values substituted into `{{placeholders}}`. */
export type MessageParams = Record<string, string | number>;

/**
 * A translator bound to one language.
 *
 * Declared here rather than beside the React hook that produces one, because
 * `lib/` is the layer that takes a translator as a parameter — see
 * `previewCaption` — and `lib/` must not reach into `hooks/` for a type.
 */
export type Translate = (key: MessageKey, params?: MessageParams) => string;

/**
 * The Chinese catalogue.
 *
 * `Partial` rather than `Record` so that a language can be built up over time
 * without the type system refusing to compile a half-finished one; the parity
 * test is what keeps it honest at review time.
 */
export const ZH: Partial<Record<MessageKey, string>> = {
	"nav.files": "文件",
	"nav.storages": "存储",
	"nav.metadata": "元数据",
	"nav.backup": "备份与恢复",
	"nav.signOut": "退出登录",
	"nav.language": "语言",
	"nav.switchLanguage": "切换语言",

	"login.title": "登录 EdgeList",
	"login.subtitle": "兼容 OpenList 的文件管理",
	"login.accessKey": "访问密钥",
	"login.secretKey": "私密密钥",
	"login.signIn": "登录",
	"login.signingIn": "登录中…",
	"login.failed": "登录失败",
	"login.verified": "凭据由 Worker 安全校验。",

	"action.open": "打开",
	"action.rename": "重命名",
	"action.copy": "复制",
	"action.move": "移动",
	"action.download": "下载",
	"action.copyLink": "复制链接",
	"action.delete": "删除",
	"action.clear": "取消选择",
	"action.save": "保存",
	"action.saving": "保存中…",
	"action.cancel": "取消",
	"action.create": "创建",
	"action.refresh": "刷新",
	"action.close": "关闭",
	"action.working": "处理中…",
	"action.loading": "加载中…",

	"files.heading": "文件",
	"files.allFiles": "全部文件",
	"files.searchPlaceholder": "搜索文件…",
	"files.search": "搜索",
	"files.searchTitle": "搜索：{{query}}",
	"files.searchResultsIn": "搜索结果位于",
	"files.noFiles": "没有找到文件",
	"files.loadFailed": "无法加载文件",
	"files.searchFailed": "无法搜索文件",
	"files.root": "根目录",
	"files.editPath": "编辑路径",
	"files.path": "路径",
	"files.newFolder": "新建文件夹",
	"files.folderName": "文件夹名称",
	"files.folderCreated": "文件夹已创建",
	"files.createFolderFailed": "无法创建文件夹",
	"files.renamed": "已重命名",
	"files.renameFailed": "无法重命名",
	"files.deleteFailed": "无法删除",
	"files.deleteOne": "删除 {{name}}？",
	"files.deleteMany": "删除 {{count}} 个项目？",
	"files.discardTitle": "放弃修改",
	"files.discardMessage": "放弃未保存的修改？",
	"files.discard": "放弃",
	"files.previewTitle": "预览",
	"files.uploadFailed": "无法上传 {{name}}",
	"files.uploaded": "上传完成",
	"files.uploadedMany": "已上传 {{count}} 个文件",
	"files.saved": "已保存",
	"files.saveFailed": "无法保存文件",
	"files.previewFailed": "无法预览文件",
	"files.linkCopied": "链接已复制",
	"files.copyLinkFailed": "无法复制链接",
	"files.downloadFailed": "无法下载 {{name}}",

	"toolbar.selectAll": "全选",
	"toolbar.selectedCount": "已选 {{count}} 项",
	"toolbar.upload": "上传文件",
	"toolbar.uploadFolder": "上传文件夹",
	"toolbar.uploading": "上传中 {{done}}/{{total}}",
	"toolbar.viewMode": "视图模式",
	"toolbar.listView": "列表",
	"toolbar.gridView": "网格",
	"toolbar.dropHint": "拖入文件或文件夹以上传",
	"table.name": "名称",
	"table.size": "大小",
	"table.modified": "修改时间",
	"table.folder": "文件夹",
	"table.mount": "挂载点",
	"table.select": "选择 {{name}}",

	"pager.showingOf": "已显示 {{to}} / {{total}}",
	"pager.rangeOf": "{{from}}–{{to}} / {{total}}",
	"pager.itemsOne": "{{count}} 个项目",
	"pager.itemsOther": "{{count}} 个项目",
	"pager.perPage": "每页",
	"pager.all": "全部",
	"pager.pages": "分页",
	"pager.loadMore": "加载更多",
	"pager.showMore": "显示更多",
	"pager.pagingMode": "分页模式",
	"pager.previous": "上一页",
	"pager.next": "下一页",

	"permission.nothingSelected": "未选中任何项目",
	"permission.openOne": "一次只能打开一个项目",
	"permission.renameOne": "一次只能重命名一个项目",
	"permission.noRename": "该项目不可重命名",
	"permission.copyOneFolder": "复制要求所选项目来自同一个文件夹",
	"permission.moveOneFolder": "移动要求所选项目来自同一个文件夹",
	"permission.virtualTransfer": "挂载的存储不能被复制或移动",
	"permission.noCopy": "该项目不可复制",
	"permission.noMove": "该项目不可移动",
	"permission.moveNoRemove": "移动会删除原文件，而该项目禁止删除",
	"permission.noRemove": "该项目不可删除",
	"permission.noArchive": "暂不支持打包下载",
	"permission.noFolderLink": "文件夹没有链接",
	"permission.linkOne": "一次只能复制一个项目的链接",

	"transfer.title": "{{verb}}{{target}}",
	"transfer.itemsOne": "{{count}} 个项目",
	"transfer.itemsOther": "{{count}} 个项目",
	"transfer.destination": "目标位置",
	"transfer.into": "目标：{{path}}",
	"transfer.conflictLegend": "当名称已存在时",
	"transfer.overwrite": "覆盖已有文件",
	"transfer.skipExisting": "跳过已有文件",
	"transfer.merge": "合并文件夹",
	"transfer.mergeCopyOnly": "（仅复制）",
	"transfer.conflictNote": "三项都不勾选时，遇到同名文件会拒绝操作。",
	"transfer.failed": "传输失败",
	"transfer.entryFailed": "失败",
	"transfer.crossStorage": "不支持跨存储复制/移动：{{from}} → {{to}}",
	"transfer.sameFolder": "请选择与来源不同的文件夹",
	"transfer.insideItself": "文件夹不能被移动或复制到自身内部",
	"transfer.noMount": "{{path}} 没有挂载任何存储",
	"transfer.mountLayer": "{{path}} 只是为了访问嵌套挂载而存在",
	"transfer.copied": "已复制 {{detail}}",
	"transfer.moved": "已移动 {{detail}}",
	"transfer.skipped": "{{count}} 个已跳过",
	"transfer.failedCount": "{{count}} 个失败",
	"transfer.nothingToDo": "没有可执行的操作",

	"preview.caption.text": "文本",
	"preview.caption.markdown": "Markdown",
	"preview.caption.image": "图片",
	"preview.caption.video": "视频",
	"preview.caption.audio": "音频",
	"preview.caption.pdf": "PDF",
	"preview.caption.office": "Office 文档",
	"preview.caption.file": "文件",
	"preview.officeTitle": "无法在浏览器中预览 {{extension}}",
	"preview.officeTitleGeneric": "无法在浏览器中预览此格式",
	"preview.officeBody":
		"Word、Excel 和 PowerPoint 文件需要一个本应用未内置的转换器，浏览器自身也没有。请用桌面应用打开该文件。",
	"preview.tooLargeTitle": "文件过大，无法在此预览",
	"preview.tooLargeBody":
		"预览需要先把整个文件读进内存才能显示，而这个文件已经超出该上限。请用支持流式读取的应用打开它。",
	"preview.empty": "该文件为空。",
	"preview.codecs": "能否播放取决于此浏览器支持的编码格式。",
	"preview.pdfNote": "如果没有显示内容，说明此浏览器无法内嵌显示 PDF —— 请改为下载该文件。",
	"preview.markdownView": "Markdown 视图",
	"preview.rendered": "渲染",
	"preview.source": "源码",

	"tree.expand": "展开 {{name}}",
	"tree.collapse": "收起 {{name}}",
	"tree.noSubfolders": "没有子文件夹",
	"tree.listFailed": "无法列出文件夹",

	"batch.itemsOne": "{{count}} 个项目",
	"batch.itemsOther": "{{count}} 个项目",
	"batch.done": "已删除 {{detail}}",
	"batch.partial": "已删除 {{detail}}，{{failed}} 个失败：{{error}}",

	"upload.ceilingHint": "此存储不支持分片上传 —— 单文件上限 {{limit}}",
	"upload.ceilingReason": "{{name}} 为 {{size}}；此存储不支持分片上传，而单个请求最多只能承载 {{limit}}",
	"upload.positiveSize": "分片上传需要文件大小为正数",
};

export function isLocale(value: unknown): value is Locale {
	return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * A language tag as one of ours.
 *
 * Browsers report full tags — `zh-CN`, `zh-Hant-TW`, `en-GB` — and the region
 * and script are not distinctions this app makes, so only the primary subtag is
 * read. Anything unrecognised is English, which is also the fallback for a
 * browser that reports nothing at all.
 */
export function localeFrom(tag: string | undefined | null): Locale {
	const primary = (tag ?? "").toLowerCase().split("-")[0];
	return isLocale(primary) ? primary : DEFAULT_LOCALE;
}

/**
 * `{{name}}` substitution.
 *
 * A placeholder with no matching parameter is left standing rather than blanked:
 * a visible `{{count}}` in the interface is a bug report, while a silently
 * empty string is a mystery.
 */
export function interpolate(template: string, params: MessageParams): string {
	return template.replace(/\{\{(\w+)\}\}/g, (placeholder, name: string) =>
		name in params ? String(params[name]) : placeholder,
	);
}

/**
 * The message for `key` in `locale`, falling back to English.
 *
 * The fallback is why a missing translation can never reach the screen as a raw
 * key — see the note at the top of this file.
 */
export function translate(locale: Locale, key: MessageKey, params?: MessageParams): string {
	const table: Partial<Record<MessageKey, string>> = locale === "zh" ? ZH : EN;
	const template = table[key] ?? EN[key];
	return params ? interpolate(template, params) : template;
}
