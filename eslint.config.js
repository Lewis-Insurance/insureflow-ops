// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from "eslint-plugin-storybook";

import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import noDeprecatedDomainTerms from "./eslint-rules/no-deprecated-domain-terms.js";

export default tseslint.config({ ignores: ["dist", "scripts"] }, {
  extends: [js.configs.recommended, ...tseslint.configs.recommended],
  files: ["**/*.{ts,tsx}"],
  languageOptions: {
    ecmaVersion: 2020,
    globals: globals.browser,
  },
  plugins: {
    "react-hooks": reactHooks,
    "react-refresh": reactRefresh,
    "local": {
      rules: {
        'no-deprecated-domain-terms': noDeprecatedDomainTerms
      }
    }
  },
  rules: {
    ...reactHooks.configs.recommended.rules,
    "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    "@typescript-eslint/no-unused-vars": "off",
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-require-imports": "warn",
    "@typescript-eslint/ban-ts-comment": "warn",
    "@typescript-eslint/no-empty-object-type": "warn",
    "no-console": ["warn", { "allow": ["warn", "error", "info", "debug"] }],
    "no-case-declarations": "warn",
    "no-useless-escape": "warn",
    "no-empty": "warn",
    "no-misleading-character-class": "warn",
    "prefer-const": "warn",
    "no-control-regex": "warn",
    "no-async-promise-executor": "warn",
    "no-useless-catch": "warn",
    "local/no-deprecated-domain-terms": "warn",
  },
}, storybook.configs["flat/recommended"]);
