"use client";

import { useState } from "react";
import {
  HiOutlineCash,
  HiOutlineCheckCircle,
  HiOutlineClipboardList,
  HiOutlineDocumentText,
  HiOutlinePhotograph,
  HiOutlineTruck,
} from "react-icons/hi";
import { Button } from "@/components/erp/button";
import { DetailSection } from "@/components/erp/detail-section";
import {
  DetailModal,
  DetailRail,
  DetailTabBar,
  PanelSection,
  RailEditGroup,
  RailEditRow,
  RailGroup,
  RailMetric,
  RailPairs,
  type DetailTab,
} from "@/components/erp/detail-modal";

type TabKey =
  | "prep"
  | "logistics"
  | "happyCall"
  | "completion"
  | "payment"
  | "history";

const TABS: Array<DetailTab<TabKey>> = [
  {
    key: "prep",
    label: "주문·배정",
    icon: <HiOutlineClipboardList />,
    complete: true,
  },
  { key: "logistics", label: "출고", icon: <HiOutlineTruck /> },
  { key: "happyCall", label: "해피콜", icon: <HiOutlineCheckCircle /> },
  { key: "completion", label: "시공완료", icon: <HiOutlinePhotograph /> },
  { key: "payment", label: "수금", icon: <HiOutlineCash /> },
  { key: "history", label: "이력", icon: <HiOutlineDocumentText /> },
];

const TEAM_OPTIONS = [
  { value: "미배정", label: "미배정" },
  { value: "중부1팀", label: "중부1팀 (수도권)" },
  { value: "중부2팀", label: "중부2팀 (수도권)" },
  { value: "남부1팀", label: "남부1팀 (영남)" },
  { value: "서부1팀", label: "서부1팀 (호남)" },
];

const fakeSave = () =>
  new Promise<void>((resolve) => window.setTimeout(resolve, 350));

export function ModalDemoSection() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("prep");
  const [receiver, setReceiver] = useState("김지훈");
  const [orderer, setOrderer] = useState("이서연");
  const [phone, setPhone] = useState("010-0000-0000");
  const [team, setTeam] = useState("미배정");

  return (
    <DetailSection title="10. 상세 모달">
      <div className="px-6 py-4">
        <Button onClick={() => setOpen(true)}>상세 모달 열기</Button>
        <DetailModal
          label={`${receiver} 주문 상세`}
          onClose={() => setOpen(false)}
          open={open}
        >
          <DetailRail header={{ title: receiver, subtitle: "주문 ORD-2026-001" }}>
            <RailGroup title="진행" />
            <RailEditGroup>
              <RailEditRow
                editor="select"
                label="시공팀"
                onCommit={async (next) => {
                  await fakeSave();
                  setTeam(next);
                }}
                options={TEAM_OPTIONS}
                value={team}
              />
            </RailEditGroup>
            <RailPairs items={[["현재 단계", "1. 접수"]]} />
            <RailGroup title="상태" />
            <RailPairs
              items={[
                ["해피콜", "대기"],
                ["재고", "미배정"],
                ["시공 예정", "-"],
              ]}
            />
            <RailGroup title="수금" />
            <RailPairs
              items={[
                ["주문총액", "₩584,025"],
                ["수금합계", "₩0"],
                ["잔금", "₩584,025"],
                ["결제", "-"],
              ]}
            />
            <RailGroup title="주문" />
            <RailPairs items={[["채널", "온라인몰"]]} />
            <RailEditGroup>
              <RailEditRow
                label="인수자"
                onCommit={async (next) => {
                  if (!next.trim()) throw new Error("인수자를 입력하세요.");
                  await fakeSave();
                  setReceiver(next.trim());
                }}
                value={receiver}
              />
              <RailEditRow
                label="주문자"
                onCommit={async (next) => {
                  await fakeSave();
                  setOrderer(next.trim());
                }}
                value={orderer}
              />
              <RailEditRow
                label="연락처"
                onCommit={async (next) => {
                  await fakeSave();
                  setPhone(next.trim());
                }}
                value={phone}
              />
            </RailEditGroup>
            <RailGroup title="배송지" />
            <RailMetric value="서울특별시 중구 세종대로 110 10층" />
          </DetailRail>

          <div className="flex min-h-0 min-w-0 flex-col">
            <DetailTabBar
              activeKey={activeTab}
              onClose={() => setOpen(false)}
              onSelect={setActiveTab}
              tabs={TABS}
            />
            <section className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-[var(--bi-card-bg)]">
              {activeTab === "prep" ? (
                <>
                  <div className="grid grid-cols-2">
                    <div>
                      <PanelSection flush title="고객 정보">
                        <div className="grid grid-cols-2 gap-2.5 p-3.5">
                          <Field label="인수자" value={receiver} />
                          <Field label="인수자 연락처" value={phone} />
                          <Field label="주문자" value={orderer} />
                          <Field label="주문자 연락처" value="010-1111-1111" />
                          <div className="col-span-2">
                            <Field
                              label="주소"
                              value="서울특별시 중구 세종대로 110"
                            />
                          </div>
                          <div className="col-span-2">
                            <Field label="상세주소" value="10층" />
                          </div>
                        </div>
                      </PanelSection>
                    </div>
                    <div className="border-l border-[var(--bi-border)]">
                      <PanelSection
                        action={
                          <span className="text-[11px] text-[var(--bi-muted)]">
                            현재: {team}
                          </span>
                        }
                        flush
                        title="시공팀 배정"
                      >
                        <div className="grid gap-3 p-3.5">
                          <div className="text-[11px] font-bold text-[var(--bi-muted)]">
                            이 지역 추천 시공팀 (권역 수도권)
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <TeamCard
                              name="중부1팀"
                              region="수도권 · 중앙 창고"
                              tone="추천"
                            />
                            <TeamCard
                              name="중부2팀"
                              region="수도권 · 동부 창고"
                              tone="추천"
                            />
                            <TeamCard
                              name="남부1팀"
                              region="영남 · 남부 창고"
                              tone="인근"
                            />
                            <TeamCard
                              name="서부1팀"
                              region="호남 · 서부 창고"
                              tone="인근"
                            />
                          </div>
                        </div>
                      </PanelSection>
                    </div>
                  </div>
                  <PanelSection flush title="품목 배정">
                    <div className="grid gap-3 p-3.5">
                      <div className="flex items-center gap-2 border border-[var(--bi-border)] bg-[var(--bi-table-header)] p-2.5">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[12px] font-extrabold text-[var(--bi-fg)]">
                            프리미엄 주방 설비 패키지
                          </div>
                          <div className="mt-0.5 text-[11px] text-[var(--bi-muted)]">
                            1개
                          </div>
                        </div>
                        <span className="shrink-0 border border-[var(--bi-warning)] px-2 py-0.5 text-[10px] font-bold text-[var(--bi-warning)]">
                          미연결
                        </span>
                      </div>
                    </div>
                  </PanelSection>
                  <div className="flex items-center justify-between border-t border-[var(--bi-border)] px-3.5 py-3">
                    <span className="text-[11px] text-[var(--bi-muted)]">
                      변경된 내용이 없습니다.
                    </span>
                    <Button disabled variant="secondary">
                      저장
                    </Button>
                  </div>
                </>
              ) : (
                <div className="p-6 text-[12px] text-[var(--bi-muted)]">
                  {TABS.find((tab) => tab.key === activeTab)?.label} 탭 내용
                  (로컬 데모)
                </div>
              )}
            </section>
          </div>
        </DetailModal>
      </div>
    </DetailSection>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <span className="text-[11px] font-bold text-[var(--bi-muted)]">{label}</span>
      <div className="truncate border border-[var(--bi-border)] px-2.5 py-[7px] text-[13px] text-[var(--bi-fg)]">
        {value || " "}
      </div>
    </div>
  );
}

function TeamCard({
  name,
  region,
  tone,
}: {
  name: string;
  region: string;
  tone: "추천" | "인근";
}) {
  return (
    <div className="grid gap-1 border border-[var(--bi-border)] p-2.5">
      <div className="flex items-center gap-1.5">
        <span
          className={`px-1.5 py-px text-[10px] font-bold ${
            tone === "추천"
              ? "bg-[var(--bi-accent-light)] text-[var(--bi-accent)]"
              : "bg-[var(--bi-table-header)] text-[var(--bi-muted)]"
          }`}
        >
          {tone}
        </span>
        <span className="truncate text-[13px] font-bold text-[var(--bi-fg)]">
          {name}
        </span>
      </div>
      <div className="truncate text-[11px] text-[var(--bi-muted)]">{region}</div>
      <div className="mt-0.5 text-[11px] font-bold text-[var(--bi-muted)]">
        배정하기 →
      </div>
    </div>
  );
}
