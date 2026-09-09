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
  pageExtensions: ["ts", "tsx", "mdx"],
  // 같은 저장소에서 dev 서버를 두 개 띄우려면 빌드 디렉터리를 나눠야 한다.
  // Next 가 .next/dev 를 잠그기 때문이다. 평소에는 기본값을 쓴다.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default withMDX(nextConfig);
