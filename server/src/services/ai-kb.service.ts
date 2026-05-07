// Admin-curated knowledge base. Plain markdown chunks the chat service
// concatenates into the system prompt so the model has authoritative
// reference text (FAQs, policies, descriptions) without hallucinating.

import { prisma } from '../config/prisma.js';
import type { AiKnowledgeBase } from '@prisma/client';

const MAX_KB_CHARS = 16000; // hard cap on what we send into the prompt

export async function listKbDocs(opts?: { onlyActive?: boolean }): Promise<AiKnowledgeBase[]> {
  return prisma.aiKnowledgeBase.findMany({
    where: opts?.onlyActive ? { active: true } : {},
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
}

export async function getKbDoc(id: string): Promise<AiKnowledgeBase | null> {
  return prisma.aiKnowledgeBase.findUnique({ where: { id } });
}

export async function createKbDoc(input: {
  title: string;
  content: string;
  active?: boolean;
  sortOrder?: number;
}): Promise<AiKnowledgeBase> {
  return prisma.aiKnowledgeBase.create({
    data: {
      title: input.title,
      content: input.content,
      active: input.active ?? true,
      sortOrder: input.sortOrder ?? 0,
    },
  });
}

export async function updateKbDoc(
  id: string,
  patch: Partial<Pick<AiKnowledgeBase, 'title' | 'content' | 'active' | 'sortOrder'>>,
): Promise<AiKnowledgeBase> {
  return prisma.aiKnowledgeBase.update({ where: { id }, data: patch });
}

export async function deleteKbDoc(id: string): Promise<void> {
  await prisma.aiKnowledgeBase.delete({ where: { id } }).catch(() => {});
}

/** Build the KB block to inject into a chat turn. Trims to MAX_KB_CHARS. */
export async function buildKbContext(): Promise<string> {
  const docs = await listKbDocs({ onlyActive: true });
  if (docs.length === 0) return '';
  let out = '';
  for (const d of docs) {
    const chunk = `### ${d.title}\n${d.content}\n\n`;
    if (out.length + chunk.length > MAX_KB_CHARS) {
      out += chunk.slice(0, MAX_KB_CHARS - out.length);
      break;
    }
    out += chunk;
  }
  return out.trim();
}
