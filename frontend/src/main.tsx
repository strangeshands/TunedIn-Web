import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import TestMusic from "./TestMusic";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        {window.location.pathname === "/test-music" ? <TestMusic /> : <App />}
    </StrictMode>,
);
