import nextConfig from 'eslint-config-next'

const config = [
  ...nextConfig,
  {
    rules: {
      // shadcn / hydration patterns flagged by React Compiler ESLint rules
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/purity': 'off',
      // Valid: refs read in async request prep (e.g. DefaultChatTransport), not during render
      'react-hooks/refs': 'off',
    },
  },
]

export default config
