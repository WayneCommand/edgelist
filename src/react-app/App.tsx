import { Button as HeroButton, Toast } from "@heroui/react";
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate } from "react-router";
import { ROUTES, routeFor, type Route as AppRoute } from "./routes";
import type { MessageKey } from "./lib/i18n";
import { useAuth } from "./hooks/useAuth";
import { useT } from "./hooks/useLocale";
import { ConfirmProvider } from "./components/common/ConfirmDialog";
import { LocaleSelect } from "./components/common/LocaleSelect";
import { ThemeSelect } from "./components/common/ThemeSelect";
import { BackupPage } from "./pages/BackupPage";
import { FilesPage } from "./pages/FilesPage";
import { LoginPage } from "./pages/LoginPage";
import { MetadataPage } from "./pages/MetadataPage";
import { StoragesPage } from "./pages/StoragesPage";

const NAV_ITEMS: ReadonlyArray<{ kind: AppRoute["kind"]; label: MessageKey; path: string }> = [
	{ kind: "files", label: "nav.files", path: ROUTES.files() },
	{ kind: "storages", label: "nav.storages", path: ROUTES.storages },
	{ kind: "metadata", label: "nav.metadata", path: ROUTES.metadata },
	{ kind: "backup", label: "nav.backup", path: ROUTES.backup },
];

function RequireAuth({ signedIn }: { signedIn: boolean }) {
	const location = useLocation();
	if (signedIn) return <Outlet />;
	return <Navigate to={ROUTES.login} replace state={{ from: location.pathname }} />;
}

function Shell() {
	const { signOut } = useAuth();
	const t = useT();
	const route = routeFor(useLocation().pathname);
	const navigate = useNavigate();
	return (
		<main className="min-h-screen bg-background text-foreground">
			<Toast.Provider placement="bottom end" />
			<header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-separator/80 bg-surface/95 px-6 backdrop-blur">
				<div className="flex items-center gap-3">
					<button className="flex items-center gap-3" onClick={() => navigate(ROUTES.files())}>
						<div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent font-bold text-accent-foreground">
							E
						</div>
						<span className="font-semibold">EdgeList</span>
					</button>
				</div>
				<nav className="hidden gap-1 sm:flex">
					{NAV_ITEMS.map(({ kind, label, path }) => (
						<button
							key={kind}
							className={`rounded-lg px-3 py-2 text-sm ${route.kind === kind ? "bg-accent-soft font-medium text-accent-soft-foreground" : "text-muted hover:bg-surface-secondary"}`}
							onClick={() => navigate(path)}
						>
							{t(label)}
						</button>
					))}
				</nav>
				<div className="flex items-center gap-2">
					<LocaleSelect />
					<ThemeSelect />
					<HeroButton size="sm" variant="ghost" onPress={signOut}>
						{t("nav.signOut")}
					</HeroButton>
				</div>
			</header>
			<div className="mx-auto max-w-6xl p-6">
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
