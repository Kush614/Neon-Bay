import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { installSound } from "./audio/sound.js";
import { CAPTURE } from "./capture/mode.js";

if (!CAPTURE) installSound();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
