import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      ".next-dev/**",
      // Local-only scratch and user-owned output; gitignored, absent in CI, never product code.
      ".claude/**",
      "temp/**",
      "output/**",
      "coverage/**",
      "node_modules/**",
      "docs/spec.md",
    ],
  },
  ...nextVitals,
  ...nextTypescript,
];

export default eslintConfig;
