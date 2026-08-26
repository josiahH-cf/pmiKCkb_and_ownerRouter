import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "temp/e2e/.next/**",
      "coverage/**",
      "node_modules/**",
      "docs/spec.md",
    ],
  },
  ...nextVitals,
  ...nextTypescript,
];

export default eslintConfig;
