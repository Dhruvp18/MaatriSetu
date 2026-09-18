import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FlatCompat } from '@eslint/eslintrc'

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) })

/**
 * The layering rules from docs/architecture.md, enforced.
 *
 * Each block below is scoped to the layer it constrains. Scope matters: a
 * repository ban applied repo-wide would also forbid the one import that is
 * mandatory — a module's own service calling its own repository, which is the
 * entire point of the four-file module shape.
 */
export default [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    ignores: ['.next/**', 'node_modules/**', 'docs/prototype/**'],
  },

  // ARCH-1 — the routing and rendering layers are thin.
  //
  // `src/app/**` and `src/components/**` may call a module's service, and may
  // read its types and schemas. They may not reach past it into a repository or
  // open a database client of their own: that is where SQL, tenant scoping and
  // permission checks live, and a route that bypasses the service bypasses all
  // three.
  {
    files: ['src/app/**/*.{ts,tsx}', 'src/components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/*.repository', '**/*.repository.ts'],
              message:
                'Route handlers and components must call a module service, never a repository. See docs/architecture.md (ARCH-1).',
            },
            {
              group: ['@core/db/clients', '**/core/db/clients'],
              message:
                'Opening a database client here bypasses the service layer, and with it the permission check. Call a module service. See docs/architecture.md (ARCH-1).',
            },
          ],
        },
      ],
    },
  },

  // ARCH-2 — modules never import upward.
  //
  // A module that needs a value from the request receives it as an argument;
  // reaching into `app/` for it would make the module unusable from the worker
  // and untestable without a request.
  {
    files: ['src/modules/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/app/*', '@components/*', '**/src/app/*', '**/src/components/*'],
              message:
                'A module may not import from the routing or rendering layers. Pass the value in as an argument. See docs/architecture.md (ARCH-2).',
            },
          ],
        },
      ],
    },
  },

  // ARCH-3 — core knows no domain.
  //
  // The deliberate exception is `core/obstetrics/`, which holds pure clinical
  // arithmetic with no dependencies and no I/O. It is domain vocabulary, not a
  // domain module, and it is covered by the same ban: it may not import a
  // module either.
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@modules/*', '@/modules/*', '**/src/modules/*'],
              message:
                'core may not depend on a domain module. If the helper mentions a pregnancy or a referral, it belongs in that module. See docs/architecture.md (ARCH-3).',
            },
            {
              group: ['@/app/*', '@components/*', '**/src/app/*', '**/src/components/*'],
              message: 'core may not depend on the routing or rendering layers. See docs/architecture.md (ARCH-3).',
            },
          ],
        },
      ],
    },
  },

  // ARCH-8 — the worker shares core and modules, never app.
  {
    files: ['worker/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/app/*', '@components/*', '**/src/app/*', '**/src/components/*'],
              message:
                'The worker is not a Next.js process and must not import from the routing layer. See docs/architecture.md (ARCH-8).',
            },
          ],
        },
      ],
    },
  },
]
