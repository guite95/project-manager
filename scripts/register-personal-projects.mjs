#!/usr/bin/env node
import { prisma } from '../lib/db.ts';
import { personalProjects } from '../lib/personal-projects.ts';

const action = process.argv[2] ?? 'inspect';
try {
  if (!['inspect', 'apply'].includes(action)) throw new Error('inspect 또는 apply를 지정하세요.');
  const slugs = personalProjects.map(project => project.slug);
  const result = await prisma.$transaction(async tx => {
    const existing = await tx.flowProject.findMany({ where: { slug: { in: slugs } } });
    for (const row of existing) {
      if (row.title !== personalProjects.find(project => project.slug === row.slug)?.title)
        throw new Error('기존 프로젝트 식별자가 충돌합니다. 내용을 확인하세요.');
    }
    const missing = personalProjects.filter(project => !existing.some(row => row.slug === project.slug));
    if (action === 'apply') {
      const last = await tx.flowProject.aggregate({ _max: { position: true } });
      await tx.flowProject.createMany({ data: missing.map((project, index) => ({
        ...project, position: (last._max.position ?? -1) + index + 1,
      })) });
    }
    return { action, existing: existing.length, missing: missing.map(project => project.slug), inserted: action === 'apply' ? missing.length : 0 };
  }, { isolationLevel: 'Serializable' });
  console.log(JSON.stringify(result));
} catch (error) {
  console.error('개인 프로젝트 등록 실패. DB 연결 또는 기존 식별자 충돌을 확인하세요.');
  process.exitCode = 1;
} finally { await prisma.$disconnect(); }
