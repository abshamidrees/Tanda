import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    // Server tests declare the node environment in their own first line.
    include: ['src/**/*.test.{ts,tsx}', 'server/**/*.test.ts'],
  },
})
