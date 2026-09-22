// 최초 등록 명령 전용. 런타임 메뉴와 권한은 DB를 읽는다.
/** 사용자가 선택한 개인 프로젝트 목록. 배포 환경에서도 같은 목록을 사용한다. */
export const personalProjects = [
  { slug: "personal-flight-app", title: "해봉티켓", group: "portfolio", repositories: ["flight-app"] },
  { slug: "personal-ilchul", title: "일출", group: "portfolio", repositories: ["ilchul"] },
  { slug: "personal-conkiri", title: "콘끼리", group: "portfolio", repositories: ["conkiri/infra", "conkiri/frontend", "conkiri/backend"] },
  { slug: "personal-memonogi", title: "메모노기", group: "portfolio", repositories: ["memonogi/devnogi-auth-server", "memonogi/devnogi-infra-prod"] },
  { slug: "personal-project-management", title: "project-management", group: "toy", repositories: ["project-management"] },
  { slug: "personal-youtube-sync", title: "youtube-sync", group: "toy", repositories: ["youtube-sync"] },
];
