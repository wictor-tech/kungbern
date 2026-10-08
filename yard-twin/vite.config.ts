/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  root: ".",
  base: "./",
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 60000,
  },
});
