import type { NextConfig } from "next";
import createMDX from "@next/mdx";

const withMDX = createMDX({
  extension: /\.mdx?$/,
  options: {
    remarkPlugins: [["remark-gfm", {}]],
  },
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 녹음 100MB와 multipart 메타데이터를 지원한다. 각 업로드 API가 자체 상한을 검사한다.
  experimental: { proxyClientMaxBodySize: '101mb' },
  // 프로젝트 지침은 직접 관리하며 개발 서버가 AGENTS.md를 덧쓰지 않게 한다.
  agentRules: false,
  pageExtensions: ["ts", "tsx", "mdx"],
  // 같은 저장소에서 dev 서버를 두 개 띄우려면 빌드 디렉터리를 나눠야 한다.
  // Next 가 .next/dev 를 잠그기 때문이다. 평소에는 기본값을 쓴다.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // 컨테이너 이미지를 가볍게 한다. 실행에 필요한 것만 .next/standalone 에 모인다.
  output: "standalone",
  serverExternalPackages: ['oci-common', 'oci-objectstorage'],
};

export default withMDX(nextConfig);
