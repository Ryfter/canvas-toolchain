import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';

export const PERSONAS_PATH = join(homedir(), '.canvas-design-mcp', 'student-personas.md');

export const PERSONAS_TEMPLATE = '# Student Personas\n\nNo personas generated yet. Call generate_student_personas to create a set.\n';

export interface GenerateStudentPersonasInput {
  count?: number;  // default 3, min 1, max 20
}

export interface GetStudentPersonasResult {
  content: string;
  exists: boolean;
}

// Weighted probability table entry — cumulative column from Student-Personas.md
export interface WeightedEntry {
  cumulative: number;
  value: string;
}

// Race/Ethnic Background — real population distribution from Student-Personas.md
export const RACE_TABLE: WeightedEntry[] = [
  { cumulative: 0.578, value: 'White' },
  { cumulative: 0.765, value: 'Hispanic/Latino' },
  { cumulative: 0.886, value: 'Black' },
  { cumulative: 0.945, value: 'Asian' },
  { cumulative: 0.956, value: 'Native American' },
  { cumulative: 0.958, value: 'Native Pacific Islander' },
  { cumulative: 0.969, value: 'Mixed Race (White and Black)' },
  { cumulative: 0.977, value: 'Mixed Race (Asian and White)' },
  { cumulative: 0.982, value: 'Mixed Race (Native American and Hispanic/Latino)' },
  { cumulative: 0.990, value: 'Mixed Race (Black and Hispanic/Latino)' },
  { cumulative: 0.996, value: 'Mixed Race (Asian and Black)' },
  { cumulative: 1.000, value: 'Adopted (choose race of student and family)' },
];

// Learning Disabilities/Challenges — real prevalence distribution from Student-Personas.md
export const DISABILITY_TABLE: WeightedEntry[] = [
  { cumulative: 0.61,  value: 'None' },
  { cumulative: 0.70,  value: 'ADHD' },
  { cumulative: 0.76,  value: 'Dyslexia' },
  { cumulative: 0.81,  value: 'Speech Impediment' },
  { cumulative: 0.85,  value: 'Anxiety' },
  { cumulative: 0.89,  value: 'Dysgraphia' },
  { cumulative: 0.93,  value: 'Mild Dyslexia' },
  { cumulative: 0.96,  value: 'Mild Anxiety' },
  { cumulative: 0.98,  value: 'Visual Processing Disorder' },
  { cumulative: 0.998, value: 'Hearing Impairment' },
  { cumulative: 1.000, value: 'Memory Retention Challenges' },
];

// The 21 non-weighted dimensions. Values sourced from AI-Personas-ideas_Student-Personas.csv,
// deduplicated and lightly cleaned. Uniform random selection (each value equally likely).
export const DIMENSION_POOLS: Record<string, string[]> = {
  age: [
    '18-year-old freshman',
    '19-year-old sophomore',
    '20-year-old sophomore',
    '21-year-old sophomore',
    '22-year-old senior',
    '23-year-old junior',
    '24-year-old graduate student',
    '26-year-old junior',
    '28-year-old PhD candidate',
    '30-year-old returning student',
    '32-year-old first-year law student',
    '35-year-old MBA student',
  ],
  familySituation: [
    'Single with no dependents',
    'Married, no children',
    'Single parent with two kids',
    'Engaged, no children',
    'Married with a toddler',
    'Living with parents',
    'Divorced with shared custody',
    'Lives on campus, single',
    'Single, caregiver for a sibling',
    'Lives with partner',
    'Lives on campus; supportive parents, one younger sibling',
    'Lives off-campus with roommates; close-knit family, one older sibling',
    'Lives at home with supportive parents who own a small business',
    'Married with two young children; supportive spouse',
    'Lives at home with working-class immigrant parents and younger siblings',
    'Lives off-campus with roommates; supportive parents, only child',
  ],
  workStudyBalance: [
    'Full-time student, no job',
    'Part-time job, full-time student',
    'Full-time job, part-time student',
    'Research assistant, full-time student',
    'Part-time retail job, full-time student',
    'Full-time job, night classes',
    'Student-athlete, full-time',
    'Full-time student with part-time campus job (10 hrs/week)',
    'Full-time student, volunteers 5–8 hours/week',
    'Full-time student with an online side business (15–20 hrs/week)',
    'Part-time student (9 credits), works full-time (40 hrs/week)',
    'Full-time student, works part-time to contribute to household income',
  ],
  previousEducation: [
    'High school valedictorian',
    'GED recipient',
    'Some college, no degree',
    'Undergraduate degree in sociology',
    'Associate degree completed',
    'Top 10% in high school',
    'Community college transfer',
    "Bachelor's degree in business",
    "Master's in biology",
    'Homeschooled background',
    "Bachelor's in history; returning after a gap",
    'Graduated high school with honors; strong STEM focus, multiple AP credits',
    'High school diploma with 3.8 GPA; active in debate and student government',
    'High school diploma; vocational courses in graphic design, self-taught in e-commerce',
    'First in family to attend college; high school diploma with a 3.5 GPA',
    'No prior college experience; first-generation college student',
  ],
  subjectStrengths: [
    'Strong in science',
    'Excels in English',
    'Good with math',
    'Skilled in research methods',
    'Good at presentations',
    'Strong in history',
    'Financial analysis',
    'Data analysis',
    'Creative writing',
    'Logic and reasoning',
    'Social studies',
    'Mathematics, physics, and computer programming',
    'Writing, sociology, political science, and critical analysis',
    'Graphic design, marketing, and digital media',
    'English composition, literature, and communication',
    'Advanced programming, data structures, and algorithms',
  ],
  subjectWeaknesses: [
    'Struggles with math',
    'Weak in science',
    'Struggles with literature',
    'Struggles with statistics',
    'Weak in analytical writing',
    'Struggles in public speaking',
    'Struggles with creative tasks',
    'Weak in technical writing',
    'Struggles with sustained focus',
    'Essay writing and public speaking',
    'Statistics and advanced mathematics',
    'Advanced calculus and complex scientific theories',
    'Adapting to new technology platforms',
    'Advanced mathematics and academic vocabulary',
  ],
  academicConfidence: [
    'Highly confident',
    'Moderate confidence',
    'Low confidence',
    'Growing confidence',
    'Very high confidence',
    'Confident in technical skills',
    'Building confidence after setbacks',
    'High in STEM, moderate in humanities',
    'High in discussions and writing',
    'High in creative work, lower in traditional exam settings',
    'Moderate; sometimes experiences imposter syndrome',
    'High, particularly in problem-solving and coding',
  ],
  shortTermGoals: [
    'Pass the class with an A',
    'Understand key concepts deeply',
    'Complete all assignments on time',
    'Publish a research finding',
    'Improve analytical writing skills',
    'Improve public speaking skills',
    'Apply course material directly to current job',
    'Pass the class with a solid grade',
    'Balance athletics and academics',
    'Maintain a 3.8 GPA and join a club',
    'Get an A in research methods and secure an internship',
    'Pass all prerequisites and get comfortable with online learning',
    'Maintain a 3.0 GPA and start using tutoring services',
    'Complete a capstone project and secure a job offer',
  ],
  longTermGoals: [
    'Aspires to be a doctor',
    'Interested in teaching at the secondary level',
    'Undecided; exploring options',
    'Wants to become a professor',
    'Aspires to manage a team in industry',
    'Planning to go to law school',
    'Aims to work in data science',
    'Seeks executive-level roles',
    'Academic research career',
    'Aspires to be a lawyer',
    'Interested in sports management',
    'Electrical engineer; tech company or renewable energy',
    'Policy analyst and social justice advocate',
    'Full-time entrepreneur and creative director',
    'Registered Nurse specializing in pediatrics or critical care',
    'Teacher or social worker',
    'Software engineer, data scientist, or cybersecurity specialist',
  ],
  confidenceLevels: [
    'High confidence overall',
    'Moderate confidence',
    'Low confidence; working to overcome self-doubt',
    'Very confident',
    'Confidence varies day-to-day',
    'Confident in academics but not social situations',
    'High, particularly in intellectual abilities',
    'High in group settings and when expressing opinions',
    'High in entrepreneurial and artistic skills; lower facing academic setbacks',
    'Building; initially low due to long break from academia',
    'Growing; gaining confidence with each small success in college',
  ],
  learningMotivation: [
    'Passionate about the subject',
    'Focused on earning the degree',
    'Driven by career advancement',
    'Wants a higher salary',
    'Wants to build a professional network',
    'Driven by personal curiosity',
    'Learning for personal growth',
    'Passionate about social justice',
    'Driven by athletic and competitive goals',
    'Intrinsic; curiosity and desire to build and innovate',
    'Intrinsic; passionate about social change',
    'Intrinsic; creativity and desire to build a business',
    'Extrinsic initially (career prospects), with growing intrinsic interest in the field',
    'Mix of extrinsic (support family) and intrinsic (personal growth)',
  ],
  engagementStyle: [
    'Proactive; asks clarifying questions',
    'Observant and reserved',
    'Active in online discussions',
    'Prefers working independently',
    'Rarely participates in open discussion',
    'Highly engaged; sits at the front',
    'Prefers small group discussions',
    'Observes and participates occasionally',
    'Proactive researcher; finds primary sources independently',
    'Rarely speaks up in class; more comfortable in writing',
    'Prefers debate and structured discussion',
    'Enjoys team-based activities and collaborative projects',
    'Engages actively in labs and problem-solving; asks clarifying questions in lectures',
    'Participates frequently in discussions; enjoys debates',
    'Engages most in project-based courses; quieter in traditional lectures',
    'Attentive listener; prefers to absorb information before contributing',
    'Asks questions in smaller groups or during office hours rather than in lecture',
  ],
  preferredLearningMethods: [
    'Hands-on activities and experimentation',
    'Visual aids and diagrams',
    'Reading textbooks and articles',
    'Listening to lectures',
    'Group activities and peer discussion',
    'Video tutorials',
    'Case studies and real-world examples',
    'Research papers and primary sources',
    'Written outlines and structured notes',
    'Hands-on labs, problem sets, and online tutorials',
    'Scholarly articles, group discussions, and writing essays',
    'Visual demonstrations, workshops, and learning by doing',
    'Online modules, practical examples, and self-paced learning',
    'One-on-one tutoring, structured lessons, and clear outlines',
  ],
  technologyComfortLevel: [
    'Very comfortable; adopts new tools quickly',
    'Prefers traditional in-person methods',
    'Comfortable with common online resources',
    'Advanced tech skills across multiple platforms',
    'Adequate; manages required tools with some effort',
    'Enjoys using digital tools to organize work',
    'Tech-savvy and adaptive to new platforms',
    'Expert in domain-specific scientific software',
    'Basic tech skills; needs help with new systems',
    'Proficient with legal and research databases',
    'Extremely high; proficient with multiple programming languages and engineering tools',
    'High; comfortable with research databases and online collaboration tools',
    'High; adept at graphic design software and social media marketing tools',
    'Moderate; comfortable with Word and email, needs guidance with new platforms',
    'Moderate; comfortable with basic computer use, needs help with specialized software',
  ],
  academicSupport: [
    'Access to a peer study group',
    'Tutors available through the institution',
    'Limited access to support services',
    'Utilizes peer study groups independently',
    'Online tutoring available',
    'Peer-led study group',
    'Attends office hours regularly',
    'Mentorship program through the department',
    'Research group support from faculty',
    'University-provided tutors',
    'Writing center and faculty office hours',
    'Access to specialized labs, research opportunities, and peer study groups',
    'Undergraduate research opportunities, writing center, and faculty mentorship',
    'Mentorship from professors in creative fields and business advising',
    'Academic advising, writing center, and technology support for online learning',
    'Tutoring in math and science, financial aid counseling, and academic coaching',
  ],
  emotionalSupport: [
    'Strong support from family',
    'Encouragement from close friends',
    'Relies on community and faith support',
    'Supportive partner',
    'Finds motivation from academic peers',
    'Relies on family support from home',
    'Spouse is a strong emotional anchor',
    'Close-knit group of college friends',
    'Strong connection to cultural community',
    'Friends with shared academic interests; uses sports and hobbies for stress relief',
    'Close friends; self-care practices and occasional counseling',
    'Creative community and understanding family; practices stress management',
    'Strong support from spouse and family; peer group of non-traditional students',
    'Family support, mentorship from older students and faculty, community resources',
  ],
  culturalBackground: [
    'First-generation college student',
    'Bilingual; embraces cultural diversity',
    'Military family background',
    'International student background',
    'Native American background influences worldview',
    'Suburban middle-class upbringing',
    'From an underrepresented community in higher education',
    'Urban upper-middle-class background',
    'Diverse international cultural perspectives',
    'Rural background; first in family to leave the region for school',
    'Ethnic minority; navigates a predominantly white institution',
    'Suburban middle-income; values practicality and hard work',
    'Strong emphasis on education and family values',
    'Values social justice and intellectual discourse',
    'Strong family ties; celebrates cultural heritage through art and food',
    'Midwestern; values hard work and self-reliance',
    'Close-knit community; values resilience, often first in family to pursue higher education',
  ],
  financialSituation: [
    'Financially stable; family covers tuition',
    'Needs to work part-time to cover expenses',
    'Receiving financial aid; budget is tight',
    'Financially independent; self-sufficient',
    'Works to afford child care alongside school',
    'Financially supported by family',
    'Self-funded entirely through part-time work',
    'Well-compensated in current career; returning to school',
    'Funded through grants and scholarships',
    'Uses student loans for tuition; manages debt carefully',
    'Financially strained; unexpected expenses are a major risk',
    'Relies on a scholarship; cannot afford to lose it',
    'Comfortable; tuition covered by parents, part-time job for spending money',
    'Stable; some financial aid, parents provide supplemental support',
    'Variable; relies on business income and some parental support',
    'Strained; relies on financial aid and full-time work, manages a very tight budget',
    'Strained; relies heavily on financial aid, often helps support family financially',
  ],
  responsivenessToFeedback: [
    'Actively seeks out feedback',
    'Handles feedback well without defensiveness',
    'Appreciates constructive feedback when it is specific',
    'Values feedback primarily from professors',
    'Finds critical feedback difficult to process emotionally',
    'Open to feedback from any source',
    'Welcomes constructive criticism and acts on it quickly',
    'Enjoys feedback as a tool to refine skills',
    'Feedback-driven; tracks progress against prior critiques',
    'Finds feedback motivating; uses it to set new goals',
    'Values detailed, written feedback over verbal comments',
    'Highly responsive; seeks feedback to improve and refine understanding',
    'Very responsive; thrives on constructive criticism to strengthen arguments',
    'Responsive in creative critiques; can be sensitive to purely subjective criticism',
    'Highly responsive; eager to learn, seeks clear and actionable feedback',
    'Responsive, but hesitant to ask for clarification; benefits from explicit encouragement',
  ],
  growthMindset: [
    'Open to learning from mistakes',
    'Growth-oriented; embraces challenges',
    'Shows perseverance through setbacks',
    'Views setbacks as learning opportunities',
    'Willing to try new strategies when stuck',
    'Always seeks ways to improve',
    'Sees challenges as chances to grow',
    'Highly resilient and adaptive',
    'Passionate about continuous self-improvement',
    'Seeks gradual, steady improvement over time',
    'Strong growth mindset; views challenges as opportunities to develop new skills',
    'Strong growth mindset; actively seeks new knowledge and changing perspectives',
    'Strong growth mindset; constantly iterating on ideas and learning from failures',
    'Strong growth mindset; determined to master new subjects returning to school',
    'Developing growth mindset; working to overcome self-doubt and embrace learning',
  ],
  timeManagement: [
    'Balances school and social life well',
    'Struggles to meet deadlines consistently',
    'Must juggle work, children, and school simultaneously',
    'Organized and plans ahead reliably',
    'Finds it hard to stay organized without structure',
    'Easily distracted; struggles with long reading assignments',
    'Manages time effectively; rarely behind',
    'Tight schedule; well-organized with strict routines',
    'Juggles research and coursework with few conflicts',
    'Sometimes misses deadlines during high-stress periods',
    'Tightly manages limited time; little room for error',
    'Needs flexibility in deadlines due to unpredictable schedule',
    'Excellent; uses a digital planner, schedules study blocks, rarely procrastinates',
    'Very good; balances academics, volunteering, and social life with a detailed planner',
    'Variable; prioritizes business tasks, sometimes sacrifices sleep for schoolwork',
    'Excellent; highly organized due to family and work commitments, uses strict schedules',
    'Challenged; struggles with balancing work, family obligations, and studies',
  ],
};

// Compare a single Math.random() draw against the cumulative table.
// The last entry must have cumulative === 1.0 to guarantee a match.
export function weightedSample(table: WeightedEntry[]): string {
  const r = Math.random();
  for (const entry of table) {
    if (r < entry.cumulative) return entry.value;
  }
  return table[table.length - 1].value;
}

// Uniform random pick from an array. All values are equally likely.
export function poolSample(pool: string[]): string {
  return pool[Math.floor(Math.random() * pool.length)];
}

function ensureDir(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

// Samples all 23 dimensions and formats one persona as a Markdown section.
// index is 1-based (Persona 1, Persona 2, ...).
function buildPersona(index: number): string {
  return [
    `## Persona ${index}`,
    '',
    `- **Age:** ${poolSample(DIMENSION_POOLS.age)}`,
    `- **Family Situation:** ${poolSample(DIMENSION_POOLS.familySituation)}`,
    `- **Work and Study Balance:** ${poolSample(DIMENSION_POOLS.workStudyBalance)}`,
    `- **Previous Education:** ${poolSample(DIMENSION_POOLS.previousEducation)}`,
    `- **Subject Strengths:** ${poolSample(DIMENSION_POOLS.subjectStrengths)}`,
    `- **Subject Weaknesses:** ${poolSample(DIMENSION_POOLS.subjectWeaknesses)}`,
    `- **Academic Confidence:** ${poolSample(DIMENSION_POOLS.academicConfidence)}`,
    `- **Short-Term Goals:** ${poolSample(DIMENSION_POOLS.shortTermGoals)}`,
    `- **Long-Term Goals:** ${poolSample(DIMENSION_POOLS.longTermGoals)}`,
    `- **Confidence Levels:** ${poolSample(DIMENSION_POOLS.confidenceLevels)}`,
    `- **Learning Motivation:** ${poolSample(DIMENSION_POOLS.learningMotivation)}`,
    `- **Engagement Style:** ${poolSample(DIMENSION_POOLS.engagementStyle)}`,
    `- **Preferred Learning Methods:** ${poolSample(DIMENSION_POOLS.preferredLearningMethods)}`,
    `- **Technology Comfort Level:** ${poolSample(DIMENSION_POOLS.technologyComfortLevel)}`,
    `- **Academic Support:** ${poolSample(DIMENSION_POOLS.academicSupport)}`,
    `- **Emotional Support:** ${poolSample(DIMENSION_POOLS.emotionalSupport)}`,
    `- **Cultural Background:** ${poolSample(DIMENSION_POOLS.culturalBackground)}`,
    `- **Financial Situation:** ${poolSample(DIMENSION_POOLS.financialSituation)}`,
    `- **Responsiveness to Feedback:** ${poolSample(DIMENSION_POOLS.responsivenessToFeedback)}`,
    `- **Growth Mindset:** ${poolSample(DIMENSION_POOLS.growthMindset)}`,
    `- **Time Management:** ${poolSample(DIMENSION_POOLS.timeManagement)}`,
    `- **Race/Ethnic Background:** ${weightedSample(RACE_TABLE)}`,
    `- **Learning Disabilities/Challenges:** ${weightedSample(DISABILITY_TABLE)}`,
  ].join('\n');
}

export function generateStudentPersonas(
  input: GenerateStudentPersonasInput,
  personasPath = PERSONAS_PATH,
): string {
  const count = Math.min(20, Math.max(1, input.count ?? 3));
  const date = new Date().toISOString().slice(0, 10);
  const personas = Array.from({ length: count }, (_, i) => buildPersona(i + 1));
  const content = `# Student Personas\n\nGenerated: ${date} | Count: ${count}\n\n${personas.join('\n\n')}\n`;
  ensureDir(personasPath);
  writeFileSync(personasPath, content, 'utf-8');
  return `✓ Generated ${count} student persona${count === 1 ? '' : 's'} and saved to ${personasPath}\n\n${content}`;
}

export function getStudentPersonas(personasPath = PERSONAS_PATH): GetStudentPersonasResult {
  if (!existsSync(personasPath)) {
    return { content: PERSONAS_TEMPLATE, exists: false };
  }
  try {
    return { content: readFileSync(personasPath, 'utf-8'), exists: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Cannot read student personas file: ${message}. Call generate_student_personas to rebuild.`);
  }
}
