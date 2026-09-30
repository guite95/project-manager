"use client";

import type { ReactNode } from "react";
import { cx } from "../lib/class-names";

export type SplitLoginLayoutProps = {
  /** 좌측을 채우는 이미지·영상 등 시각 매체. */
  heroMedia: ReactNode;
  /** 좌측 매체 위에 표시할 헤드라인·지표·설명 슬롯. */
  heroContent?: ReactNode;
  /** 우측 패널 상단의 제품 로고·워드마크 슬롯. */
  brand?: ReactNode;
  /** 소비 앱이 소유하는 로그인 폼. 인증 상태와 API 호출은 포함하지 않는다. */
  children: ReactNode;
  /** 우측 패널 하단의 보안·약관 안내 슬롯. */
  footer?: ReactNode;
  heroLabel?: string;
  panelLabel?: string;
  className?: string;
};

/**
 * 브랜드 비주얼과 인증 폼을 2분할하는 프레임워크 독립 로그인 셸.
 * 인증·라우팅·API 로직은 소비 앱이 children으로 주입한다.
 */
export function SplitLoginLayout({
  heroMedia,
  heroContent,
  brand,
  children,
  footer,
  heroLabel = "서비스 안내",
  panelLabel = "로그인",
  className,
}: SplitLoginLayoutProps) {
  return (
    <div className={cx("pds", "pds-split-login", className)}>
      <section className="pds-split-login__hero" aria-label={heroLabel}>
        <div className="pds-split-login__media">{heroMedia}</div>
        {heroContent ? <div className="pds-split-login__hero-content">{heroContent}</div> : null}
      </section>
      <section className="pds-split-login__panel" aria-label={panelLabel}>
        {brand ? <div className="pds-split-login__brand">{brand}</div> : null}
        <div className="pds-split-login__content">{children}</div>
        {footer ? <footer className="pds-split-login__footer">{footer}</footer> : null}
      </section>
    </div>
  );
}
