import {defineConfig,mergeConfig} from 'vitest/config';
import viteConfig from './vite.config.ts';
// Tests exercise the durable path; production builds default to false.
export default defineConfig(env=>mergeConfig(viteConfig(env),{test:{env:{VITE_DURABLE_OFFLINE_WRITES:'true'}}}));
