import { render } from "preact";
import { App } from "../ui/popup/App.js";

const mount = document.getElementById("app");
if (!mount) throw new Error("Missing #app element");
render(<App />, mount);
