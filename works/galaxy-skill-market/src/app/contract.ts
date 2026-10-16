/** Public display-only contract. No authentication, ownership or execution fields. */
export type Locale = 'en' | 'zh';
export type SkillType = 'task' | 'role';
export type HistoryPoint = { date: string; count: number };
export type SkillUsage = { calls: number; successes: number; upvotes: number };
export type SkillSummary = {
  skill_id: string;
  name: string;
  name_en: string;
  name_zh: string;
  description_en: string;
  description_zh: string;
  skill_type: SkillType;
  category: string;
  structured_summary: { subject: string[]; function: string[] };
  install_count: number;
  install_history: HistoryPoint[];
  usage: SkillUsage;
  example_en: string;
  example_zh: string;
};
export type SkillTreeNode = {
  label_en: string; label_zh: string; count: number;
  skills?: SkillSummary[]; children?: Record<string, SkillTreeNode>;
};
export type SkillTreeResponse = {
  tree: Record<string, SkillTreeNode>;
  uncategorized: SkillTreeNode;
};
export function displayName(skill: SkillSummary, locale: Locale) {
  return locale === 'zh' ? skill.name_zh : skill.name_en;
}
export function displayDescription(skill: SkillSummary, locale: Locale) {
  return locale === 'zh' ? skill.description_zh : skill.description_en;
}
