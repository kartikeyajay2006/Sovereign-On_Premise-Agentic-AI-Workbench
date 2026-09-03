import type { Config } from "tailwindcss";

/**
 * Design tokens for the workbench console.
 *
 * The visual language is industrial control-room instrumentation: petrol
 * enamel panels joined by seams, brass as the single interactive accent, and
 * signal colours reserved strictly for status (never decoration). Documents
 * and evidence sit on drafting vellum — paper on a steel desk.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ground: "#081116",
        panel: "#0E1A20",
        raised: "#14262E",
        bezel: "#193039",
        seam: "#1D3540",
        ink: "#D6E3E7",
        "ink-dim": "#7A959E",
        "ink-faint": "#6A848E",
        brass: "#C9A227",
        "brass-dim": "#8E731C",
        live: "#2FBF9E",
        hold: "#E0A32E",
        alarm: "#DE5B4F",
        inert: "#55707B",
        vellum: "#E3E8E5",
        "vellum-rule": "#C2CCC8",
        "vellum-ink": "#1B2A2F",
      },
      fontFamily: {
        sans: ["var(--font-archivo)", "system-ui", "sans-serif"],
        mono: ["var(--font-plex-mono)", "ui-monospace", "monospace"],
      },
      fontSize: {
        micro: ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.04em" }],
        readout: ["0.8125rem", { lineHeight: "1.15rem", letterSpacing: "0.01em" }],
      },
      borderRadius: {
        panel: "3px",
        chip: "2px",
      },
      boxShadow: {
        bezel: "inset 0 1px 0 rgba(214,227,231,0.06), inset 0 -1px 0 rgba(0,0,0,0.4)",
        recess: "inset 0 2px 6px rgba(0,0,0,0.55)",
        lamp: "0 0 0 1px rgba(201,162,39,0.35), 0 0 18px -4px rgba(201,162,39,0.55)",
      },
      keyframes: {
        // Fluid travelling along a process line while the agent works.
        flow: {
          "0%": { backgroundPosition: "0 0" },
          "100%": { backgroundPosition: "28px 0" },
        },
        // A monitor that is alive but idle.
        breathe: {
          "0%, 100%": { opacity: "0.45" },
          "50%": { opacity: "1" },
        },
        // Annunciator segments illuminating on power-up.
        ignite: {
          "0%": { opacity: "0", transform: "translateY(2px)" },
          "60%": { opacity: "1" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        sweep: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(240%)" },
        },
      },
      animation: {
        flow: "flow 1.1s linear infinite",
        breathe: "breathe 3.2s ease-in-out infinite",
        ignite: "ignite 420ms cubic-bezier(0.2, 0.7, 0.3, 1) both",
        sweep: "sweep 2.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
