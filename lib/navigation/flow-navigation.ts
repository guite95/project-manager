/** 메뉴·검색에 필요한 데이터만 전달한다. 그래프 본문은 선택한 차트 페이지에서 읽는다. */
export type FlowNavigationChart = { slug: string; title: string; description?: string };
export type FlowNavigationCategory = { slug: string; title: string; charts: FlowNavigationChart[] };
export type FlowNavigationProject = { slug: string; title: string; categories: FlowNavigationCategory[] };
