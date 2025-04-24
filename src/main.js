import { createApp } from "vue";
import App from "./App.vue";
import Clarity from "@microsoft/clarity";

Clarity.init("r8t256p4ms");

createApp(App).mount("#app");
