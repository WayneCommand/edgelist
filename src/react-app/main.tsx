import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import "./index.css";
import App from "./App.tsx";
import { initTheme } from "./lib/theme";

// Before the first render, so the page is never briefly the wrong colour and so
// the system preference is watched from the start. `index.html` repeats the
// stored-value lookup inline for the moment before this module is evaluated.
initTheme();

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<BrowserRouter>
			<App />
		</BrowserRouter>
	</StrictMode>,
);
