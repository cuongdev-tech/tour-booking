import { defineConfig } from 'vitest/config';

// dist/ chứa bản biên dịch của cả *.test.ts (trước khi tsconfig loại test
// khỏi build) — chỉ chạy test từ src để không chạy trùng bản stale.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
