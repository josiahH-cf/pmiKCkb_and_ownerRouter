import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "coverage/**",
      "node_modules/**",
      "docs/spec.md",
      "docs/specs/**",
    ],
  },
  ...nextVitals,
  ...nextTypescript,
];

export default eslintConfig;
