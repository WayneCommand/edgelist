import { Button as HeroButton, Toast } from "@heroui/react";
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate } from "react-router";
import { ROUTES, routeFor } from "./routes";
import type { MessageKey } from "./lib/i18n";
import { useAuth } from "./hooks/useAuth";
import { useT } from "./hooks/useLocale";
import { ConfirmProvider } from "./components/common/ConfirmDialog";
import { LocaleSelect } from "./components/common/LocaleSelect";
import { LogoMark } from "./components/common/LogoMark";
import { SegmentedControl } from "./components/common/SegmentedControl";
import { ThemeSelect } from "./components/common/ThemeSelect";
import { BackupPage } from "./pages/BackupPage";
import { FilesPage } from "./pages/FilesPage";
import { LoginPage } from "./pages/LoginPage";
import { MetadataPage } from "./pages/MetadataPage";
import { StoragesPage } from "./pages/StoragesPage";

/** The four destinations, in the order the navigation shows them. */
const NAV_ORDER = ["files", "storages", "metadata", "backup"] as const;

type NavKind = (typeof NAV_ORDER)[number];

/**
 * Keyed by kind rather than kept as an array of the same three fields, because
 * the segmented control reports back *which option* was chosen and the path for
 * it then has to be looked up. `Record<NavKind, …>` is what makes the compiler
 * hold the two in step; an array would let a destination exist in the order
 * list with no entry of its own.
 */
const NAV_ITEMS: Record<NavKind, { label: MessageKey; path: string }> = {
	files: { label: "nav.files", path: ROUTES.files() },
	storages: { label: "nav.storages", path: ROUTES.storages },
	metadata: { label: "nav.metadata", path: ROUTES.metadata },
	backup: { label: "nav.backup", path: ROUTES.backup },
};

function RequireAuth({ signedIn }: { signedIn: boolean }) {
	const location = useLocation();
	if (signedIn) return <Outlet />;
	return <Navigate to={ROUTES.login} replace state={{ from: location.pathname }} />;
}

/**
 * The app shell: a 52px toolbar over a content plane.
 *
 * Exported for `app-shell.test.tsx`, which renders it on its own — the shell is
 * the thing being pinned, and going through `App` would drag a page and the
 * auth redirect into every assertion.
 *
 * Three things in here are load-bearing and easy to "tidy up" into bugs:
 *
 * **The navigation is the shared `SegmentedControl`, not a fifth copy of the
 * recipe.** It had already drifted: the four destinations were `rounded-lg px-3
 * py-2 text-sm` buttons with a `border`, while the three extracted segmented
 * controls used a fill and `text-xs`. It takes the `md` size, which exists for
 * it.
 *
 * **The bar folds to two rows below `sm` by `order`, not by moving the DOM.**
 * `nav` used to be `hidden sm:flex`, so on a phone the four destinations simply
 * did not exist and there was no other route to them. Now the first row is the
 * brand and the right-hand controls and the second is the navigation, full
 * width and scrollable if a language needs it. The row is chosen with
 * `order-last` because the tab order has to stay brand → navigation → controls
 * → content at *both* widths, and that is the DOM order.
 *
 * **The header has no bottom border.** The bar is 80% of the window colour with
 * a blur behind it, over a content plane that is a step lighter; that is what
 * separates them. The 1px rule was doing the same job a second time and reading
 * as "web page" rather than "toolbar".
 */
export function Shell() {
	const { signOut } = useAuth();
	const t = useT();
	const route = routeFor(useLocation().pathname);
	const navigate = useNavigate();
	// `routeFor` has to answer for every path, and `files` is the destination it
	// falls back to, so it is the honest stand-in for the one route the shell
	// never renders for.
	const active: NavKind = route.kind === "login" ? "files" : route.kind;
	const options = NAV_ORDER.map((kind) => ({ value: kind, label: t(NAV_ITEMS[kind].label) }));
	return (
		<main className="min-h-screen bg-background text-foreground">
			<Toast.Provider placement="bottom end" />
			<header className="material-bar sticky top-0 z-header flex flex-wrap items-center gap-x-4 gap-y-2 bg-background/80 px-4 py-2 sm:h-13 sm:flex-nowrap sm:gap-0 sm:px-6 sm:py-0">
				<div className="flex flex-1 items-center gap-3 sm:flex-none">
					<button className="flex items-center gap-3" onClick={() => navigate(ROUTES.files())}>
						<LogoMark />
						<span className="font-semibold">EdgeList</span>
					</button>
				</div>
				<nav className="order-last w-full min-w-0 overflow-x-auto sm:order-none sm:w-auto sm:flex-1 sm:overflow-x-visible">
					<div className="flex w-max sm:w-full sm:justify-center">
						<SegmentedControl
							size="md"
							ariaLabel={t("nav.label")}
							value={active}
							options={options}
							onChange={(kind) => navigate(NAV_ITEMS[kind].path)}
						/>
					</div>
				</nav>
				<div className="flex items-center gap-2">
					<LocaleSelect />
					<ThemeSelect />
					<HeroButton size="sm" variant="ghost" onPress={signOut}>
						{t("nav.signOut")}
					</HeroButton>
				</div>
			</header>
			{/*
			 * Keyed by destination, not by pathname: the animation belongs to
			 * *changing pages*, and keying on the full path would remount
			 * `FilesPage` every time a folder was opened, refetching the listing
			 * and dropping its loading state.
			 *
			 * `--arrive-from` is local to this one element on purpose. The 6px
			 * default is the throw for a message arriving in a page; a whole
			 * content plane moving 6px reads as the window sliding, so this is
			 * the 2px Apple uses for a page transition.
			 */}
			<div key={active} className="arrive mx-auto max-w-6xl p-6 [--arrive-from:2px]">
				<Outlet />
			</div>
		</main>
	);
}

export default function App() {
	const { signedIn, signIn } = useAuth();
	return (
		<ConfirmProvider>
			<Routes>
				<Route element={<RequireAuth signedIn={signedIn} />}>
					<Route element={<Shell />}>
						<Route path={ROUTES.storages} element={<StoragesPage />} />
						<Route path={ROUTES.metadata} element={<MetadataPage />} />
						<Route path={ROUTES.backup} element={<BackupPage />} />
						<Route path="*" element={<FilesPage />} />
					</Route>
				</Route>
				<Route
					path={ROUTES.login}
					element={signedIn ? <Navigate to={ROUTES.files()} replace /> : <LoginPage onSignedIn={signIn} />}
				/>
			</Routes>
		</ConfirmProvider>
	);
}
