import { RecruitmentError } from './recruitment.ts';

export const publicPortfolioKey = 'recruitment:public-portfolio';
export type PortfolioLink = { label: string; url: string };
export type PortfolioProject = {
  id: string; title: string; category: string; description: string; role: string;
  highlights: string[]; stack: string[]; links: PortfolioLink[];
};
export type PublicPortfolioContent = {
  name: string; headline: string; introduction: string[]; links: PortfolioLink[];
  strengths: { title: string; body: string }[];
  skills: { title: string; items: string[] }[];
  projects: PortfolioProject[];
  activities: { title: string; detail: string; period: string }[];
};
export type PublicPortfolioInput = { published: boolean; content: PublicPortfolioContent };
export type PublicPortfolio = PublicPortfolioInput & { revision: number; updatedAt: string | null };

const object = (input: unknown): Record<string, unknown> => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new RecruitmentError('포트폴리오 내용을 확인하세요.');
  return input as Record<string, unknown>;
};
function string(input: unknown, label: string, max: number, required = true): string {
  if (typeof input !== 'string' || input.length > max || required && !input.trim()) throw new RecruitmentError(`${label}을 확인하세요. (최대 ${max}자)`);
  return input.trim();
}
function list<T>(input: unknown, label: string, max: number, parse: (value: unknown) => T, min = 0): T[] {
  if (!Array.isArray(input) || input.length < min || input.length > max) throw new RecruitmentError(`${label}은 ${min}~${max}개까지 입력할 수 있습니다.`);
  return input.map(parse);
}
function links(input: unknown): PortfolioLink[] {
  return list(input, '링크', 5, value => {
    const row = object(value);
    const url = string(row.url, '링크 주소', 2000);
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error();
    } catch { throw new RecruitmentError('링크는 인증 정보가 없는 https 주소로 입력하세요.'); }
    return { label: string(row.label, '링크 이름', 50), url };
  });
}
// 공개 전용 필드만 새 객체로 만든다. 이력서·지원용 정보·원본 출처는 자동으로 합치지 않는다.
export function parsePublicPortfolioContent(input: unknown): PublicPortfolioContent {
  const row = object(input);
  const content: PublicPortfolioContent = {
    name: string(row.name, '이름', 100), headline: string(row.headline, '한 줄 소개', 200),
    introduction: list(row.introduction, '소개 문단', 5, value => string(value, '소개', 2000), 1),
    links: links(row.links),
    strengths: list(row.strengths, '핵심 역량', 6, value => {
      const item = object(value);
      return { title: string(item.title, '역량 제목', 100), body: string(item.body, '역량 설명', 2000) };
    }),
    skills: list(row.skills, '기술 분야', 6, value => {
      const item = object(value);
      return { title: string(item.title, '기술 분야', 100), items: list(item.items, '기술', 20, value => string(value, '기술 이름', 60), 1) };
    }),
    projects: list(row.projects, '프로젝트', 20, value => {
      const item = object(value);
      const id = string(item.id, '프로젝트 ID', 80);
      if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new RecruitmentError('프로젝트 ID는 영문·숫자·밑줄·하이픈으로 입력하세요.');
      return {
        id, title: string(item.title, '프로젝트 이름', 150), category: string(item.category, '프로젝트 구분', 100),
        description: string(item.description, '프로젝트 소개', 2000), role: string(item.role, '담당 역할', 300),
        highlights: list(item.highlights, '주요 작업', 10, value => string(value, '주요 작업', 2000), 1),
        stack: list(item.stack, '프로젝트 기술', 20, value => string(value, '기술 이름', 60)), links: links(item.links),
      };
    }),
    activities: list(row.activities, '교육·활동', 15, value => {
      const item = object(value);
      return { title: string(item.title, '활동 제목', 150), detail: string(item.detail, '활동 설명', 2000), period: string(item.period, '활동 기간', 100, false) };
    }),
  };
  if (new Set(content.projects.map(item => item.id)).size !== content.projects.length) throw new RecruitmentError('프로젝트 ID가 중복됩니다.');
  if (JSON.stringify(content).length > 80_000) throw new RecruitmentError('공개 포트폴리오는 총 80,000자까지 저장할 수 있습니다.', 413);
  return content;
}
export function parsePublicPortfolio(input: unknown): PublicPortfolioInput {
  const row = object(input);
  if (typeof row.published !== 'boolean') throw new RecruitmentError('공개 여부를 확인하세요.');
  return { published: row.published, content: parsePublicPortfolioContent(row.content) };
}
