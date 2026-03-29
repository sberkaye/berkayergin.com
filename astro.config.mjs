// @ts-check
import { defineConfig, fontProviders } from "astro/config";

// https://astro.build/config
export default defineConfig({
  fonts: [
    {
      provider: fontProviders.fontsource(),
      name: "Aleo",
      cssVariable: "--font-aleo",
      weights: [700],
      styles: ["normal"],
    },
    {
      provider: fontProviders.fontsource(),
      name: "Urbanist",
      cssVariable: "--font-urbanist",
      weights: [400, 500, 600, 700],
      styles: ["normal", "italic"],
    },
  ],
});
