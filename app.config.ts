import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * app.json을 확장 — GitHub Pages처럼 하위 경로(/tvpc-app)에 배포할 때만
 * EXPO_BASE_URL 환경변수로 baseUrl을 주입한다. 로컬 개발에는 영향 없음.
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: config.name ?? '트라이밸리 장로교회',
  slug: config.slug ?? 'tvpc-app',
  experiments: {
    ...config.experiments,
    ...(process.env.EXPO_BASE_URL ? { baseUrl: process.env.EXPO_BASE_URL } : {}),
  },
});
