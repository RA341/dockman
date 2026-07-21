import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // React Hooks 7 adds compiler-oriented rules to its recommended preset.
      // Keep the historical checks here; enable the new rules in dedicated
      // refactoring batches so a tooling upgrade cannot change runtime code.
      'react-hooks/rules-of-hooks':
        reactHooks.configs.recommended.rules['react-hooks/rules-of-hooks'],
      'react-hooks/exhaustive-deps':
        reactHooks.configs.recommended.rules['react-hooks/exhaustive-deps'],
      'react-refresh/only-export-components': [
        'warn',
        {
          allowConstantExport: true,
          // These stable hooks, stores and helpers intentionally share modules
          // with their providers or views. Keep the rule active for every new
          // mixed export instead of disabling it for entire directories.
          allowExportNames: [
            'FilesContext',
            'HostContext',
            'TabsContext',
            'formatDockyaml',
            'getContextKey',
            'getDir',
            'getEntryDisplayName',
            'getExt',
            'getHost',
            'useAlias',
            'useAliasAddDialogState',
            'useFileCreate',
            'useFileDelete',
            'useFileDnD',
            'useFileRename',
            'useFileSearch',
            'useFiles',
            'useHostFromUrl',
            'useHostManager',
            'useTabs',
            'useTabsStore',
          ],
        },
      ],
    },
  },
  {
    // Protobuf output owns its blanket eslint-disable directive. Do not make
    // generated files noisy when the current rule set happens not to need it.
    files: ['src/gen/**/*.ts'],
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
  },
)
