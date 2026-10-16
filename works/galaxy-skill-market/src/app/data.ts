import type { SkillSummary, SkillTreeResponse } from './contract';

/** Deliberately synthetic examples: no production catalog or account data. */
export const categories = [
  { id: 'math', en: 'Math & logic', zh: '数学与逻辑' },
  { id: 'code', en: 'Code & data', zh: '编程与数据' },
  { id: 'science', en: 'Science', zh: '科学探索' },
  { id: 'language', en: 'Language & writing', zh: '语言与写作' },
  { id: 'art', en: 'Art & design', zh: '艺术与设计' },
  { id: 'learning', en: 'Learning', zh: '学习方法' },
];
type Entry = [string, string, string, string, string, string, string];
const entries: Entry[] = [
  ['geometry', 'Geometry lens', '几何视角', 'Explore a shape through visual reasoning and small steps.', '从图形出发，用直觉与步骤理解几何。', 'Explain why the angles of a triangle add up to 180°.', '用图形解释三角形的内角和为什么是 180°。'],
  ['proof', 'Proof builder', '证明构建', 'Turn an intuition into a clear chain of logical arguments.', '把一个直觉整理为清晰的逻辑论证。', 'Help me structure a proof by induction.', '帮我整理数学归纳法证明的步骤。'],
  ['probability', 'Chance explorer', '概率探索', 'Compare possible outcomes with approachable examples.', '用易懂的例子比较不同结果的可能性。', 'Explain conditional probability with a card game.', '通过纸牌游戏解释条件概率。'],
  ['math-guide', 'Socratic guide', '苏格拉底向导', 'A patient guide who asks questions before offering answers.', '先提问、再启发思考的耐心学习伙伴。', 'Ask me one question at a time about this equation.', '围绕这道方程，一次问我一个问题。'],
  ['code-review', 'Code companion', '代码伙伴', 'Read a small function and suggest focused improvements.', '阅读小段代码，提出聚焦而具体的改进建议。', 'Review this sorting function for readability.', '从可读性的角度检查这个排序函数。'],
  ['data-story', 'Data storyteller', '数据叙事', 'Find a readable narrative in a small table of numbers.', '从小型数据表中提炼清晰易读的叙事。', 'Suggest a chart for these monthly totals.', '为这组月度汇总数据推荐图表。'],
  ['debug-map', 'Debug map', '调试地图', 'Break an unexpected result into testable hypotheses.', '把异常结果拆成可以逐一验证的假设。', 'Help me isolate why this loop never ends.', '帮我定位这个循环为什么不会结束。'],
  ['code-mentor', 'Pair programmer', '结对程序员', 'A collaborative coding partner who explains each decision.', '解释每一步选择的协作编程伙伴。', 'Walk through a small component with me.', '和我一起梳理一个小组件。'],
  ['experiment', 'Experiment sketch', '实验草图', 'Shape a question into a simple, observable experiment.', '把问题转化为简单、可观察的实验。', 'Design a safe experiment about plant growth.', '设计一个关于植物生长的安全实验。'],
  ['systems', 'Systems lens', '系统视角', 'Trace how parts of a system influence one another.', '追踪系统中不同部分之间的相互影响。', 'Map the feedback loops in a local ecosystem.', '梳理一个生态系统中的反馈循环。'],
  ['research-notes', 'Research notes', '研究笔记', 'Organize a topic into questions, evidence and open points.', '围绕主题整理问题、证据与待解之处。', 'Outline notes for a lesson on renewable energy.', '为可再生能源课程整理笔记提纲。'],
  ['science-guide', 'Curious scientist', '好奇科学家', 'An inquisitive conversation partner for everyday science.', '陪你探究日常科学问题的好奇伙伴。', 'Why does a metal spoon feel colder than wood?', '为什么金属勺摸起来比木头更冷？'],
  ['writing', 'Draft studio', '写作工坊', 'Develop an idea into a concise, well-structured draft.', '把想法展开为简洁且有结构的初稿。', 'Help me outline an essay about public spaces.', '帮我为公共空间主题文章拟定提纲。'],
  ['language-lab', 'Language lab', '语言实验室', 'Practice phrasing and discover how meaning changes.', '练习表达，发现措辞如何改变含义。', 'Give three natural ways to make this request.', '给出三种自然表达这个请求的方式。'],
  ['story', 'Story seeds', '故事种子', 'Explore characters, settings and a possible first scene.', '探索人物、场景与一个可能的开篇。', 'Suggest an opening scene in a quiet train station.', '为安静火车站里的故事构思开场。'],
  ['editor', 'Thoughtful editor', '细心编辑', 'A constructive reader who asks what the writing needs.', '关注文章真正需要什么的建设性读者。', 'Ask me about the audience before editing.', '修改前，先询问文章的读者是谁。'],
  ['palette', 'Color study', '色彩研究', 'Explore a color relationship and its visual mood.', '探索色彩关系与它带来的视觉感受。', 'Describe a calm palette for a reading app.', '描述适合阅读应用的平静配色。'],
  ['composition', 'Composition desk', '构图工作台', 'Find hierarchy, rhythm and balance in an arrangement.', '在排列中寻找层级、节奏与平衡。', 'Suggest three compositions for a poster.', '为一张海报提出三种构图方向。'],
  ['interface', 'Interface sketch', '界面草图', 'Turn a user need into a small interface concept.', '把用户需求转化为一个小型界面构想。', 'Sketch a simple reading progress control.', '构思一个简单的阅读进度控件。'],
  ['design-peer', 'Design peer', '设计同伴', 'A curious peer who discusses a design and its tradeoffs.', '与你讨论设计选择与取舍的好奇同伴。', 'Discuss the hierarchy of this page with me.', '与我讨论这个页面的信息层级。'],
  ['study-plan', 'Study rhythm', '学习节奏', 'Break a learning goal into manageable sessions.', '把学习目标拆成容易执行的小节。', 'Plan five short sessions to learn the basics.', '规划五次短时学习来掌握基础。'],
  ['reflection', 'Reflection journal', '反思日志', 'Look back on an attempt and choose a useful next step.', '回顾一次尝试，选择有帮助的下一步。', 'Help me reflect on what I found difficult today.', '帮我回顾今天学习中遇到的困难。'],
  ['recall', 'Recall cards', '回忆卡片', 'Turn a few notes into prompts for active recall.', '把少量笔记转换成主动回忆的问题。', 'Make four recall prompts from this paragraph.', '根据这段文字设计四个回忆问题。'],
  ['learning-coach', 'Learning coach', '学习教练', 'An encouraging partner for setting realistic learning goals.', '陪你制定切实学习目标的鼓励型伙伴。', 'Help me choose one small goal for this week.', '帮我为本周选择一个小目标。'],
];

export const skills: SkillSummary[] = entries.map(([id, en, zh, descriptionEn, descriptionZh, exampleEn, exampleZh], index) => {
  const category = categories[Math.floor(index / 4)].id;
  const installs = 280 + ((index * 719) % 5400);
  const calls = 980 + ((index * 1103) % 18000);
  return {
    skill_id: id, name: en, name_en: en, name_zh: zh,
    description_en: descriptionEn, description_zh: descriptionZh,
    category, skill_type: index % 4 === 3 ? 'role' : 'task',
    structured_summary: { subject: [category], function: [['explain', 'analyze', 'create', 'practice'][index % 4]] },
    install_count: installs,
    install_history: Array.from({ length: 8 }, (_, month) => ({ date: `2026-${String(month + 1).padStart(2, '0')}-01`, count: Math.round(installs * (0.12 + month * 0.88 / 7)) })),
    usage: { calls, successes: Math.round(calls * (0.88 + (index % 9) * 0.01)), upvotes: 20 + index * 13 },
    example_en: exampleEn, example_zh: exampleZh,
  };
});
export const defaultInstalled = ['geometry', 'data-story', 'systems'];
export function makeTree(items: SkillSummary[]): SkillTreeResponse {
  return {
    tree: Object.fromEntries(categories.map(category => {
      const children = items.filter(skill => skill.category === category.id);
      return [category.id, { label_en: category.en, label_zh: category.zh, count: children.length, skills: children }];
    }).filter(([, value]) => (value as { count: number }).count)),
    uncategorized: { label_en: 'Uncategorized', label_zh: '未分类', count: 0, skills: [] },
  };
}
