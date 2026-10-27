import { useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router";
import { logout } from "../lib/api";
import { notify } from "../lib/feedback";
import { resetWorkspace } from "../lib/workspace";
import { useAuth, useT } from "../hooks/useStore";
import { ROUTES, routeFor } from "../routes";
import { Icon, type IconName } from "../ui/Icon";
import { PageFooter } from "../ui/PageShell";
import { LocaleMenu, LogoMark, ThemeMenu } from "../ui/Chrome";

/**
 * The management shell (§12.1).
 *
 * A 64px sticky bar, a 14rem sidebar and a scrolling content plane. The spec's own
 * diagram, and the reason it is a shell rather than a layout per page: seven
 * destinations share it, and the two things in the sidebar's footer — language and
 * theme — have to be reachable from every one of them.
 *
 * The menu is a table, not markup, because §12.2's rules are per-item conditions:
 * `role`, an external target, a full-page navigation. A table with those columns is one
 * list to read; seven `<li>`s with conditionals inside them is seven places to get one
 * wrong.
 *
 * The spec's sidebar has more entries than this deployment has pages — Users, Shares,
 * Tasks, Plugins, Indexes, Settings, and the whole nested tree under Settings. Each of
 * those needs a Worker surface that does not exist: shares have no storage, tasks have no
 * scheduler, indexing is a scan the Worker does per request. Rendering a link to a page
 * with nothing behind it would be worse than not rendering it, so the menu is the seven
 * destinations that work, and the About page says what is missing.
 */
type MenuItem = {
	label: string;
	path: string;
	icon: IconName;
	/** Matches the current route exactly rather than by prefix. */
	exact?: boolean;
	external?: boolean;
};

const MENU: MenuItem[] = [
	{ label: "manage.sidemenu.profile", path: ROUTES.profile, icon: "user", exact: true },
	{ label: "manage.sidemenu.storages", path: ROUTES.storages, icon: "database" },
	{ label: "manage.sidemenu.metas", path: ROUTES.metas, icon: "tag" },
	{ label: "manage.sidemenu.shares", path: ROUTES.shares, icon: "share" },
	{ label: "manage.sidemenu.backup", path: ROUTES.backup, icon: "archive" },
	{ label: "manage.sidemenu.about", path: ROUTES.about, icon: "info" },
	{ label: "manage.sidemenu.home", path: ROUTES.files(), icon: "home" },
];

export function ManageShell() {
	const t = useT();
	const navigate = useNavigate();
	const { signOut } = useAuth();
	const [menuOpen, setMenuOpen] = useState(false);
	// The path is what the menu compares against, so it has to be the *decoded*
	// one: `useLocation().pathname` keeps `%40manage` as the browser sent it, and
	// none of `ROUTES` would match. `routeFor` decodes for exactly this reason.
	const currentPath = decodeURIComponent(useLocation().pathname);
	// `routeFor` is what decides whether a management path is known at all; an
	// unmatched one falls back to the profile, which is the index route's own page.
	void routeFor(currentPath);
	const [pending, setPending] = useState(false);

	async function signOutNow() {
		setPending(true);
		try {
			await logout();
			resetWorkspace();
			notify.success(t("manage.logout_success"));
			navigate(ROUTES.login, { replace: true });
		} finally {
			setPending(false);
			signOut();
		}
	}

	return (
		<div className="flex min-h-[var(--app-vh)] flex-col">
			{/* §12.1: a glass toolbar over the window, not a coloured bar. The
			    sidebar below it is the same material, so the two read as one
			    chrome rather than as two panels that happen to touch. */}
			<header className="glass-chrome sticky top-0 z-sticky flex h-14 items-center justify-between gap-4 border-b border-hairline px-4">
				<div className="flex min-w-0 items-center gap-3">
					{/* Only below `sm`, where the sidebar is a drawer (§12.1). */}
					<button
						type="button"
						onClick={() => setMenuOpen(true)}
						aria-label={t("manage.menu")}
						className="tap flex size-8 items-center justify-center rounded-lg text-neutral-11 hover:bg-row-hover sm:hidden"
					>
						<Icon name="menu" className="size-5" />
					</button>
					<Link to={ROUTES.profile} className="tap flex min-w-0 items-center gap-2.5">
						<LogoMark />
						<span className="truncate text-[15px] font-semibold tracking-tight">{t("manage.title")}</span>
					</Link>
				</div>
				<div className="flex items-center gap-1">
					<LocaleMenu />
					<ThemeMenu />
					<button
						type="button"
						onClick={() => void signOutNow()}
						disabled={pending}
						aria-label={t("manage.logout")}
						title={t("manage.logout")}
						className="tap flex size-8 items-center justify-center rounded-lg text-neutral-11 hover:bg-row-hover disabled:opacity-50"
					>
						<Icon name="logout" className="size-4" />
					</button>
				</div>
			</header>

			<div className="flex min-h-0 flex-1" style={{ height: "calc(var(--app-vh) - 3.5rem)" }}>
				{/* The desktop sidebar. Hidden below `sm`, where the same list is a drawer.
				    A translucent panel inset from the edge, the way a macOS source list
				    sits inside the window rather than flush against it. */}
				<nav
					aria-label={t("manage.menu")}
					className="hidden w-60 shrink-0 overflow-y-auto border-r border-hairline px-2.5 py-3 sm:block"
				>
					<MenuList currentPath={currentPath} onNavigate={(path) => navigate(path)} />
					<div className="mt-4 flex items-center justify-center gap-4 border-t border-hairline py-2 text-neutral-11">
						<LocaleMenu />
						<ThemeMenu />
					</div>
				</nav>
				<main className="min-w-0 flex-1 overflow-y-auto">
					{/* §12: the management pages share the file browser's column, so a
					    table of storages does not stretch to the window edge while the
					    list of files sits in a 980px block. */}
					<div className="mx-auto flex min-h-full w-full max-w-[1040px] flex-col px-4 py-5 sm:px-6">
						<div className="flex-1">
							<Outlet />
						</div>
						{/* One footer for every management page, the way the browser page
						    has always had one: a page that stops mid-air reads unfinished. */}
						<PageFooter>
							<span className="text-[12px]">EdgeList · {t("manage.settings_stored_in_kv")}</span>
						</PageFooter>
					</div>
				</main>
			</div>

			{/* The mobile drawer: the same list, pushed from the left. */}
			{menuOpen && (
				<div className="fixed inset-0 z-modal flex sm:hidden">
					<button
						type="button"
						aria-label={t("global.close")}
						onClick={() => setMenuOpen(false)}
						className="absolute inset-0 bg-black/50"
					/>
					<div className="arrive relative flex w-64 flex-col bg-surface p-2 shadow-lg [--arrive-from:0] [--arrive-scale:1]">
						<div className="mb-2 flex items-center justify-between px-1">
							<span className="text-sm font-semibold text-info-11">{t("manage.title")}</span>
							<button
								type="button"
								onClick={() => setMenuOpen(false)}
								aria-label={t("global.close")}
								className="tap flex size-7 items-center justify-center rounded-md text-neutral-11 hover:bg-row-hover"
							>
								<Icon name="close" className="size-4" />
							</button>
						</div>
						<MenuList
							currentPath={currentPath}
							onNavigate={(path) => {
								setMenuOpen(false);
								navigate(path);
							}}
						/>
						<div className="mt-auto flex items-center justify-center gap-4 py-2">
							<LocaleMenu />
							<ThemeMenu />
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

/**
 * The menu itself.
 *
 * §12.2: the current item is `info-4` on `info-11`, everything else is a hover tint, and
 * there is no underline. An external entry is an `<a>` — a `Link` to another origin
 * would be intercepted by the router and fail — and `Home` is a full-page navigation
 * because leaving the management shell has to rebuild the app's state (§18.34).
 */
function MenuList({ currentPath, onNavigate }: { currentPath: string; onNavigate: (path: string) => void }) {
	const t = useT();
	return (
		<ul className="flex flex-col gap-0.5 text-[13px] text-neutral-11">
			{MENU.map((item) => {
				// `Home` lives at `/`, and every path starts with `/` — so a plain
				// `startsWith` marked Home as current on every management page. The
				// files root only matches itself.
				const path = item.path;
				const active =
					!item.external &&
					(item.exact || path === ROUTES.files()
						? currentPath === path
						: currentPath === path || currentPath.startsWith(`${path}/`));
				// A macOS source-list row: the selected item is a filled pill, not a
				// tinted background with coloured text. Rounder than the other
				// controls, because it is a navigation target rather than a button.
				const className = `flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-left transition-colors duration-100 ${
					active
						? "bg-info-10 font-medium text-white shadow-sm"
						: "hover:bg-row-hover hover:text-foreground active:bg-row-active"
				}`;

				if (item.external) {
					return (
						<li key={item.path}>
							<a href={item.path} target="_blank" rel="noreferrer" className={`tap ${className}`}>
								<Icon name={item.icon} className="size-4 shrink-0" />
								<span className="truncate">{t(item.label as never)}</span>
							</a>
						</li>
					);
				}

				// §18.34: Home leaves the SPA on purpose.
				if (item.path === ROUTES.files()) {
					return (
						<li key={item.path}>
							<a href={ROUTES.files()} className={`tap ${className}`}>
								<Icon name={item.icon} className="size-4 shrink-0" />
								<span className="truncate">{t(item.label as never)}</span>
							</a>
						</li>
					);
				}

				return (
					<li key={item.path}>
						<button
							type="button"
							onClick={() => onNavigate(item.path)}
							aria-current={active ? "page" : undefined}
							className={`tap ${className}`}
						>
							<Icon name={item.icon} className="size-4 shrink-0" />
							<span className="truncate">{t(item.label as never)}</span>
						</button>
					</li>
				);
			})}
		</ul>
	);
}

/**
 * The heading above a management page's content (§12).
 *
 * A large title, a subtitle, and the page's actions on the right — the shape every
 * macOS preferences pane uses. It used to be one `text-xl` line with the buttons
 * crammed beside it, which read as a toolbar rather than as a page title.
 */
export function ManageHeading({
	title,
	description,
	children,
}: {
	title: string;
	description?: string;
	children?: React.ReactNode;
}) {
	return (
		<div className="mb-5 flex flex-wrap items-end justify-between gap-3">
			<div className="min-w-0">
				<h1 className="text-[22px] leading-tight font-semibold tracking-tight">{title}</h1>
				{description && <p className="mt-1 text-[13px] text-neutral-10">{description}</p>}
			</div>
			{children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
		</div>
	);
}
