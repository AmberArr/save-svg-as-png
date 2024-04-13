module.exports = {
  root: true,
  env: { browser: true, es2015: true },
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended"
  ],
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint"],
  ignorePatterns: ["lib", ".eslintrc.cjs"],
  rules: {
    "@typescript-eslint/no-unused-vars": 0,
    "@typescript-eslint/ban-ts-comment": 0,
  },
};
