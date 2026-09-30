import type { PortfolioLink, PublicPortfolioContent } from '@/lib/public-portfolio';
import styles from './public-portfolio.module.css';

function ExternalLinks({ links }: { links: PortfolioLink[] }) {
  return <div className={styles.links}>{links.map((link, index) => <a key={index} href={link.url} target="_blank" rel="noopener noreferrer">{link.label}<span aria-hidden="true">↗</span></a>)}</div>;
}
export function PublicPortfolioView({ content }: { content: PublicPortfolioContent }) {
  return <div className={styles.page}>
    <a className={styles.skip} href="#about">본문으로 바로가기</a>
    <header className={styles.header}><a href="#about" className={styles.wordmark}>{content.name}<span>PORTFOLIO</span></a><nav aria-label="포트폴리오 목차"><a href="#strengths">역량</a><a href="#projects">프로젝트</a><a href="#activities">활동</a></nav></header>
    <main className={styles.main}>
      <section id="about" className={styles.hero} aria-labelledby="portfolio-title">
        <p className={styles.eyebrow}>BACKEND · SYSTEMS · OPERATIONS</p>
        <h1 id="portfolio-title">{content.name}<span>{content.headline}</span></h1>
        <div className={styles.introduction}>{content.introduction.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
        <ExternalLinks links={content.links} />
        <a className={styles.projectCta} href="#projects">프로젝트 살펴보기 <span aria-hidden="true">↓</span></a>
      </section>
      {!!content.strengths.length && <section id="strengths" className={styles.section} aria-labelledby="strengths-title">
        <div className={styles.sectionHeading}><p className={styles.eyebrow}>01 / HOW I WORK</p><h2 id="strengths-title">핵심 역량</h2></div>
        <div className={styles.strengths}>{content.strengths.map((item, index) => <article key={index}><span className={styles.number}>{String(index + 1).padStart(2, '0')}</span><h3>{item.title}</h3><p>{item.body}</p></article>)}</div>
      </section>}
      {!!content.skills.length && <section className={styles.section} aria-labelledby="skills-title">
        <div className={styles.sectionHeading}><p className={styles.eyebrow}>02 / TOOLKIT</p><h2 id="skills-title">기술 스택</h2></div>
        <div className={styles.skills}>{content.skills.map((group, index) => <div key={index}><h3>{group.title}</h3><div className={styles.tags}>{group.items.map((item, i) => <span key={i}>{item}</span>)}</div></div>)}</div>
      </section>}
      {!!content.projects.length && <section id="projects" className={styles.section} aria-labelledby="projects-title">
        <div className={styles.sectionHeading}><p className={styles.eyebrow}>03 / SELECTED WORK</p><h2 id="projects-title">프로젝트</h2></div>
        <div className={styles.projects}>{content.projects.map((project, index) => <article key={project.id} id={`project-${project.id}`} className={styles.project}>
          <div className={styles.projectOverview}><p className={styles.projectCategory}>{String(index + 1).padStart(2, '0')} / {project.category}</p><h3>{project.title}</h3><p>{project.description}</p><ExternalLinks links={project.links} /></div>
          <div className={styles.projectDetail}><p className={styles.role}><span>담당 역할</span>{project.role}</p><ul>{project.highlights.map((highlight, i) => <li key={i}>{highlight}</li>)}</ul><div className={styles.tags}>{project.stack.map((item, i) => <span key={i}>{item}</span>)}</div></div>
        </article>)}</div>
      </section>}
      {!!content.activities.length && <section id="activities" className={styles.section} aria-labelledby="activities-title">
        <div className={styles.sectionHeading}><p className={styles.eyebrow}>04 / BACKGROUND</p><h2 id="activities-title">교육과 활동</h2></div>
        <div className={styles.activities}>{content.activities.map((item, index) => <article key={index}><p className={styles.period}>{item.period}</p><div><h3>{item.title}</h3><p>{item.detail}</p></div></article>)}</div>
      </section>}
    </main>
    <footer className={styles.footer}><p>{content.name} · Portfolio</p><a href="#about">맨 위로 ↑</a></footer>
  </div>;
}
