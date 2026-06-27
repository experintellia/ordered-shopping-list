import "./styles.css";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";

// NOTE: no <StrictMode> — react-draggable is a legacy class component whose
// double-mount under StrictMode leaves its drag handlers unattached.
const root = document.getElementById("app");
if (root) {
  createRoot(root).render(<App />);
}
