import matter from 'gray-matter';

export interface ParsedBrief {
  data: Record<string, unknown>;
  body: string;
}

export function parseBriefFile(content: string): ParsedBrief {
  const { data, content: body } = matter(content);
  return { data: data as Record<string, unknown>, body };
}

export function serializeBriefFile(data: Record<string, unknown>, body: string): string {
  return matter.stringify(body, data);
}
