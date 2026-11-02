import { defineConfig } from '@playwright/test'

export default defineConfig({
    testDir: './e2e',
    outputDir: './test-results',
    fullyParallel: true,
    workers: 2,
    reporter: 'list',
    use: {
        baseURL: 'http://127.0.0.1:5174',
        browserName: 'chromium',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    projects: [
        { name: 'desktop-dark', use: { viewport: { width: 1440, height: 1000 } } },
        { name: 'desktop-light', use: { viewport: { width: 1440, height: 1000 } } },
        { name: 'tablet-dark', use: { viewport: { width: 768, height: 1024 } } },
        { name: 'mobile-dark', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
        { name: 'mobile-light', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    ],
    webServer: {
        command: 'npm run dev -- --host 127.0.0.1 --port 5174 --strictPort',
        url: 'http://127.0.0.1:5174',
        reuseExistingServer: false,
    },
})