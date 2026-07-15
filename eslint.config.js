import js from "@eslint/js";
import babelParser from "@babel/eslint-parser";
import solidPlugin from "eslint-plugin-solid";
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
          presets: [
            ["@babel/preset-typescript", { "onlyRemoveTypeImports": true }]
          ]
        }
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021
      }
    },
    plugins: {
      "solid": solidPlugin
    },
    rules: {
      ...solidPlugin.configs.typescript.rules,
      "no-undef": "off",
      "no-unused-vars": "off",
      "no-useless-escape": "warn",
      "solid/reactivity": "warn",
      "solid/no-destructure": "warn",
      "solid/jsx-no-undef": "error",
      "solid/prefer-for": "warn",
      "solid/no-innerhtml": "warn"
    }
  },
  prettierConfig
];
