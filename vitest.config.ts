import { defineConfig } from 'vitest/config';

// Backend có vitest + script test riêng (D:\tour-booking\backend) nên root
// chỉ chạy test của frontend, tránh chạy trùng.
export default defineConfig({
  test: {
    exclude: ['node_modules', 'dist', 'backend/**'],
  },
});
