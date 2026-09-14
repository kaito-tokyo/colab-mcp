import js from "@eslint/js";

export default [
  { ignores: ["node_modules/**"] },
  {
    languageOptions: {
      globals: {
        Buffer: "readonly",
        console: "readonly",
        process: "readonly",
        URL: "readonly",
        TextEncoder: "readonly",
        EventTarget: "readonly",
        MessageEvent: "readonly",
        CustomEvent: "readonly",
        ErrorEvent: "readonly",
        Event: "readonly",
        WebSocket: "readonly",
        fetch: "readonly",
      },
    },
  },
  js.configs.recommended,
];
