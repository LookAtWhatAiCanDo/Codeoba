import js from "@eslint/js";
import babelParser from "@babel/eslint-parser";
import prettierConfig from "eslint-config-prettier";
import globals from "globals";

export default [
  {
    ignores: [
      "dist/**",
      "src-tauri/**",
      "node_modules/**",
      "public/**",
      "build/**",
      "*.cjs",
      "*.js"
    ]
  },
  js.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          babelrc: false,
          configFile: false,
          parserOpts: {
            plugins: ["typescript", "jsx"]
          }
        }
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021
      }
    },
    rules: {
      "no-undef": "off",
      "no-unused-vars": "off",
      "no-unassigned-vars": "off",
      "no-useless-assignment": "off",
      "no-useless-escape": "warn"
    }
  },
  prettierConfig
];
