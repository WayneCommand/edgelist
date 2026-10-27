import { Suspense, lazy, useEffect } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router";
import { ROUTES, routeFor } from "./routes";
import { useAuth } from "./hooks/useStore";
import { loadWorkspace, resetWorkspace } from "./lib/workspace";
import { ConfirmHost, Toaster } from "./ui/Feedback";
import { WindowBackdrop } from "./ui/PageShell";
import { LoginPage } from "./pages/LoginPage";
import { Loading } from "./ui/Field";
import { ViewportZoom } from "./components/ViewportZoom";

/**
 * The app, split so the sign-in screen does not carry the file manager.
 *
 * §1.1 says the first thing a visitor sees is a loading state, and the honest way to keep
 * that loading state short is to send less. The login page is imported eagerly — it is what
 * an unauthenticated visitor gets, and a lazy sign-in form would show a spinner where the
 * form should be — while the browser, the file page and the management shell are chunks of
 * their own.
 *
 * The split is by *route*, which is the only boundary React can honour without a second
 * router: one dynamic import per page, and a `<Suspense>` around each outlet that renders the
 * app's own spinner rather than nothing.
 */
const BrowserPage = lazy(() => import("./pages/BrowserPage").then((m) => ({ default: m.BrowserPage })));
const FilePage = lazy(() => import("./pages/FilePage").then((m) => ({ default: m.FilePage })));
const ManageShell = lazy(() => import("./pages/ManageShell").then((m) => ({ default: m.ManageShell })));
const ProfilePage = lazy(() => import("./pages/ProfilePage").then((m) => ({ default: m.ProfilePage })));
const StorageListPage = lazy(() => import("./pages/StorageListPage").then((m) => ({ default: m.StorageListPage })));
const StorageFormPage = lazy(() => import("./pages/StorageFormPage").then((m) => ({ default: m.StorageFormPage })));
const MetaListPage = lazy(() => import("./pages/MetaListPage").then((m) => ({ default: m.MetaListPage })));
const MetaFormPage = lazy(() => import("./pages/MetaFormPage").then((m) => ({ default: m.MetaFormPage })));
const BackupPage = lazy(() => import("./pages/BackupPage").then((m) => ({ default: m.BackupPage })));
const AboutPage = lazy(() => import("./pages/AboutPage").then((m) => ({ default: m.AboutPage })));
const ShareListPage = lazy(() => import("./pages/ShareListPage").then((m) => ({ default: m.ShareListPage })));
const SharePage = lazy(() => import("./pages/SharePage").then((m) => ({ default: m.SharePage })));

/** A chunk's loading state: full-height, centred, and the same spinner as the first paint. */
function RouteFallback() {
	return (
		<div className="flex min-h-[calc(var(--app-vh)*0.6)] items-center justify-center">
			<Loading size="lg" />
		</div>
	);
}

/** §1.2: the refused path travels as `?redirect=`. */
function RequireAuth() {
	const { signedIn } = useAuth();
	const location = useLocation();
	if (!signedIn) {
		return (
			<Navigate to={`${ROUTES.login}?redirect=${encodeURIComponent(location.pathname + location.search)}`} replace />
		);
	}
	return <Outlet />;
}

/**
 * Loads the workspace — `me`, the storages, the driver registry — once, alongside the tree.
 *
 * Every page needs part of it, and a per-page load would fetch three endpoints on every
 * navigation. It is also what the browser uses to decide whether a directory can be written
 * to at all, so it has to be there before the first listing is drawn.
 */
function WorkspaceGate() {
	const { signedIn } = useAuth();
	useEffect(() => {
		if (signedIn) void loadWorkspace();
		else resetWorkspace();
	}, [signedIn]);
	return <Outlet />;
}

/**
 * The browser's catch-all, which splits a directory from a file.
 *
 * In OpenList a file and a directory share one namespace, so a path is only known to be a
 * file once the server says so. Probing on every navigation would cost a request per click, so
 * the split is made by extension here and corroborated by `fs/get` inside `FilePage`. A
 * *directory* whose name contains a dot is the one case this gets wrong, and it costs a
 * failed read and a Back button rather than a wrong listing.
 */
function BrowserRoute() {
	const route = routeFor(useLocation().pathname);
	if (route.kind !== "files") return null;
	return /\/[^/]*\.[^/]+$/.test(route.path) ? <FilePage /> : <BrowserPage />;
}

/**
 * The sign-in screen paints its own wallpaper (§10.1's arcs and blooms), and the
 * window backdrop would sit over it, so it is suppressed there.
 */
function ShellBackdrop() {
	const { pathname } = useLocation();
	// The share page and the sign-in screen both paint their own surface.
	return <WindowBackdrop bare={pathname === ROUTES.login || pathname.startsWith("/s/")} />;
}

export default function App() {
	return (
		<>
			<ViewportZoom />
			<ShellBackdrop />
			<Toaster />
			<ConfirmHost />
			<RouteProgress />
			<Routes>
				<Route path={ROUTES.login} element={<SignIn />} />
				{/* Public on purpose: a share is the one page reached without a session.
				    It is declared outside `RequireAuth` so a visitor is never bounced
				    to the sign-in screen for following a link they were given. The
				    address is the file's own path, so the splat is deliberate. */}
				<Route path="/s/*" element={page(<SharePage />)} />
				<Route element={<RequireAuth />}>
					<Route element={<WorkspaceGate />}>
						<Route
							path="/@manage"
							element={
								<Suspense fallback={<RouteFallback />}>
									<ManageShell />
								</Suspense>
							}
						>
							<Route index element={page(<ProfilePage />)} />
							<Route path="storages" element={page(<StorageListPage />)} />
							<Route path="storages/add" element={page(<StorageFormPage />)} />
							<Route path="storages/edit/:id" element={page(<StorageFormPage />)} />
							<Route path="metas" element={page(<MetaListPage />)} />
							<Route path="metas/add" element={page(<MetaFormPage />)} />
							<Route path="metas/edit/:id" element={page(<MetaFormPage />)} />
							<Route path="backup-restore" element={page(<BackupPage />)} />
							<Route path="shares" element={page(<ShareListPage />)} />
							<Route path="about" element={page(<AboutPage />)} />
							{/* §1.2: an unmatched management path is still management; sending it to the
							    browser would list it as a folder called `@manage`. */}
							<Route path="*" element={<Navigate to={ROUTES.profile} replace />} />
						</Route>
						<Route path="*" element={page(<BrowserRoute />)} />
					</Route>
				</Route>
			</Routes>
		</>
	);
}

/** Wraps a lazy page in the suspense boundary that owns its chunk. */
function page(element: React.ReactNode) {
	return <Suspense fallback={<RouteFallback />}>{element}</Suspense>;
}

/** The sign-in page, which leaves as soon as the token exists. */
function SignIn() {
	const { signedIn, signIn } = useAuth();
	if (signedIn) return <Navigate to={ROUTES.files()} replace />;
	return (
		<LoginPage
			onSignedIn={(next) => {
				signIn(next);
				void loadWorkspace(true);
			}}
		/>
	);
}

/**
 * §1.1's route progress bar.
 *
 * A CSS animation with a fixed beat rather than a measured one: how long a chunk takes is not
 * knowable from here, and a bar that pretends to know is a bar that lies and then jumps. It
 * appears on a path change and disappears shortly after, which is honest about a duration it
 * cannot see.
 *
 * `bg-info-9` on a transparent track, `.5` tall, in the banner layer — §1.4's own slot.
 */
function RouteProgress() {
	const { pathname } = useLocation();
	// The bar is keyed by the path, so a new route is a new element and the animation
	// restarts — which is what a progress bar *is*. No state, no effect, and nowhere for a
	// synchronous write to happen.
	return (
		<div
			key={pathname}
			aria-hidden="true"
			className="pointer-events-none fixed inset-x-0 top-0 z-banner h-0.5 overflow-hidden [animation:progress-fade_700ms_ease-out_both]"
		>
			<div className="indeterminate-bar h-full w-1/3 rounded-full bg-info-9" />
		</div>
	);
}
